import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";

const PREFIX = "br_sess:";
const TTL_SEC = 60 * 60 * 24 * 7;

export class SessionStore {
  constructor(kv) {
    this.kv = kv;
  }

  cookieName() {
    return env.SESSION_COOKIE_NAME;
  }

  generateSid() {
    return randomBytes(32).toString("hex");
  }

  generateCsrf() {
    return randomBytes(32).toString("hex");
  }

  key(sid) {
    return `${PREFIX}${sid}`;
  }

  async get(sid) {
    const raw = await this.kv.get(this.key(sid));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async set(sid, data) {
    await this.kv.setex(this.key(sid), TTL_SEC, JSON.stringify(data));
  }

  async touch(sid) {
    await this.kv.expire(this.key(sid), TTL_SEC);
  }

  async destroy(sid) {
    await this.kv.del(this.key(sid));
  }
}
