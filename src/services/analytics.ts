import { redis } from './redis';
import { db } from './db';

class AnalyticsService {
  private streamName = 'clicks:stream';
  private groupName = 'analytics:group';
  private consumerName = `worker-${process.pid}`;
  private isRunning = false;

  /**
   * Log a click asynchronously by pushing it to a Redis Stream.
   * This completes in sub-millisecond time.
   */
  public async logClick(payload: {
    linkId: string;
    shortCode: string;
    ipAddress: string;
    userAgent: string;
    referrer: string;
  }): Promise<void> {
    try {
      const client = redis.getClient();
      await client.xAdd(this.streamName, '*', {
        linkId: payload.linkId,
        shortCode: payload.shortCode,
        ipAddress: payload.ipAddress || '',
        userAgent: payload.userAgent || '',
        referrer: payload.referrer || '',
        clickedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to log click to Redis Stream:', error);
      // Fail-soft: we do not crash or block the redirect even if Redis stream is failing
    }
  }

  /**
   * Starts the background consumer loop to read from Redis Stream and write to PostgreSQL
   */
  public async startConsumer(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`Starting Click Stream Consumer: ${this.consumerName}`);

    const client = redis.getClient();

    // 1. Create consumer group if not already created
    try {
      // MKSTREAM option creates the stream if it doesn't exist
      await client.xGroupCreate(this.streamName, this.groupName, '0', { MKSTREAM: true });
      console.log(`Redis Stream consumer group '${this.groupName}' created.`);
    } catch (error: any) {
      if (error.message && error.message.includes('BUSYGROUP')) {
        console.log(`Redis Stream consumer group '${this.groupName}' already exists.`);
      } else {
        console.error('Failed to create consumer group:', error);
        this.isRunning = false;
        return;
      }
    }

    // 2. Start infinite reading loop
    this.consumerLoop();
  }

  private async consumerLoop(): Promise<void> {
    const client = redis.getClient();

    while (this.isRunning) {
      try {
        // Read messages from the stream that are new to this consumer group (using '>')
        // Read up to 100 messages, block for 2000ms if no messages exist
        const streams = await client.xReadGroup(
          this.groupName,
          this.consumerName,
          [{ key: this.streamName, id: '>' }],
          { COUNT: 100, BLOCK: 2000 }
        );

        if (!streams || streams.length === 0) {
          continue;
        }

        const streamMessages = streams[0].messages;
        if (streamMessages.length === 0) {
          continue;
        }

        const messageIds: string[] = [];
        const insertValues: any[] = [];
        let paramIndex = 1;
        const valuePlaceholders: string[] = [];

        for (const message of streamMessages) {
          messageIds.push(message.id);
          const data = message.message;

          const linkId = parseInt(data.linkId, 10);
          const shortCode = data.shortCode;
          const clickedAt = new Date(data.clickedAt);
          const ipAddress = data.ipAddress;
          const userAgent = data.userAgent;
          const referrer = data.referrer || null;

          // Parse User Agent and Geolocation
          const parsedUa = this.parseUserAgent(userAgent);
          const country = this.detectCountry(ipAddress);

          valuePlaceholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8})`);
          insertValues.push(
            linkId,
            shortCode,
            clickedAt,
            ipAddress,
            country,
            parsedUa.device,
            parsedUa.os,
            parsedUa.browser,
            referrer
          );
          paramIndex += 9;
        }

        // Perform bulk insert to PostgreSQL
        const sql = `
          INSERT INTO click_analytics 
          (link_id, short_code, clicked_at, ip_address, country, device, os, browser, referrer)
          VALUES ${valuePlaceholders.join(', ')}
        `;

        await db.query(sql, insertValues);

        // Acknowledge the messages in Redis
        await client.xAck(this.streamName, this.groupName, messageIds);

        // Optionally, claim and clean up messages in Redis stream to prevent memory growth (XDEL)
        await client.xDel(this.streamName, messageIds);
        
      } catch (error) {
        console.error('Error in analytics stream consumer loop:', error);
        // Wait briefly before retrying to prevent rapid error looping
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  /**
   * Stops the background consumer loop
   */
  public stopConsumer(): void {
    this.isRunning = false;
    console.log('Stopping Click Stream Consumer...');
  }

  /**
   * Lightweight, zero-dependency parser for User Agent strings
   */
  private parseUserAgent(uaString: string): { os: string; browser: string; device: string } {
    if (!uaString) {
      return { os: 'Unknown', browser: 'Unknown', device: 'Desktop' };
    }

    let os = 'Unknown';
    let browser = 'Unknown';
    let device = 'Desktop';

    // 1. Detect OS
    if (uaString.includes('Windows')) os = 'Windows';
    else if (uaString.includes('Macintosh') || uaString.includes('Mac OS')) os = 'macOS';
    else if (uaString.includes('Android')) os = 'Android';
    else if (uaString.includes('iPhone') || uaString.includes('iPad')) os = 'iOS';
    else if (uaString.includes('Linux')) os = 'Linux';

    // 2. Detect Browser
    if (uaString.includes('Firefox')) browser = 'Firefox';
    else if (uaString.includes('Chrome') && !uaString.includes('Chromium')) browser = 'Chrome';
    else if (uaString.includes('Safari') && !uaString.includes('Chrome')) browser = 'Safari';
    else if (uaString.includes('Edge') || uaString.includes('Edg')) browser = 'Edge';
    else if (uaString.includes('Opera') || uaString.includes('OPR')) browser = 'Opera';

    // 3. Detect Device
    if (uaString.includes('Mobi') || uaString.includes('Android') || uaString.includes('iPhone')) {
      device = 'Mobile';
    } else if (uaString.includes('iPad') || uaString.includes('Tablet')) {
      device = 'Tablet';
    }

    return { os, browser, device };
  }

  /**
   * Simple mock IP location resolver.
   * In production, this can parse Cloudflare's Geo-IP header (cf-ipcountry) or hit MaxMind
   */
  private detectCountry(ip: string): string {
    if (!ip) return 'Unknown';
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
      return 'Local Network';
    }

    // Mock country distribution for demonstration/verification purposes
    // Based on IP checksum to make it deterministic
    const hash = ip.split('.').reduce((acc, part) => acc + parseInt(part || '0', 10), 0);
    const countries = ['United States', 'India', 'United Kingdom', 'Germany', 'Japan', 'Canada', 'Singapore'];
    return countries[hash % countries.length];
  }
}

export const analyticsService = new AnalyticsService();
export default analyticsService;
