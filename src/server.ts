import app from './app';
import { config } from './config';
import { db } from './services/db';
import { redis } from './services/redis';
import { analyticsService } from './services/analytics';

const PORT = config.port;

async function bootstrap() {
  try {
    console.log('Bootstrapping AegisURL Server...');

    // 1. Connect to and initialize Database
    await db.initializeDatabase();

    // 2. Connect to Redis (registers Bloom Filters)
    await redis.connect();

    // 3. Start background analytics stream worker
    await analyticsService.startConsumer();

    // 4. Start HTTP Server
    const server = app.listen(PORT, () => {
      console.log(`=========================================`);
      console.log(` AegisURL Engine Running on Port ${PORT}`);
      console.log(` Environment: ${config.nodeEnv}`);
      console.log(` Node ID: ${config.nodeId} (Range Size: ${config.rangeBlockSize})`);
      console.log(`=========================================`);
    });

    // 5. Graceful Shutdown Setup
    const shutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
      
      // Stop accepting new HTTP requests
      server.close(() => {
        console.log('HTTP server stopped.');
      });

      // Stop the analytics consumer loop
      analyticsService.stopConsumer();

      // Close DB and Redis client pools
      try {
        await redis.close();
        console.log('Redis client closed.');
      } catch (err) {
        console.error('Error closing Redis client:', err);
      }

      try {
        await db.close();
        console.log('Database pool closed.');
      } catch (err) {
        console.error('Error closing database pool:', err);
      }

      console.log('Graceful shutdown completed. Exiting.');
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

  } catch (error) {
    console.error('CRITICAL: Server bootstrap failed:', error);
    process.exit(1);
  }
}

bootstrap();
