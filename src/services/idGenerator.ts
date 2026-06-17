import { db } from './db';
import { config } from '../config';

class IdGeneratorService {
  private currentId: bigint = 0n;
  private maxId: bigint = 0n;
  private rangeSize: bigint;
  private nodeId: number;
  private allocationPromise: Promise<void> | null = null;
  private chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

  constructor() {
    this.rangeSize = BigInt(config.rangeBlockSize);
    this.nodeId = config.nodeId;
  }

  /**
   * Encodes a number to a base62 string
   */
  public encodeBase62(num: bigint): string {
    if (num === 0n) return this.chars[0];
    let n = num;
    let result = '';
    while (n > 0n) {
      const remainder = n % 62n;
      result = this.chars.charAt(Number(remainder)) + result;
      n = n / 62n;
    }
    return result;
  }

  /**
   * Request a new ID block from the database
   */
  private async allocateNextRange(): Promise<void> {
    console.log(`Allocating next ID range of size ${this.rangeSize} for node ${this.nodeId}...`);
    try {
      // Perform atomic database transaction to increment the maximum allocated range
      const result = await db.query(
        `INSERT INTO node_ranges (node_id, current_max, last_allocated)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (node_id) 
         DO UPDATE SET 
           current_max = node_ranges.current_max + EXCLUDED.current_max,
           last_allocated = CURRENT_TIMESTAMP
         RETURNING current_max;`,
        [this.nodeId, this.rangeSize]
      );

      const returnedMax = BigInt(result.rows[0].current_max);
      this.maxId = returnedMax;
      // Start of the new range is (maxId - rangeSize + 1)
      this.currentId = returnedMax - this.rangeSize + 1n;
      console.log(`Node ${this.nodeId} allocated ID range: [${this.currentId} - ${this.maxId}]`);
    } catch (error) {
      console.error('Failed to allocate ID range from PostgreSQL:', error);
      throw error;
    }
  }

  /**
   * Generates a unique, collision-free shortcode
   */
  public async nextShortCode(): Promise<string> {
    // Synchronize range allocation to prevent race conditions under load
    while (this.currentId > this.maxId || this.currentId === 0n) {
      if (!this.allocationPromise) {
        this.allocationPromise = this.allocateNextRange()
          .then(() => {
            this.allocationPromise = null;
          })
          .catch((err) => {
            this.allocationPromise = null;
            throw err;
          });
      }
      await this.allocationPromise;
    }

    const assignedId = this.currentId;
    this.currentId += 1n;
    
    return this.encodeBase62(assignedId);
  }
}

export const idGenerator = new IdGeneratorService();
export default idGenerator;
