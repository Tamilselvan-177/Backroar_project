# Database (Node API)

## MongoDB (Node.js API)

The **Fastify API** uses **MongoDB only** — there are no SQL queries or `mysql2` in `apps/api`.

- **Connection:** `MONGODB_URI` and optional `MONGODB_DATABASE` in repo-root `.env` (see `.env.example`).
- **Schema & collections:** [`MONGODB_SCHEMA.md`](./MONGODB_SCHEMA.md) — field shapes and indexes.
- **Indexes:** from repo root run `npm run migrations` (runs `apps/api/src/scripts/ensureMongoIndexes.js`).

## Legacy MySQL dumps (reference only)

SQL files under `backroarWebstieWIthBillingSystem/database/` are a **reference** for importing or comparing data into Mongo (ETL). They are **not** executed by the Node API.
