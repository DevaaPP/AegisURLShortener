import app from '../src/app';
import { db } from '../src/services/db';
import { redis } from '../src/services/redis';

let isInitialized = false;

async function bootstrap() {
  if (!isInitialized) {
    console.log('Lazy initializing database and cache connections for serverless runtime...');
    try {
      await db.initializeDatabase();
    } catch (dbErr) {
      console.warn('Database schema initialization warning (likely concurrent conflict):', dbErr);
    }
    try {
      await redis.connect();
    } catch (redisErr) {
      console.error('Redis connection failure during bootstrap:', redisErr);
    }
    isInitialized = true;
  }
}

// Intercept requests with a middleware to ensure Postgres and Redis are fully connected
app.use(async (req, res, next) => {
  try {
    await bootstrap();
    next();
  } catch (err) {
    console.error('Bootstrap middleware failure:', err);
    next(err);
  }
});

// Export the Express app instance directly (Vercel Node runtime native support)
export default app;
