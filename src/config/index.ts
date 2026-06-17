import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://aegis_user:aegis_password@localhost:5432/aegis_db',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  masterEncryptionKey: process.env.MASTER_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  jwtSecret: process.env.JWT_SECRET || 'super_secret_jwt_key_change_me_in_production',
  safeBrowsingApiKey: process.env.SAFE_BROWSING_API_KEY || '',
  bypassSafeBrowsing: process.env.BYPASS_SAFE_BROWSING === 'true',
  nodeId: parseInt(process.env.NODE_ID || '1', 10),
  rangeBlockSize: parseInt(process.env.RANGE_BLOCK_SIZE || '1000', 10),
};

// Validate master encryption key length (must be 32 bytes / 64 hex characters)
if (config.masterEncryptionKey.length !== 64) {
  console.warn('WARNING: MASTER_ENCRYPTION_KEY should be exactly 64 hex characters (32 bytes). Encryption might fail.');
}
