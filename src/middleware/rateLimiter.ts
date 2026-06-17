import { Request, Response, NextFunction } from 'express';
import { redis } from '../services/redis';

interface RateLimiterOptions {
  windowSizeInSeconds: number;
  maxRequests: number;
}

/**
 * High-performance sliding-window rate limiter using Redis Sorted Sets (ZSET)
 */
export function rateLimiter(options: RateLimiterOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const client = redis.getClient();
      
      // Rate limit by API key if authenticated, fallback to IP address
      const identifier = (req as any).user?.apiKey || req.ip || 'unknown';
      const key = `rate:${identifier}:${req.path}`;
      
      const now = Date.now();
      const windowStart = now - options.windowSizeInSeconds * 1000;

      // Executing a transactional multi-command block in Redis
      const multi = client.multi();
      
      // 1. Remove timestamps older than the sliding window start
      multi.zRemRangeByScore(key, 0, windowStart);
      
      // 2. Add current timestamp to the sorted set
      // Use now as both score and value (value must be string/unique, so append random or fine-grained counter to be unique if needed)
      // Since Node.js can handle concurrent hits at identical milliseconds, we add a random suffix to the value to keep it unique in the set.
      const uniqueValue = `${now}-${Math.random().toString(36).substring(2, 7)}`;
      multi.zAdd(key, { score: now, value: uniqueValue });
      
      // 3. Count the remaining active timestamps in the set
      multi.zCard(key);
      
      // 4. Set TTL on the set key so it self-cleans if the user stops making requests
      multi.expire(key, options.windowSizeInSeconds);

      const results = await multi.exec();
      
      // zCard output is at index 2
      const requestCount = results[2] as number;

      // Set headers for tracking
      res.setHeader('X-RateLimit-Limit', options.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, options.maxRequests - requestCount));
      res.setHeader('X-RateLimit-Reset', new Date(now + options.windowSizeInSeconds * 1000).toISOString());

      if (requestCount > options.maxRequests) {
        res.status(429).json({
          success: false,
          error: 'Too Many Requests',
          message: `API rate limit exceeded. Please try again in ${options.windowSizeInSeconds} seconds.`,
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Rate Limiter Error:', error);
      // Fail-open: allow request to proceed if Redis rate limiter fails to prevent site outage
      next();
    }
  };
}
export default rateLimiter;
