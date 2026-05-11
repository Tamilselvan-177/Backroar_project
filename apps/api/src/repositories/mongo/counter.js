import { getDb } from "../../db/mongo.js";

/**
 * Monotonic integer ids (parity with SQL auto_increment for API responses).
 */
export async function nextSeq(name) {
  const col = getDb().collection("_counters");
  const r = await col.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  const doc = r?.value ?? r;
  const seq = doc?.seq;
  if (typeof seq !== "number") {
    throw new Error(`nextSeq("${name}") failed`);
  }
  return seq;
}
