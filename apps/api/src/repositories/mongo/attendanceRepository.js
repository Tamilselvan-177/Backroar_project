import { getDb } from "../../db/mongo.js";
import { nextSeq } from "./counter.js";

function ymdFromDate(d) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
}

export class MongoAttendanceRepository {
  async getTodayRecord(userId) {
    const uid = Number(userId);
    const key = ymdFromDate(new Date());
    return getDb().collection("attendance").findOne({ user_id: uid, date: key });
  }

  async checkIn(userId, storeId, notes) {
    const uid = Number(userId);
    const key = ymdFromDate(new Date());
    const db = getDb();
    const existing = await db.collection("attendance").findOne({ user_id: uid, date: key });
    if (existing?.check_in) return { ok: false, error: "already_checked_in" };
    const id = await nextSeq("attendance");
    const now = new Date();
    await db.collection("attendance").insertOne({
      id,
      user_id: uid,
      store_id: storeId != null && Number(storeId) > 0 ? Number(storeId) : null,
      date: key,
      check_in: now,
      check_out: null,
      status: "present",
      notes: notes != null ? String(notes).slice(0, 500) : null,
      created_at: now,
      updated_at: now,
    });
    return { ok: true, id };
  }

  async checkOut(userId, notes) {
    const uid = Number(userId);
    const key = ymdFromDate(new Date());
    const db = getDb();
    const row = await db.collection("attendance").findOne({ user_id: uid, date: key });
    if (!row?.check_in) return { ok: false, error: "not_checked_in" };
    if (row.check_out) return { ok: false, error: "already_checked_out" };
    const now = new Date();
    await db.collection("attendance").updateOne(
      { id: row.id },
      {
        $set: {
          check_out: now,
          updated_at: now,
          notes_out: notes != null ? String(notes).slice(0, 500) : row.notes_out ?? null,
        },
      }
    );
    return { ok: true };
  }

  async listByDate(dateStr, storeId) {
    const key = String(dateStr ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return [];
    const q = { date: key };
    if (Number(storeId) > 0) q.store_id = Number(storeId);
    return getDb().collection("attendance").find(q).sort({ check_in: 1 }).toArray();
  }

  async listMonthForUser(userId, monthStart, monthEnd) {
    const uid = Number(userId);
    const db = getDb();
    return db
      .collection("attendance")
      .find({
        user_id: uid,
        date: { $gte: String(monthStart).slice(0, 10), $lte: String(monthEnd).slice(0, 10) },
      })
      .sort({ date: -1 })
      .toArray();
  }

  /** Admin mark / upsert row for a user+date. */
  async upsertMark({ userId, date, checkInIso, checkOutIso, status, notes, adminUserId }) {
    const uid = Number(userId);
    const key = String(date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !uid) return { ok: false, error: "validation_failed" };
    const db = getDb();
    const existing = await db.collection("attendance").findOne({ user_id: uid, date: key });
    const now = new Date();
    const st = String(status ?? "present").slice(0, 32);
    const check_in = checkInIso ? new Date(checkInIso) : null;
    const check_out = checkOutIso ? new Date(checkOutIso) : null;
    if (existing) {
      await db.collection("attendance").updateOne(
        { id: existing.id },
        {
          $set: {
            check_in: check_in ?? existing.check_in,
            check_out: check_out ?? existing.check_out,
            status: st,
            notes: notes != null ? String(notes).slice(0, 500) : existing.notes,
            updated_at: now,
            marked_by: adminUserId != null ? Number(adminUserId) : null,
          },
        }
      );
      return { ok: true, id: existing.id };
    }
    const id = await nextSeq("attendance");
    await db.collection("attendance").insertOne({
      id,
      user_id: uid,
      store_id: null,
      date: key,
      check_in: check_in,
      check_out: check_out,
      status: st,
      notes: notes != null ? String(notes).slice(0, 500) : null,
      created_at: now,
      updated_at: now,
      marked_by: adminUserId != null ? Number(adminUserId) : null,
    });
    return { ok: true, id };
  }
}
