import { db } from './services/db';
import { redis } from './services/redis';
import { cryptoService } from './services/crypto';
import { idGenerator } from './services/idGenerator';
import { safeBrowsing } from './services/safebrowsing';
import { analyticsService } from './services/analytics';
import jwt from 'jsonwebtoken';
import { config } from './config';

async function runVerification() {
  console.log('\n==================================================');
  console.log('       AegisURL Suite System Verification         ');
  console.log('==================================================\n');

  let successCount = 0;
  let failCount = 0;

  const test = async (name: string, fn: () => Promise<void>) => {
    try {
      console.log(`[TEST] Running: ${name}...`);
      await fn();
      console.log(`[PASS] Success: ${name}\n`);
      successCount++;
    } catch (err) {
      console.error(`[FAIL] Error in: ${name}`);
      console.error(err);
      console.log('\n');
      failCount++;
    }
  };

  try {
    // Connect to services
    await db.initializeDatabase();
    await redis.connect();
    // Start consumer for clicks stream
    await analyticsService.startConsumer();

    // ----------------------------------------------------
    // TEST 1: Cryptography Encryption at Rest
    // ----------------------------------------------------
    await test('AES-256-GCM URL Encryption at Rest', async () => {
      const url = 'https://deepmind.google/technologies/gemini/';
      const encrypted = cryptoService.encrypt(url);
      
      if (encrypted.ciphertext === url) {
        throw new Error('Encryption failed: Ciphertext matches plaintext URL.');
      }
      
      const decrypted = cryptoService.decrypt(encrypted.ciphertext, encrypted.iv, encrypted.authTag);
      if (decrypted !== url) {
        throw new Error(`Decryption failed: Decrypted url (${decrypted}) != source url (${url})`);
      }

      console.log(`  - Ciphertext: ${encrypted.ciphertext.substring(0, 30)}...`);
      console.log(`  - Decrypted URL matches source URL successfully.`);
    });

    // ----------------------------------------------------
    // TEST 2: Base62 Range-based ID Generator
    // ----------------------------------------------------
    await test('Distributed Range-based ID Generator (Base62)', async () => {
      const codes: string[] = [];
      for (let i = 0; i < 5; i++) {
        const code = await idGenerator.nextShortCode();
        codes.push(code);
      }

      console.log(`  - Generated Shortcodes: ${codes.join(', ')}`);
      
      // Ensure all generated codes are unique
      const uniqueCodes = new Set(codes);
      if (uniqueCodes.size !== codes.length) {
        throw new Error('Collision detected in ID range generator!');
      }

      // Check base62 format validity
      const base62Regex = /^[a-zA-Z0-9]+$/;
      for (const code of codes) {
        if (!base62Regex.test(code)) {
          throw new Error(`Code '${code}' is not valid Base62.`);
        }
      }
    });

    // ----------------------------------------------------
    // TEST 3: Safe Browsing Checker
    // ----------------------------------------------------
    await test('Google Safe Browsing API / Fallback check', async () => {
      const cleanUrl = 'https://google.com';
      const threatCheck = await safeBrowsing.isUrlSafe(cleanUrl);
      
      if (!threatCheck.safe) {
        throw new Error(`Clean URL was flagged as unsafe: ${threatCheck.reason}`);
      }
      console.log(`  - Scan outcome for ${cleanUrl}: Clean/Safe`);
    });

    // ----------------------------------------------------
    // TEST 4: SaaS Tenant Signup & Login
    // ----------------------------------------------------
    let testUserApiKey = '';
    await test('SaaS Tenant Signup and JWT Auth Key Gen', async () => {
      const email = `tenant-${Date.now()}@aegis.com`;
      const password = 'securePass123';
      const key = cryptoService.generateApiKey();
      const pwdHash = cryptoService.encrypt(password).ciphertext;

      // Register direct query
      const insertUserRes = await db.query(
        `INSERT INTO users (email, password_hash, api_key) 
         VALUES ($1, $2, $3) 
         RETURNING id, email, api_key;`,
        [email, pwdHash, key]
      );
      
      const user = insertUserRes.rows[0];
      testUserApiKey = user.api_key;
      
      if (!testUserApiKey.startsWith('aegis_live_')) {
        throw new Error(`Invalid API key generation format: ${testUserApiKey}`);
      }

      // Verify JWT sign & validation
      const token = jwt.sign({ id: user.id, email: user.email }, config.jwtSecret, { expiresIn: '1h' });
      const decoded = jwt.verify(token, config.jwtSecret) as any;
      
      if (decoded.email !== email) {
        throw new Error('JWT Verification failed: Payload email mismatch.');
      }

      console.log(`  - Registered SaaS User: ${email}`);
      console.log(`  - Generated API Key: ${testUserApiKey}`);
    });

    // ----------------------------------------------------
    // TEST 5: Cache-Penetration Bloom Filter Protection
    // ----------------------------------------------------
    await test('Redis Bloom Filter Cache Penetration Shield', async () => {
      const nonExistentCode = `random_fake_code_${Date.now()}`;
      
      // Check if it exists
      const exists = await redis.codeExists(nonExistentCode);
      if (exists) {
        throw new Error('Bloom filter false-negative check failed: reported non-existent code as existing.');
      }
      
      console.log(`  - Bloom Filter correctly flagged non-existent code: ${nonExistentCode} -> False`);
    });

    // ----------------------------------------------------
    // TEST 6: Event-Driven click streaming
    // ----------------------------------------------------
    await test('Redis Streams to PostgreSQL Click Analytics Pipeline', async () => {
      const dummyCode = 'verifyLink';
      const targetUrl = 'https://deepmind.google';
      const linkId = '999999';

      // Ensure mock link exists in DB for foreign key constraint
      await db.query(
        `INSERT INTO links (id, short_code, encrypted_url, iv, auth_tag, title, expires_at, allow_single_use)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING;`,
        [linkId, dummyCode, 'enc', 'iv', 'tag', 'Test link', null, false]
      );

      // Add to Bloom Filter
      await redis.registerCode(dummyCode);

      // Log click to stream
      await analyticsService.logClick({
        linkId,
        shortCode: dummyCode,
        ipAddress: '1.2.3.4',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 Chrome/114.0.0.0 Safari/604.1',
        referrer: 'https://twitter.com',
      });

      console.log('  - Click pushed to Redis Stream. Waiting 3.5s for async consumer consumption...');
      await new Promise((resolve) => setTimeout(resolve, 3500));

      // Verify write in postgres
      const result = await db.query(
        'SELECT * FROM click_analytics WHERE short_code = $1 ORDER BY clicked_at DESC LIMIT 1',
        [dummyCode]
      );

      if (result.rows.length === 0) {
        throw new Error('Analytics write failed: No record found in PostgreSQL click_analytics table.');
      }

      const analyticsRecord = result.rows[0];
      
      if (analyticsRecord.device !== 'Mobile' || analyticsRecord.os !== 'iOS' || analyticsRecord.browser !== 'Chrome') {
        throw new Error(`User-Agent parser logic failed! Got device=${analyticsRecord.device}, os=${analyticsRecord.os}, browser=${analyticsRecord.browser}`);
      }

      console.log('  - Database record parsed successfully:');
      console.log(`    * Country: ${analyticsRecord.country}`);
      console.log(`    * Device: ${analyticsRecord.device}`);
      console.log(`    * OS: ${analyticsRecord.os}`);
      console.log(`    * Browser: ${analyticsRecord.browser}`);
    });

  } finally {
    // Cleanup consumer loop and client connections
    analyticsService.stopConsumer();
    await redis.close();
    await db.close();
  }

  console.log('==================================================');
  console.log(`   Verification Done: ${successCount} PASSED, ${failCount} FAILED   `);
  console.log('==================================================\n');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runVerification();
