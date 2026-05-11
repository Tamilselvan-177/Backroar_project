import { MongoClient } from "mongodb";
import { env } from "../config/env.js";

let client = null;
let db = null;

function resolveDbName() {
  if (env.MONGODB_DATABASE?.trim()) {
    return env.MONGODB_DATABASE.trim();
  }
  try {
    const raw = env.MONGODB_URI.replace(/^mongodb\+srv:/i, "mongodb:");
    const u = new URL(raw);
    const pathPart = u.pathname.replace(/^\//, "").split("?")[0];
    if (pathPart) return pathPart;
  } catch {
    /* ignore */
  }
  return "backroar";
}

export async function connectMongo() {
  if (client) {
    return db;
  }
  client = new MongoClient(env.MONGODB_URI);
  await client.connect();
  db = client.db(resolveDbName());
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error("MongoDB is not connected; call connectMongo() first");
  }
  return db;
}

export async function closeMongo() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
