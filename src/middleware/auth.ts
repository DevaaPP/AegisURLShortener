import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { db } from '../services/db';
import { redis } from '../services/redis';

export interface AuthenticatedUser {
  id: number;
  email: string;
  apiKey?: string;
}

// Extend Request interface to hold user info
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Authentication middleware that supports API Key (for machines) and JWT (for dashboard users)
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // 1. Check for API Key in X-API-Key header
    const apiKey = req.header('X-API-Key');
    if (apiKey) {
      const cachedUserId = await redis.getClient().get(`apikey:user:${apiKey}`);
      
      if (cachedUserId) {
        // Cache hit: fetch email from Redis cache or store full user in Redis cache
        const cachedUserStr = await redis.getClient().get(`user:${cachedUserId}`);
        if (cachedUserStr) {
          req.user = JSON.parse(cachedUserStr);
          return next();
        }
      }

      // Cache miss: query PostgreSQL database
      const result = await db.query(
        'SELECT id, email, api_key FROM users WHERE api_key = $1 LIMIT 1',
        [apiKey]
      );

      if (result.rows.length > 0) {
        const dbUser = result.rows[0];
        const userPayload: AuthenticatedUser = {
          id: dbUser.id,
          email: dbUser.email,
          apiKey: dbUser.api_key,
        };

        // Cache resolution in Redis
        const rClient = redis.getClient();
        await rClient.set(`apikey:user:${apiKey}`, dbUser.id.toString(), { EX: 3600 }); // Cache key mapping for 1 hour
        await rClient.set(`user:${dbUser.id}`, JSON.stringify(userPayload), { EX: 3600 }); // Cache user details for 1 hour

        req.user = userPayload;
        return next();
      }
    }

    // 2. Check for JWT token in Authorization header
    const authHeader = req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, config.jwtSecret) as { id: number; email: string };
        
        // Fetch user from Redis or Postgres
        const rClient = redis.getClient();
        const cachedUserStr = await rClient.get(`user:${decoded.id}`);
        
        if (cachedUserStr) {
          req.user = JSON.parse(cachedUserStr);
          return next();
        }

        const result = await db.query(
          'SELECT id, email, api_key FROM users WHERE id = $1 LIMIT 1',
          [decoded.id]
        );

        if (result.rows.length > 0) {
          const dbUser = result.rows[0];
          const userPayload: AuthenticatedUser = {
            id: dbUser.id,
            email: dbUser.email,
            apiKey: dbUser.api_key,
          };
          
          await rClient.set(`user:${dbUser.id}`, JSON.stringify(userPayload), { EX: 3600 });
          
          req.user = userPayload;
          return next();
        }
      } catch (jwtError: any) {
        console.error('JWT Verification failed:', jwtError.message || jwtError);
        res.status(401).json({ success: false, error: 'Unauthorized', message: 'Invalid token.' });
        return;
      }
    }

    // If neither is present, proceed (endpoints can choose whether to reject based on requireAuth)
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}

/**
 * Enforces authentication on specific routes
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Access denied. Valid API Key (X-API-Key) or JWT Token required.',
    });
    return;
  }
  next();
}
