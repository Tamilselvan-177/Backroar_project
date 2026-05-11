import Redis from "ioredis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";
import { MemoryKvStore } from "./memoryKvStore.js";

let client = null;
let memoryKv = null;

const redisOptions = {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  retryStrategy(times) {
    if (times > 20) return null;
    return Math.min(times * 300, 3000);
  },
};

export function getRedis() {
  if (!env.USE_REDIS) {
    throw new Error("getRedis() is only valid when USE_REDIS=true");
  }
  if (!client) {
    client = new Redis(env.REDIS_URL, redisOptions);
    client.on("error", (err) => {
      logger.warn({ err: err.message }, "redis_client_error");
    });
  }
  return client;
}

/** Session backing: Redis when USE_REDIS, else in-memory (dev / no Redis). */
export function getSessionKv() {
  if (!env.USE_REDIS) {
    if (!memoryKv) memoryKv = new MemoryKvStore();
    return memoryKv;
  }
  return getRedis();
}

/** Ensures TCP connection and AUTH; call only when USE_REDIS. */
export async function connectRedis() {
  const redis = getRedis();
  try {
    await redis.connect();
    await redis.ping();
  } catch (err) {
    const msg = err?.message || String(err);
    try {
      redis.disconnect();
    } catch {
      /* ignore */
    }
    client = null;
    throw new Error(
      `${msg} — start Redis at REDIS_URL or set USE_REDIS=false in the repo root .env (sessions use memory when Redis is off).`
    );
  }
}
