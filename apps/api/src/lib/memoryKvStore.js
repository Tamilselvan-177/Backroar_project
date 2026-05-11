/** In-process TTL string store (Redis subset used by SessionStore). Single-process only. */
export class MemoryKvStore {
  constructor() {
    this.map = new Map();
  }

  async get(key) {
    const row = this.map.get(key);
    if (!row) return null;
    if (row.expiresAt <= Date.now()) {
      this.map.delete(key);
      return null;
    }
    return row.value;
  }

  async setex(key, ttlSec, value) {
    this.map.set(key, {
      value,
      expiresAt: Date.now() + ttlSec * 1000,
    });
  }

  async expire(key, ttlSec) {
    const row = this.map.get(key);
    if (!row) return;
    row.expiresAt = Date.now() + ttlSec * 1000;
  }

  async del(key) {
    this.map.delete(key);
  }
}
