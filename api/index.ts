import serverless from 'serverless-http';
import app from '../src/app';
import { db } from '../src/services/db';
import { redis } from '../src/services/redis';

let isInitialized = false;

async function bootstrap() {
  if (!isInitialized) {
    console.log('Lazy initializing database and cache connections for serverless runtime...');
    await db.initializeDatabase();
    await redis.connect();
    isInitialized = true;
  }
}

const handler = serverless(app);

export default async (req: any, res: any) => {
  // Ensure Postgres & Redis are connected before serving the request
  await bootstrap();
  return handler(req, res);
};
