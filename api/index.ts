import app from '../src/app';
import { db } from '../src/services/db';
import { redis } from '../src/services/redis';

let isDbInitialized = false;

async function bootstrap() {
  // 1. Initialize DB schema once on container start (cold-start)
  if (!isDbInitialized) {
    try {
      await db.initializeDatabase();
      isDbInitialized = true;
    } catch (dbErr) {
      console.warn('Database schema initialization warning (likely concurrent conflict):', dbErr);
    }
  }

  // 2. Ensure Redis is connected on every request (reconnects if connection was dropped during serverless pause)
  try {
    await redis.connect();
  } catch (redisErr) {
    console.error('Redis connection failure during bootstrap:', redisErr);
  }
}

// Export a custom handler that ensures DB and Redis connections are live before Express runs
export default async (req: any, res: any) => {
  await bootstrap();
  return app(req, res);
};
