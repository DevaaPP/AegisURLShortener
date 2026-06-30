import { Request, Response } from 'express';
import { db } from '../services/db';
import { redis } from '../services/redis';
import { cryptoService } from '../services/crypto';
import { idGenerator } from '../services/idGenerator';
import { safeBrowsing } from '../services/safebrowsing';
import { analyticsService } from '../services/analytics';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import crypto from 'crypto';

// Deterministic SHA-256 password hashing to fix comparison issues
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * SaaS User Registration
 */
export async function registerUser(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email and password required.' });
      return;
    }

    // Generate unique API key
    const apiKey = cryptoService.generateApiKey();
    const pwdHash = hashPassword(password);

    const result = await db.query(
      `INSERT INTO users (email, password_hash, api_key) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email, api_key;`,
      [email, pwdHash, apiKey]
    );

    if (result.rows.length === 0) {
      res.status(409).json({ success: false, error: 'User already exists with this email.' });
      return;
    }

    const newUser = result.rows[0];
    res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      user: {
        id: newUser.id,
        email: newUser.email,
        apiKey: newUser.api_key,
      },
    });
  } catch (error) {
    console.error('Registration Error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
}

/**
 * SaaS User Login (Generates JWT)
 */
export async function loginUser(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email and password required.' });
      return;
    }

    const result = await db.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email]);
    if (result.rows.length === 0) {
      res.status(401).json({ success: false, error: 'Invalid email or password.' });
      return;
    }

    const user = result.rows[0];
    const incomingPwdHash = hashPassword(password);
    
    // In our simplified setup, we compare ciphertext directly or decrypt
    if (user.password_hash !== incomingPwdHash) {
      res.status(401).json({ success: false, error: 'Invalid email or password.' });
      return;
    }

    const token = jwt.sign({ id: user.id, email: user.email }, config.jwtSecret, {
      expiresIn: '24h',
    });

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        apiKey: user.api_key,
      },
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
}

/**
 * Create a shortened URL
 */
