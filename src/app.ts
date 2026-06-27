import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authenticate, requireAuth } from './middleware/auth';
import { rateLimiter } from './middleware/rateLimiter';
import { registerUser, loginUser, shortenUrl, redirectUrl } from './controllers/shortener';
import { getLinkAnalytics, getUserLinks } from './controllers/analytics';
import { db } from './services/db';
import { redis } from './services/redis';

import path from 'path';

const app = express();

// Trust reverse proxies (Vercel, Cloudflare, etc.) to extract correct client IPs and protocol headers
app.set('trust proxy', true);

// 1. Security & Utility Middlewares
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows CDN scripts like Chart.js to load without blocking
  })
);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

// 2. Global Authentication Parser (runs on all API calls, populates req.user if token/API key exists)
app.use('/api', authenticate);

// 3. Health Check Endpoint (For monitoring & zero-downtime health probes)
app.get('/health', async (req, res) => {
  try {
    // Check Database connectivity
    await db.query('SELECT 1');
    // Check Redis connectivity
    const redisClient = redis.getClient();
    await redisClient.ping();

    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        cache: 'connected',
      },
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message || error,
    });
  }
});

// 4. SaaS Authentication & Registration Router
app.post('/api/v1/auth/register', rateLimiter({ windowSizeInSeconds: 60, maxRequests: 5 }), registerUser);
app.post('/api/v1/auth/login', rateLimiter({ windowSizeInSeconds: 60, maxRequests: 10 }), loginUser);

// 5. URL Shortening API (Requires API Key or JWT Auth)
// Rate limited to 30 requests per minute to prevent SaaS abuse
app.post(
  '/api/v1/shorten',
  requireAuth,
  rateLimiter({ windowSizeInSeconds: 60, maxRequests: 30 }),
  shortenUrl
);

// 6. Analytics API (Requires Auth)
app.get(
  '/api/v1/analytics/:code',
  requireAuth,
  rateLimiter({ windowSizeInSeconds: 60, maxRequests: 60 }),
  getLinkAnalytics
);
app.get(
  '/api/v1/links',
  requireAuth,
  rateLimiter({ windowSizeInSeconds: 60, maxRequests: 60 }),
  getUserLinks
);

// 7. Core Public Redirection Endpoint
// High rate-limits allowed to support heavy web traffic, but throttled to prevent DDoS enumeration (120 reqs/min)
app.get('/:code', rateLimiter({ windowSizeInSeconds: 60, maxRequests: 120 }), redirectUrl);

// 8. Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred.',
  });
});

export default app;
