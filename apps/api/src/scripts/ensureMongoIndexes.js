/**
 * Creates recommended MongoDB indexes (idempotent). Run after provisioning a database.
 */
import { connectMongo, closeMongo } from "../db/mongo.js";
import { ensureAllIndexes } from "../db/mongoIndexes.js";

async function main() {
  await connectMongo();
  await ensureAllIndexes();
  console.log("MongoDB indexes ensured.");
  await closeMongo();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
