import { getDb } from "../../db/mongo.js";
import { nextSeq } from "./counter.js";

function stripMongoDoc(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return rest;
}

export class MongoStoreRepository {
  async listActive() {
    const rows = await getDb()
      .collection("stores")
      .find({ is_active: { $in: [1, true] } })
      .sort({ name: 1 })
      .toArray();
    return rows.map(stripMongoDoc);
  }

  async listAll() {
    const rows = await getDb().collection("stores").find({}).sort({ name: 1 }).toArray();
    return rows.map(stripMongoDoc);
  }

  async findById(id) {
    const s = await getDb().collection("stores").findOne({ id: Number(id) });
    return stripMongoDoc(s);
  }

  /** Another store with this code (optionally excluding one id). */
  async findByCode(code, excludeId = null) {
    const c = String(code ?? "").trim();
    if (!c) return null;
    const q = { code: c };
    const ex = Number(excludeId);
    if (excludeId != null && excludeId !== "" && Number.isFinite(ex) && ex > 0) {
      q.id = { $ne: ex };
    }
    const s = await getDb().collection("stores").findOne(q);
    return stripMongoDoc(s);
  }

  async getDeleteBlockers(storeId) {
    const sid = Number(storeId);
    const db = getDb();
    const [counters, posOrders, posHolds, billSeq, returns] = await Promise.all([
      db.collection("counters").countDocuments({ store_id: sid }),
      db.collection("pos_orders").countDocuments({ store_id: sid }),
      db.collection("pos_holds").countDocuments({ store_id: sid }),
      db.collection("bill_sequences").countDocuments({ store_id: sid }),
      db.collection("returns").countDocuments({ store_id: sid }),
    ]);
    return { counters, pos_orders: posOrders, pos_holds: posHolds, bill_sequences: billSeq, returns };
  }

  async createForAdmin(raw) {
    const code = String(raw.code ?? "").trim();
    const name = String(raw.name ?? "").trim();
    if (!code || !name) return { ok: false, error: "validation_failed", fields: ["code", "name"] };
    if (await this.findByCode(code, null)) return { ok: false, error: "code_taken" };

    const id = await nextSeq("stores");
    const now = new Date();
    await getDb().collection("stores").insertOne({
      id,
      code,
      name,
      address: String(raw.address ?? "").trim(),
      city: String(raw.city ?? "").trim(),
      state: String(raw.state ?? "").trim(),
      pincode: String(raw.pincode ?? "").trim(),
      gstin: String(raw.gstin ?? "").trim(),
      is_active: raw.is_active === false || raw.is_active === 0 ? 0 : 1,
      created_at: now,
      updated_at: now,
    });
    return { ok: true, id };
  }

  async updateForAdmin(id, raw) {
    const existing = await this.findById(id);
    if (!existing) return { ok: false, error: "not_found" };

    const code = raw.code !== undefined ? String(raw.code).trim() : existing.code;
    const name = raw.name !== undefined ? String(raw.name).trim() : existing.name;
    if (!code || !name) return { ok: false, error: "validation_failed", fields: ["code", "name"] };

    const dup = await this.findByCode(code, id);
    if (dup) return { ok: false, error: "code_taken" };

    const $set = {
      code,
      name,
      updated_at: new Date(),
    };
    if (raw.address !== undefined) $set.address = String(raw.address ?? "").trim();
    if (raw.city !== undefined) $set.city = String(raw.city ?? "").trim();
    if (raw.state !== undefined) $set.state = String(raw.state ?? "").trim();
    if (raw.pincode !== undefined) $set.pincode = String(raw.pincode ?? "").trim();
    if (raw.gstin !== undefined) $set.gstin = String(raw.gstin ?? "").trim();
    if (raw.is_active !== undefined) {
      $set.is_active = raw.is_active === false || raw.is_active === 0 ? 0 : 1;
    }

    await getDb().collection("stores").updateOne({ id: Number(id) }, { $set });
    return { ok: true };
  }

  async deleteById(id) {
    const r = await getDb().collection("stores").deleteOne({ id: Number(id) });
    if (r.deletedCount === 0) return { ok: false, error: "not_found" };
    return { ok: true };
  }
}
