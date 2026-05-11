import { getDb } from "../../db/mongo.js";
import { nextSeq } from "./counter.js";

function normStatus(s) {
  const t = String(s ?? "").trim().toLowerCase();
  if (t === "pending" || t === "approved" || t === "rejected") return t;
  return "pending";
}

export class MongoReviewRepository {
  async exists(userId, productId) {
    const row = await getDb()
      .collection("reviews")
      .findOne({ user_id: Number(userId), product_id: Number(productId) });
    return !!row;
  }

  /**
   * Verified purchase if user has a delivered order containing this product (flexible order doc shape).
   */
  async userVerifiedPurchase(userId, productId) {
    const db = getDb();
    const uid = Number(userId);
    const pid = Number(productId);
    try {
      const deliveredLabels = [/delivered/i, /^completed$/i];
      const cursor = db.collection("orders").find({ user_id: uid });
      for await (const o of cursor) {
        const status = String(o.order_status ?? o.status ?? "");
        if (!deliveredLabels.some((re) => re.test(status))) continue;
        const items = o.items ?? o.order_items ?? [];
        if (!Array.isArray(items)) continue;
        if (items.some((line) => Number(line.product_id) === pid)) return true;
      }
    } catch {
      /* collection missing or wrong shape */
    }
    return false;
  }

  async create({ userId, productId, rating, title, comment, status = "pending", isVerifiedPurchase = 0 }) {
    const id = await nextSeq("reviews");
    const now = new Date();
    await getDb().collection("reviews").insertOne({
      id,
      user_id: Number(userId),
      product_id: Number(productId),
      rating: Number(rating),
      title: String(title),
      comment: String(comment),
      status: normStatus(status),
      is_verified_purchase: isVerifiedPurchase ? 1 : 0,
      created_at: now,
      updated_at: now,
    });
    return id;
  }

  async listApprovedForProduct(productId) {
    const db = getDb();
    const pid = Number(productId);
    const approved = await db
      .collection("reviews")
      .find({ product_id: pid, status: { $regex: /^approved$/i } })
      .sort({ created_at: -1 })
      .toArray();
    const userIds = [...new Set(approved.map((r) => r.user_id))];
    const users =
      userIds.length > 0
        ? await db.collection("users").find({ id: { $in: userIds } }).toArray()
        : [];
    const umap = new Map(users.map((u) => [u.id, u.name]));
    return approved.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      created_at: r.created_at,
      is_verified_purchase: r.is_verified_purchase,
      user_name: umap.get(r.user_id) ?? "Customer",
    }));
  }

  async getAverageRating(productId) {
    const list = await getDb()
      .collection("reviews")
      .find({ product_id: Number(productId), status: { $regex: /^approved$/i } })
      .toArray();
    if (!list.length) return { avg_rating: null, total: 0 };
    const sum = list.reduce((s, r) => s + Number(r.rating), 0);
    return { avg_rating: sum / list.length, total: list.length };
  }

  /** Admin moderation. */
  async adminCounts() {
    const db = getDb();
    const col = db.collection("reviews");
    const [all, pending, approved, rejected] = await Promise.all([
      col.countDocuments({}),
      col.countDocuments({ status: { $regex: "^pending$", $options: "i" } }),
      col.countDocuments({ status: { $regex: "^approved$", $options: "i" } }),
      col.countDocuments({ status: { $regex: "^rejected$", $options: "i" } }),
    ]);
    return { all, pending, approved, rejected };
  }

  async adminList({ status = "pending", page = 1, limit = 30 } = {}) {
    const db = getDb();
    const st = String(status ?? "pending").toLowerCase();
    const allowed = ["all", "pending", "approved", "rejected"];
    const filter = {};
    if (allowed.includes(st) && st !== "all") {
      filter.status = { $regex: new RegExp(`^${st}$`, "i") };
    }
    const lim = Math.min(100, Math.max(1, Math.floor(Number(limit) || 30)));
    const pg = Math.max(1, Math.floor(Number(page) || 1));
    const skip = (pg - 1) * lim;
    const col = db.collection("reviews");
    const [total, rows] = await Promise.all([
      col.countDocuments(filter),
      col.find(filter).sort({ created_at: -1 }).skip(skip).limit(lim).toArray(),
    ]);
    const userIds = [...new Set(rows.map((r) => r.user_id).filter((x) => x != null))];
    const pids = [...new Set(rows.map((r) => r.product_id).filter((x) => x != null))];
    const [users, products] = await Promise.all([
      userIds.length ? db.collection("users").find({ id: { $in: userIds.map(Number) } }).toArray() : [],
      pids.length ? db.collection("products").find({ id: { $in: pids.map(Number) } }).project({ id: 1, name: 1, slug: 1 }).toArray() : [],
    ]);
    const umap = new Map(users.map((u) => [u.id, u]));
    const pmap = new Map(products.map((p) => [p.id, p]));
    const items = rows.map((r) => {
      const u = umap.get(Number(r.user_id));
      const p = pmap.get(Number(r.product_id));
      return {
        id: r.id,
        user_id: r.user_id,
        user_name: u?.name ?? "",
        user_email: u?.email ?? "",
        product_id: r.product_id,
        product_name: p?.name ?? "",
        product_slug: p?.slug ?? "",
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        status: r.status,
        is_verified_purchase: r.is_verified_purchase,
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    });
    return {
      items,
      total,
      page: pg,
      limit: lim,
      total_pages: Math.max(1, Math.ceil(total / lim)),
      status: st,
    };
  }

  async adminUpdateStatus(id, status) {
    const rid = Number(id);
    if (!Number.isFinite(rid) || rid <= 0) return { ok: false, error: "invalid_id" };
    const s = normStatus(status);
    if (!["pending", "approved", "rejected"].includes(s)) return { ok: false, error: "invalid_status" };
    const db = getDb();
    const r = await db.collection("reviews").updateOne({ id: rid }, { $set: { status: s, updated_at: new Date() } });
    if (r.matchedCount === 0) return { ok: false, error: "not_found" };
    return { ok: true };
  }

  async adminDelete(id) {
    const rid = Number(id);
    if (!Number.isFinite(rid) || rid <= 0) return { ok: false, error: "invalid_id" };
    const db = getDb();
    const del = await db.collection("reviews").deleteOne({ id: rid });
    if (del.deletedCount === 0) return { ok: false, error: "not_found" };
    return { ok: true };
  }

  async adminBulkAction({ action, ids }) {
    const allowed = ["approve", "reject", "delete"];
    if (!allowed.includes(String(action))) return { ok: false, error: "invalid_action" };
    const idList = (Array.isArray(ids) ? ids : [])
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!idList.length) return { ok: false, error: "no_ids" };
    const db = getDb();
    const col = db.collection("reviews");
    if (action === "delete") {
      const r = await col.deleteMany({ id: { $in: idList } });
      return { ok: true, affected: r.deletedCount };
    }
    const status = action === "approve" ? "approved" : "rejected";
    const r = await col.updateMany(
      { id: { $in: idList } },
      { $set: { status, updated_at: new Date() } }
    );
    return { ok: true, affected: r.modifiedCount };
  }
}
