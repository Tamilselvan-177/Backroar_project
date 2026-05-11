import { Worker } from "bullmq";
import IORedis from "ioredis";
import { env } from "../config/env.js";
import { connectMongo } from "../db/mongo.js";
import { IMAGE_UPLOAD_QUEUE } from "../queues/imageUploadQueue.js";
import { createRepositories } from "../repositories/registry.js";
import { processProductImageFile } from "../lib/processProductImageFile.js";

if (!env.USE_REDIS) {
  console.error("[image-upload-worker] USE_REDIS is false. Enable Redis and USE_REDIS=true before running this worker.");
  process.exit(1);
}

const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  retryStrategy(times) {
    if (times > 20) return null;
    return Math.min(times * 300, 3000);
  },
});
connection.on("error", (err) => {
  console.warn("[image-upload-worker] redis:", err.message);
});
let productRepo = null;
async function getProductRepository() {
  if (!productRepo) {
    await connectMongo();
    productRepo = createRepositories().products;
  }
  return productRepo;
}

async function processJob(job) {
  const products = await getProductRepository();
  const { productId, tempPath, isPrimary, displayOrder, variantId } = job.data;
  return processProductImageFile({
    products,
    productId,
    tempPath,
    isPrimary,
    displayOrder,
    variantId,
  });
}

const worker = new Worker(IMAGE_UPLOAD_QUEUE, processJob, { connection });

worker.on("completed", (job) => {
  console.log(`[image-upload] completed job ${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(`[image-upload] failed job ${job?.id}`, err);
});

console.log(`[image-upload] worker listening on queue "${IMAGE_UPLOAD_QUEUE}"`);
