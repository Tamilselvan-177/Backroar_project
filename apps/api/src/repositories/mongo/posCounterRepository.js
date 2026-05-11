import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { getDb } from "../../db/mongo.js";
import { nextSeq } from "./counter.js";

function stripCounter(doc) {
  if (!doc) return null;
  const { _id, pin_hash, ...rest } = doc;
  return rest;
}

export class MongoPosCounterRepository {
  async listByStore(storeId) {
    const rows = await getDb()
      .collection("counters")
      .find({ store_id: Number(storeId), is_active: { $in: [1, true] } })
      .sort({ name: 1 })
      .toArray();
    return rows.map((d) => stripCounter(d));
  }

  async findById(id) {
    const c = await getDb().collection("counters").findOne({ id: Number(id) });
    return stripCounter(c);
  }

  async findRowWithPin(id) {
    return getDb().collection("counters").findOne({ id: Number(id) });
  }

  /**
   * Verify counter PIN (bcrypt, legacy MD5, plain → upgrade to bcrypt).
   */
  async verifyPin(counterId, pin) {
    const row = await this.findRowWithPin(counterId);
    if (!row || !(row.is_active === 1 || row.is_active === true)) return false;
    const hash = String(row.pin_hash ?? "");
    const p = String(pin);
    if (!hash) return false;
    if (hash.startsWith("$2")) {
      const ok = bcrypt.compareSync(p, hash);
      if (ok && bcrypt.getRounds(hash) < 10) {
        const newH = bcrypt.hashSync(p, 10);
        await getDb().collection("counters").updateOne({ id: row.id }, { $set: { pin_hash: newH } });
      }
      return ok;
    }
    const isMd5 = hash.length === 32 && /^[0-9a-fA-F]+$/.test(hash);
    if (isMd5 && hash.toLowerCase() === crypto.createHash("md5").update(p).digest("hex")) {
      await getDb()
        .collection("counters")
        .updateOne({ id: row.id }, { $set: { pin_hash: bcrypt.hashSync(p, 10) } });
      return true;
    }
    if (hash === p && hash !== "") {
      await getDb()
        .collection("counters")
        .updateOne({ id: row.id }, { $set: { pin_hash: bcrypt.hashSync(p, 10) } });
      return true;
    }
    return false;
  }

  /** Admin list: all counters (incl. inactive), optional filter by store; joined store name/code. */
  async listWithStoreNames({ storeId = 0 } = {}) {
    const match = {};
    const sid = Math.floor(Number(storeId) || 0);
    if (sid > 0) match.store_id = sid;
    const rows = await getDb()
      .collection("counters")
      .aggregate([
        { $match: match },
        {
          $lookup: {
            from: "stores",
            localField: "store_id",
            foreignField: "id",
            as: "s",
          },
        },
        { $unwind: { path: "$s", preserveNullAndEmptyArrays: true } },
      ])
      .toArray();
    const mapped = rows.map((d) => ({
      id: d.id,
      store_id: d.store_id,
      code: d.code,
      name: d.name,
      is_active: d.is_active,
      created_at: d.created_at,
      store_name: d.s?.name ?? "",
      store_code: d.s?.code ?? "",
    }));
    if (sid > 0) {
      mapped.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    } else {
      mapped.sort(
        (a, b) =>
          String(a.store_name).localeCompare(String(b.store_name)) || String(a.name).localeCompare(String(b.name))
      );
    }
    return mapped;
  }

  /** Global counter code uniqueness check, optionally excluding one id. */
  async findByCode(code, excludeId = null) {
    const c = String(code ?? "").trim().toUpperCase();
    if (!c) return null;
    const q = { code: c };
    const ex = Number(excludeId);
    if (excludeId != null && excludeId !== "" && Number.isFinite(ex) && ex > 0) {
      q.id = { $ne: ex };
    }
    const row = await getDb().collection("counters").findOne(q);
    return stripCounter(row);
  }

  async createForAdmin({ store_id, code, name, pin }) {
    const sid = Number(store_id);
    const codeU = String(code ?? "").trim().toUpperCase();
    const nameT = String(name ?? "").trim();
    const pinStr = String(pin ?? "");
    if (!Number.isFinite(sid) || sid <= 0) return { ok: false, error: "validation_failed", field: "store_id" };
    if (!codeU) return { ok: false, error: "validation_failed", field: "code" };
    if (!nameT) return { ok: false, error: "validation_failed", field: "name" };
    if (pinStr.length < 4) return { ok: false, error: "pin_short" };
    if (await this.findByCode(codeU, null)) return { ok: false, error: "code_taken" };
    const id = await nextSeq("counters");
    const now = new Date();
    await getDb().collection("counters").insertOne({
      id,
      store_id: sid,
      code: codeU,
      name: nameT,
      pin_hash: bcrypt.hashSync(pinStr, 10),
      is_active: 1,
      created_at: now,
      updated_at: now,
    });
    return { ok: true, id };
  }

  async updateForAdmin(id, body) {
    const cid = Number(id);
    if (!Number.isFinite(cid) || cid <= 0) return { ok: false, error: "invalid_id" };
    const row = await this.findRowWithPin(cid);
    if (!row) return { ok: false, error: "not_found" };

    const patch = {};
    if (body.store_id !== undefined) {
      const sid = Number(body.store_id);
      if (!Number.isFinite(sid) || sid <= 0) return { ok: false, error: "validation_failed", field: "store_id" };
      patch.store_id = sid;
    }
    if (body.code !== undefined) patch.code = String(body.code).trim().toUpperCase();
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.is_active !== undefined) {
      patch.is_active = body.is_active === false || body.is_active === 0 ? 0 : 1;
    }

    const code = patch.code ?? row.code;
    const dup = await this.findByCode(code, cid);
    if (dup) return { ok: false, error: "code_taken" };

    const pinNew = String(body.pin_new ?? "").trim();
    const pinConfirm = String(body.pin_confirm ?? "").trim();
    if (pinNew !== "") {
      if (pinNew.length < 4) return { ok: false, error: "pin_short" };
      if (pinNew !== pinConfirm) return { ok: false, error: "pin_mismatch" };
      patch.pin_hash = bcrypt.hashSync(pinNew, 10);
    }

    if (Object.keys(patch).length === 0) return { ok: true };

    patch.updated_at = new Date();
    await getDb().collection("counters").updateOne({ id: cid }, { $set: patch });
    return { ok: true };
  }

  async toggleActive(id) {
    const row = await this.findRowWithPin(Number(id));
    if (!row) return { ok: false, error: "not_found" };
    const next = row.is_active === 1 || row.is_active === true ? 0 : 1;
    await getDb()
      .collection("counters")
      .updateOne({ id: Number(id) }, { $set: { is_active: next, updated_at: new Date() } });
    return { ok: true, is_active: next };
  }
}
