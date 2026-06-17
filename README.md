# AegisURL: Secure Distributed URL Redirection Engine

AegisURL is an enterprise-grade, high-throughput, and ultra-secure URL shortener engineered for big-tech workloads. It achieves sub-10ms redirection latency, blocks malware/phishing threats, and operates at scale using lock-free distributed systems design.

Designed specifically to meet the demands of large organizations and multi-tenant SaaS providers, AegisURL implements sophisticated systems engineering concepts rather than simple basic CRUD methods.

---

## 🚀 Key Architectural Innovations

### 1. Distributed Range-based ID Generator (Lock-Free)
Instead of relying on database auto-increment keys (which block write threads under scale) or generating random codes (which cause index fragmentation and search collisions), AegisURL uses a **Range-based ID Distributor**:
* App servers request ID blocks of 1,000 to 100,000 from PostgreSQL atomically (e.g. `node_ranges`).
* Each server increments its local range block in memory. Once an ID is assigned locally in \(O(1)\), it is converted to **Base62**.
* This guarantees **zero network calls** or database locks during link creation, allowing high-throughput creation across multiple load-balanced servers.

### 2. Redis Bloom Filter Protection
To shield the primary database from **Cache-Penetration Attacks** (DDoS where attackers request millions of fake shortened URLs to exhaust DB connections):
* A **Redis Bloom Filter** checks for the existence of shortcodes in memory.
* If the Bloom Filter reports `false`, the request is rejected with a `404` immediately. The database is never queried.
* If it reports `true`, we search the cache and fallback to PostgreSQL.
* *Fallback*: If the Redis container lacks the RedisBloom module, the service automatically falls back to an optimized Redis Set.

### 3. AES-256-GCM URL Encryption at Rest
To protect user privacy and internal corporate target paths (like payment pages, internal reports, and password-reset links):
* All destination URLs are encrypted before saving using **AES-256-GCM** (Authenticated Encryption).
* The Master Key resides strictly in the application server memory.
* If the database is compromised, target URLs cannot be reverse-engineered or tampered with (GCM authentication tags prevent spoofing).

### 4. Non-Blocking Event-Driven Analytics (Redis Streams)
To keep redirection fast, we decouple analytics gathering from the HTTP redirect response:
* During redirect, the app pushes raw metadata (IP, OS, Referrer, shortcode) to a **Redis Stream** in `<1ms` and immediately responds to the visitor with a `302 Redirect`.
* A background **Stream Consumer Worker** processes stream events out-of-band: resolving Geo-IP regions, parsing User-Agent strings, and batching logs into a single query to insert into PostgreSQL.

### 5. Multi-Vector Security WAF
* **Google Safe Browsing API**: Intercepts malicious links at creation time.
* **Sliding-Window Rate Limiter**: Implemented using **Redis Sorted Sets (ZSET)** transactions to count API request frequency per client and block spammers.

---

## 🛠️ Project Structure

```
d:/cs/
├── src/
│   ├── config/
│   │   └── index.ts          # Environment variables & verification
│   ├── services/
│   │   ├── db.ts             # PG Client connection pool & schema creation
│   │   ├── redis.ts          # Redis Client & Bloom Filter controller
│   │   ├── crypto.ts         # AES-256-GCM URL encryption/decryption
│   │   ├── idGenerator.ts    # Range-based distributed allocator
│   │   ├── safebrowsing.ts   # Google Safe Browsing Match API
│   │   └── analytics.ts      # Redis Stream publisher & background consumer
│   ├── middleware/
│   │   ├── auth.ts           # JWT Token & SaaS API key auth
│   │   └── rateLimiter.ts    # Sliding-window rate limiter via Redis ZSETs
│   ├── controllers/
│   │   ├── shortener.ts      # Signup, Login, Shorten, Redirection handlers
│   │   └── analytics.ts      # Timeline & aggregation metrics reporting
│   ├── app.ts                # Express app routes definition
│   ├── server.ts             # App bootstrap entrypoint
│   └── verify.ts             # System self-contained testing suite
├── docker-compose.yml        # PostgreSQL & Redis Stack services
├── package.json              # NPM dependencies config
└── tsconfig.json             # TypeScript compiler settings
```

---

## ⚡ Setup & Installation

### Prerequisites
* **Node.js** (v18.x or higher)
* **Docker Desktop**

### 1. Boot Infrastructure (Database & Caches)
In your terminal, boot up PostgreSQL and Redis Stack:
```bash
docker-compose up -d
```
*Note: Redis Stack runs on port `6379` (Redis Server) and port `8001` (RedisInsight Dashboard).*

### 2. Install Project Dependencies
```bash
npm install
```

### 3. Run Self-Contained E2E System Verification
To verify that database schemas initialize, range allocation completes, encryption resolves correctly, and Redis stream analytics log properly, run the verification suite:
```bash
npm run verify
```

### 4. Start Development Server
```bash
npm run dev
```
The server will boot on port `3000`.

---

## 📬 API Documentation

### SaaS User Authentication
#### Sign Up Tenant
* **URL**: `POST /api/v1/auth/register`
* **Body**:
```json
{
  "email": "developer@mycompany.com",
  "password": "mySecurePassword"
}
```
* **Response**:
```json
{
  "success": true,
  "message": "User registered successfully.",
  "user": {
    "id": 1,
    "email": "developer@mycompany.com",
    "apiKey": "aegis_live_58c9f..."
  }
}
```

#### Log In
* **URL**: `POST /api/v1/auth/login`
* **Body**:
```json
{
  "email": "developer@mycompany.com",
  "password": "mySecurePassword"
}
```
* **Response**: Returns a JWT token for dashboard authentication.

---

### Link Management API (Requires `X-API-Key` or `Authorization: Bearer <JWT>`)

#### Create Shortened URL
* **URL**: `POST /api/v1/shorten`
* **Headers**: `X-API-Key: aegis_live_58c9f...`
* **Body**:
```json
{
  "targetUrl": "https://deepmind.google/technologies/gemini/",
  "expiresInSecs": 86400,
  "title": "Gemini Page",
  "customCode": "gemini-ai",
  "allowSingleUse": false
}
```
* **Response**:
```json
{
  "success": true,
  "short_code": "gemini-ai",
  "short_url": "http://localhost:3000/gemini-ai",
  "expires_at": "2026-06-28T20:33:51.000Z"
}
```

#### Get All Created Links
* **URL**: `GET /api/v1/links`
* **Headers**: `X-API-Key: aegis_live_58c9f...`
* **Response**: List of links created by this key, with total click count.

#### Get Link Analytics Dashboard Metrics
* **URL**: `GET /api/v1/analytics/:code`
* **Headers**: `X-API-Key: aegis_live_58c9f...`
* **Response**: Returns timeline graph, country distribution, device breakdowns, browser splits, and recent clicks.

---

### Redirection Gateway (Public)
* **URL**: `GET /:code`
* **Redirection Response**: `302 Found` to the original decrypted URL.