export async function shortenUrl(req: Request, res: Response): Promise<void> {
  try {
    const { targetUrl, customCode, title, expiresInSecs, allowSingleUse } = req.body;
    const userId = req.user ? req.user.id : null;

    if (!targetUrl) {
      res.status(400).json({ success: false, error: 'targetUrl parameter is required.' });
      return;
    }

    // Validate URL syntax
    try {
      new URL(targetUrl);
    } catch {
      res.status(400).json({ success: false, error: 'Invalid destination URL format.' });
      return;
    }

    // 1. Google Safe Browsing scan
    const threatCheck = await safeBrowsing.isUrlSafe(targetUrl);
    if (!threatCheck.safe) {
      res.status(400).json({
        success: false,
        error: 'Security Threat Blocked',
        message: `The destination link was flagged by Google Safe Browsing as unsafe: ${threatCheck.reason}`,
      });
      return;
    }

    // 2. Resolve short code (Custom or Generated)
    let shortCode = '';
    const numericId = await idGenerator.nextShortCode(); // Get next unique sequential block ID

    if (customCode) {
      // Clean custom code (alphanumeric, hyphens, underscores)
      shortCode = customCode.trim().replace(/[^a-zA-Z0-9-_]/g, '');
      if (shortCode.length < 3) {
        res.status(400).json({ success: false, error: 'Custom code must be at least 3 characters.' });
        return;
      }

      // Check if custom code exists in Bloom Filter / Set (fast reject)
      const exists = await redis.codeExists(shortCode);
      if (exists) {
        // Bloom Filter reports yes (might be false positive, verify in DB)
        const dbCheck = await db.query('SELECT 1 FROM links WHERE short_code = $1 LIMIT 1', [shortCode]);
        if (dbCheck.rows.length > 0) {
          res.status(409).json({ success: false, error: 'Custom short code is already taken.' });
          return;
        }
      }
    } else {
      // Use the generated Base62 shortcode from range ID
      shortCode = numericId;
    }

    // 3. Encrypt the URL at rest
    const { ciphertext, iv, authTag } = cryptoService.encrypt(targetUrl);

    // 4. Expiration setup
    const expiresAt = expiresInSecs ? new Date(Date.now() + parseInt(expiresInSecs, 10) * 1000) : null;

    // Convert numericId string back to bigint for primary key, or use a hash if customCode is used
    const rowId = customCode 
      ? BigInt('0x' + cryptoService.encrypt(shortCode).ciphertext.slice(0, 15)) // Deterministic BigInt from code hash
      : BigInt(idGenerator.encodeBase62(BigInt(0))); // Fallback placeholder, wait, let's keep it simple:
      
    // Actually, we can use a sequence or generator for ALL row IDs. 
    // Let's query db with row ID as a sequential BIGINT from database generator if needed, 
    // or generate a new numeric ID range block value:
    const insertId = BigInt('0x' + cryptoService.encrypt(shortCode + Date.now()).ciphertext.slice(0, 15));

    await db.query(
      `INSERT INTO links (id, short_code, encrypted_url, iv, auth_tag, title, created_by, expires_at, allow_single_use)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        insertId,
        shortCode,
        ciphertext,
        iv,
        authTag,
        title || null,
        userId,
        expiresAt,
        allowSingleUse === true,
      ]
    );

    // 5. Register in Bloom Filter (Instantly shields DB from future invalid hits)
    await redis.registerCode(shortCode);

    // 6. Cache the redirect metadata
    const cacheData = {
      targetUrl,
      allowSingleUse: allowSingleUse === true,
      isActive: true,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      linkId: insertId.toString(),
    };
    await redis.cacheLink(shortCode, cacheData as any);

    // Construct full redirection URL
    const scheme = req.header('x-forwarded-proto') || (req.secure ? 'https' : 'http');
    const host = req.get('host');
    const shortUrl = `${scheme}://${host}/${shortCode}`;

    res.status(201).json({
      success: true,
      short_code: shortCode,
      short_url: shortUrl,
      expires_at: expiresAt,
    });
  } catch (error) {
    console.error('Shorten URL Error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
}

/**
 * Handle URL redirection
 */
export async function redirectUrl(req: Request, res: Response): Promise<void> {
  const shortCode = req.params.code;
  const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
  const userAgent = req.headers['user-agent'] || '';
  const referrer = req.headers['referer'] || ''; // Express parses Referer into 'referer' header key
  const countryCode = (req.headers['x-vercel-ip-country'] as string) || '';

  try {
    // 1. Bloom Filter existence test (Shields DB from 404 penetration)
    const exists = await redis.codeExists(shortCode);
    if (!exists) {
      res.status(404).send('<h1>404 Not Found</h1><p>The requested short link does not exist.</p>');
      return;
    }

    // 2. Query Redis Cache
    let cached = await redis.getCachedLink(shortCode);
    let linkId = '';
    let targetUrl = '';
    let allowSingleUse = false;
    let isActive = true;
    let expiresAtStr: string | null = null;

    if (cached) {
      targetUrl = cached.targetUrl;
      allowSingleUse = cached.allowSingleUse;
      isActive = cached.isActive;
      expiresAtStr = cached.expiresAt;
      linkId = (cached as any).linkId || '0';
    } else {
      // 3. Cache Miss: Query database
      const result = await db.query(
        'SELECT * FROM links WHERE short_code = $1 LIMIT 1',
        [shortCode]
      );

      if (result.rows.length === 0) {
        // Bloom Filter False Positive (expected <1% of times). Invalidate filter by caching null if needed, 
        // or just return 404
        res.status(404).send('<h1>404 Not Found</h1><p>The requested short link does not exist.</p>');
        return;
      }

      const linkRow = result.rows[0];
      linkId = linkRow.id.toString();
      allowSingleUse = linkRow.allow_single_use;
      isActive = linkRow.is_active;
      expiresAtStr = linkRow.expires_at ? new Date(linkRow.expires_at).toISOString() : null;

      // Decrypt URL in memory
      try {
        targetUrl = cryptoService.decrypt(linkRow.encrypted_url, linkRow.iv, linkRow.auth_tag);
      } catch (decError) {
        console.error(`Decryption failed for code ${shortCode}:`, decError);
        res.status(500).send('<h1>500 Internal Error</h1><p>Failed to decrypt target URL.</p>');
        return;
      }

      // Cache details for future lookups
      await redis.cacheLink(shortCode, {
        targetUrl,
        allowSingleUse,
        isActive,
        expiresAt: expiresAtStr,
        linkId,
      } as any);
    }

    // 4. Validate Status and Expiry
    if (!isActive) {
      res.status(410).send('<h1>410 Gone</h1><p>This short link is no longer active.</p>');
      return;
    }

    if (expiresAtStr && new Date(expiresAtStr).getTime() < Date.now()) {
      // Link expired: Delete from DB and invalidate Cache to allow recreation
      await db.query('DELETE FROM links WHERE short_code = $1', [shortCode]);
      await redis.invalidateCache(shortCode);
      res.status(410).send('<h1>410 Gone</h1><p>This short link has expired.</p>');
      return;
    }

    // 5. Handle single-use links
    if (allowSingleUse) {
      await db.query('DELETE FROM links WHERE short_code = $1', [shortCode]);
      await redis.invalidateCache(shortCode);
    }

    // 6. Push raw click payload to Redis stream for asynchronous analytics logging (takes <1ms)
    await analyticsService.logClick({
      linkId,
      shortCode,
      ipAddress,
      userAgent,
      referrer,
      countryCode,
    });

    // 7. Perform 302 Redirection
    res.status(302).redirect(targetUrl);
  } catch (error) {
    console.error(`Redirection routing error for code ${shortCode}:`, error);
    res.status(500).send('<h1>500 Internal Error</h1>');
  }
}
