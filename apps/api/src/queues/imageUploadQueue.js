import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

export const IMAGE_UPLOAD_QUEUE = "image-upload";

let queue = null;
let connection = null;

const redisOptions = {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  retryStrategy(times) {
    if (times > 20) return null;
    return Math.min(times * 300, 3000);
  },
};

export function getImageUploadConnection() {
  if (!env.USE_REDIS) {
    throw new Error("Image upload queue requires USE_REDIS=true");
  }
  if (!connection) {
    connection = new IORedis(env.REDIS_URL, redisOptions);
    connection.on("error", (err) => {
      logger.warn({ err: err.message }, "redis_bullmq_connection_error");
    });
  }
  return connection;
}

export function getImageUploadQueue() {
  if (!env.USE_REDIS) return null;
  if (!queue) {
    queue = new Queue(IMAGE_UPLOAD_QUEUE, { connection: getImageUploadConnection() });
  }
  return queue;
}
