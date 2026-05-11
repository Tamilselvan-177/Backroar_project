# Runbook (no Docker Compose)

## Prerequisites

- Node.js 20+
- MongoDB 6+ (local or Atlas)
- Redis 6+ — **enable for production parity**: admin/POS sessions, stock-transfer carts, and Cloudinary image queue jobs require `USE_REDIS=true` and `REDIS_URL`. Without Redis, session state is in-memory only and is lost when the API process restarts.

## Environment

Copy `.env.example` to `.env` at the **repository root** (`migration/.env`) or set variables in your process manager. Minimum:

- `MONGODB_URI` — e.g. `mongodb://127.0.0.1:27017/nodebackroar`
- `REDIS_URL=redis://127.0.0.1:6379`
- `SESSION_SECRET` — at least 32 random bytes (e.g. `openssl rand -hex 32`)
- `WEB_ORIGIN` — exact React origin (e.g. `http://localhost:5173`)
- `USE_REDIS=true` and `REDIS_URL` — strongly recommended so POS and stock-transfer flows keep server-side session state across requests and deploys (matches PHP `$_SESSION` persistence expectations).

## One-time database setup

```bash
cd apps/api
npm install
npm run migrations
```

(`migrations` creates recommended MongoDB indexes; load product/category data via your own seed or ETL from the legacy MySQL export.)

## Development

Terminal 1 — API:

```bash
cd apps/api
npm run dev
```

Terminal 2 — React:

```bash
cd apps/web
npm install
npm run dev
```

Terminal 3 (optional) — image upload worker (requires Cloudinary env):

```bash
cd apps/api
npm run worker:image
```

## Production notes

- Set `NODE_ENV=production`, `TRUST_PROXY=true` behind a reverse proxy, and HTTPS so `Secure` cookies work (or set `COOKIE_SECURE=true` if terminating TLS at the proxy).
- Run API with `npm run start` after copying sources (or use your own deploy pipeline).
