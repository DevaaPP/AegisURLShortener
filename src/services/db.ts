import { Pool } from 'pg';
import { config } from '../config';

class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      // For production, configuration parameters like max pool size, timeouts should be tuned
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle database client', err);
    });
  }

  public query(text: string, params?: any[]) {
    return this.pool.query(text, params);
  }

  public async getClient() {
    return await this.pool.connect();
  }

  public async initializeDatabase() {
    console.log('Initializing database schema...');
    const client = await this.getClient();
    try {
      await client.query('BEGIN');

      // 1. Users Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          api_key VARCHAR(255) UNIQUE NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 2. Node Ranges Table (for Range Allocator)
      await client.query(`
        CREATE TABLE IF NOT EXISTS node_ranges (
          node_id INT PRIMARY KEY,
          current_max BIGINT NOT NULL DEFAULT 0,
          last_allocated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 3. Links Table (Target URL stored encrypted)
      await client.query(`
        CREATE TABLE IF NOT EXISTS links (
          id BIGINT PRIMARY KEY,
          short_code VARCHAR(50) UNIQUE NOT NULL,
          encrypted_url TEXT NOT NULL,
          iv VARCHAR(256) NOT NULL,
          auth_tag VARCHAR(256) NOT NULL,
          title VARCHAR(255),
          created_by INT REFERENCES users(id) ON DELETE SET NULL,
          expires_at TIMESTAMP,
          allow_single_use BOOLEAN DEFAULT false,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      // Add index for fast short_code resolution
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_links_short_code ON links(short_code);
      `);

      // 4. Click Analytics Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS click_analytics (
          id SERIAL PRIMARY KEY,
          link_id BIGINT REFERENCES links(id) ON DELETE CASCADE,
          short_code VARCHAR(50) NOT NULL,
          clicked_at TIMESTAMP NOT NULL,
          ip_address VARCHAR(45),
          country VARCHAR(100),
          device VARCHAR(50),
          os VARCHAR(50),
          browser VARCHAR(50),
          referrer TEXT
        );
      `);
      // Index for analytics queries
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_click_analytics_code ON click_analytics(short_code);
      `);

      await client.query('COMMIT');
      console.log('Database schema initialized successfully.');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error initializing database schema:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  public async close() {
    await this.pool.end();
  }
}

export const db = new DatabaseService();
export default db;
