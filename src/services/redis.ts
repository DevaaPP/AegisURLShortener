import { createClient, RedisClientType } from 'redis';
import { config } from '../config';

class RedisService {
  private client: RedisClientType;
  private hasBloomModule: boolean = true;
  private bloomFilterName = 'links:bloom';
  private setFallbackName = 'links:set';

  constructor() {
    this.client = createClient({
      url: config.redisUrl,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries) => {
          if (retries > 3) {
            return new Error('Redis connection failed.');
          }
          return 1000;
        }
      }
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error', err);
    });
  }

  public async connect() {
    if (!this.client.isOpen) {
      await this.client.connect();
      console.log('Connected to Redis.');
      await this.initializeBloomFilter();
    }
  }

  private async initializeBloomFilter() {
    try {
      // Try to reserve a bloom filter.
      // BF.RESERVE <key> <error_rate> <capacity>
      // error_rate = 0.01 (1%), initial capacity = 10,000,000 elements
      await this.client.sendCommand(['BF.RESERVE', this.bloomFilterName, '0.01', '10000000']);
      console.log('Redis Bloom Filter reserved successfully.');
      this.hasBloomModule = true;
    } catch (error: any) {
      if (error.message && (error.message.includes('unknown command') || error.message.includes('not available'))) {
        console.warn('WARNING: Redis Bloom module not found. Falling back to Redis Set for existence check.');
        this.hasBloomModule = false;
      } else if (error.message && (error.message.includes('BUSYKEY') || error.message.includes('item exists'))) {
        console.log('Redis Bloom Filter already exists and is ready.');
        this.hasBloomModule = true;
      } else {
        console.error('Failed to initialize Redis Bloom Filter:', error);
        this.hasBloomModule = false;
      }
    }
  }

  /**
   * Register a shortcode in the bloom filter or fallback set
   */
  public async registerCode(shortCode: string): Promise<void> {
    try {
      if (this.hasBloomModule) {
        await this.client.sendCommand(['BF.ADD', this.bloomFilterName, shortCode]);
      } else {
        await this.client.sAdd(this.setFallbackName, shortCode);
      }
    } catch (error) {
      console.error(`Error adding code ${shortCode} to existence check:`, error);
    }
  }

  /**
   * Fast check if a shortcode exists (guarantees NO if it doesn't exist)
   */
  public async codeExists(shortCode: string): Promise<boolean> {
    try {
      if (this.hasBloomModule) {
        const result = await this.client.sendCommand(['BF.EXISTS', this.bloomFilterName, shortCode]);
        return result === 1;
      } else {
        return await this.client.sIsMember(this.setFallbackName, shortCode);
      }
    } catch (error) {
      console.error(`Error checking existence for code ${shortCode}:`, error);
      return true; // Fallback to true so we query cache/DB if Redis check fails
    }
  }

  /**
   * Cache link redirect information
   */
  public async cacheLink(
    shortCode: string,
    data: { targetUrl: string; allowSingleUse: boolean; isActive: boolean; expiresAt: string | null }
  ): Promise<void> {
    const key = `link:${shortCode}`;
    const value = JSON.stringify(data);
    
    // Set cache with TTL if there is an expiration date
    if (data.expiresAt) {
      const msLeft = new Date(data.expiresAt).getTime() - Date.now();
      if (msLeft > 0) {
        const secsLeft = Math.ceil(msLeft / 1000);
        await this.client.set(key, value, { EX: secsLeft });
        return;
      }
    }
    
    // Default TTL of 24 hours for hot links
    await this.client.set(key, value, { EX: 86400 });
  }

  /**
   * Get cached link redirect information
   */
  public async getCachedLink(
    shortCode: string
  ): Promise<{ targetUrl: string; allowSingleUse: boolean; isActive: boolean; expiresAt: string | null } | null> {
    const key = `link:${shortCode}`;
    const data = await this.client.get(key);
    if (!data) return null;
    return JSON.parse(data);
  }

  /**
   * Invalidate cached link (e.g. if updated, deleted, or expired)
   */
  public async invalidateCache(shortCode: string): Promise<void> {
    await this.client.del(`link:${shortCode}`);
  }

  /**
   * Get internal client for raw commands (like streams, lua scripts)
   */
  public getClient(): RedisClientType {
    return this.client;
  }

  public async close() {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }
}

export const redis = new RedisService();
export default redis;
