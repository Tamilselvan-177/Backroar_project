import { getDb } from "../../db/mongo.js";
import { nextSeq } from "./counter.js";

function strip(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return rest;
}

function toIso(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString();
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

function parseDateInput(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function coerceDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  return parseDateInput(v);
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function serializeCoupon(row) {
  if (!row) return null;
  const o = strip(row);
  return {
    ...o,
    valid_from: toIso(o.valid_from),
    valid_to: toIso(o.valid_to),
  };
}

export class MongoCouponRepository {
  async listAll() {
    const rows = await getDb().collection("coupons").find({}).sort({ code: 1 }).toArray();
    return rows.map((r) => serializeCoupon(r));
  }

  async findById(id) {
    const c = await getDb().collection("coupons").findOne({ id: Number(id) });
    return serializeCoupon(c);
  }

  async findByCode(code, excludeId = null) {
    const codeU = String(code ?? "").trim().toUpperCase();
    if (!codeU) return null;
    const q = { code: codeU };
    const ex = Number(excludeId);
    if (excludeId != null && excludeId !== "" && Number.isFinite(ex) && ex > 0) {
      q.id = { $ne: ex };
    }
    const row = await getDb().collection("coupons").findOne(q);
    return strip(row);
  }

  _normalizeBody(b, existing = null) {
    const dtype = String(b.discount_type ?? existing?.discount_type ?? "PERCENT")
      .trim()
      .toUpperCase();
    const discount_type = dtype === "FIXED" ? "FIXED" : "PERCENT";
    const code = String(b.code ?? existing?.code ?? "").trim().toUpperCase();
    const discount_value = Number(b.discount_value ?? existing?.discount_value ?? 0);
    const min_purchase = Number(b.min_purchase ?? existing?.min_purchase ?? 0);
    let max_discount = Number(b.max_discount ?? existing?.max_discount ?? 0);
    if (discount_type === "FIXED") max_discount = 0;
    const usage_limit = Math.max(0, Math.floor(Number(b.usage_limit ?? existing?.usage_limit ?? 0)));
    const per_user_limit = Math.max(0, Math.floor(Number(b.per_user_limit ?? existing?.per_user_limit ?? 0)));
    const valid_from =
      b.valid_from != null && String(b.valid_from).trim() !== ""
        ? parseDateInput(b.valid_from)
        : coerceDate(existing?.valid_from);
    const valid_to =
      b.valid_to != null && String(b.valid_to).trim() !== ""
        ? parseDateInput(b.valid_to)
        : coerceDate(existing?.valid_to);
    let is_active = 1;
    if (b.is_active !== undefined && b.is_active !== null) {
      is_active = b.is_active === false || b.is_active === 0 ? 0 : 1;
    } else if (existing) {
      is_active = existing.is_active === 0 || existing.is_active === false ? 0 : 1;
    }
    const description = String(b.description ?? existing?.description ?? "").trim();
    return {
      code,
      discount_type,
      discount_value,
      min_purchase,
      max_discount,
      usage_limit,
      per_user_limit,
      valid_from,
      valid_to,
      is_active,
      description,
    };
  }

  _validate(n) {
    if (!n.code || n.code.length < 3 || n.code.length > 50) return { ok: false, error: "code_invalid" };
    if (!n.valid_from || !n.valid_to) return { ok: false, error: "dates_required" };
    if (n.valid_to.getTime() < n.valid_from.getTime()) return { ok: false, error: "valid_to_before_from" };
    if (!(n.discount_value > 0)) return { ok: false, error: "discount_value_invalid" };
    if (n.discount_type === "PERCENT" && n.discount_value > 100) return { ok: false, error: "percent_too_high" };
    return { ok: true };
  }

  async create(b) {
    const n = this._normalizeBody(b, null);
    const v = this._validate(n);
    if (!v.ok) return v;
    if (await this.findByCode(n.code, null)) return { ok: false, error: "code_taken" };
    const id = await nextSeq("coupons");
    const now = new Date();
    await getDb().collection("coupons").insertOne({
      id,
      ...n,
      created_at: now,
      updated_at: now,
    });
    return { ok: true, id };
  }

  async update(id, b) {
    const cid = Number(id);
    const existing = await getDb().collection("coupons").findOne({ id: cid });
    if (!existing) return { ok: false, error: "not_found" };
    const n = this._normalizeBody(b, strip(existing));
    const v = this._validate(n);
    if (!v.ok) return v;
    const dup = await this.findByCode(n.code, cid);
    if (dup) return { ok: false, error: "code_taken" };
    await getDb()
      .collection("coupons")
      .updateOne({ id: cid }, { $set: { ...n, updated_at: new Date() } });
    return { ok: true };
  }

  async deleteById(id) {
    const r = await getDb().collection("coupons").deleteOne({ id: Number(id) });
    if (r.deletedCount === 0) return { ok: false, error: "not_found" };
    return { ok: true };
  }

  async quoteForCheckout({ code, userId, subtotal }) {
    const db = getDb();
    const codeU = String(code ?? "").trim().toUpperCase();
    const subtotalNum = Math.max(0, round2(subtotal));
    const uid = Number(userId);
    if (!codeU) {
      return { ok: false, error: "coupon_required", message: "Enter a coupon code." };
    }
    const raw = await db.collection("coupons").findOne({ code: codeU });
    if (!raw) {
      return { ok: false, error: "coupon_not_found", message: "Coupon code not found." };
    }
    const coupon = serializeCoupon(raw);
    if (!(coupon.is_active === 1 || coupon.is_active === true)) {
      return { ok: false, error: "coupon_inactive", message: "This coupon is inactive." };
    }
    const now = new Date();
    const from = coerceDate(coupon.valid_from);
    const to = coerceDate(coupon.valid_to);
    if (from && now.getTime() < from.getTime()) {
      return { ok: false, error: "coupon_not_started", message: "This coupon is not active yet." };
    }
    if (to && now.getTime() > to.getTime()) {
      return { ok: false, error: "coupon_expired", message: "This coupon has expired." };
    }
    if (subtotalNum < Math.max(0, Number(coupon.min_purchase) || 0)) {
      return {
        ok: false,
        error: "coupon_min_purchase",
        message: `Minimum purchase is ₹${Math.max(0, Number(coupon.min_purchase) || 0).toFixed(2)} for this coupon.`,
      };
    }
    if ((Number(coupon.usage_limit) || 0) > 0) {
      const used = await db.collection("orders").countDocuments({ coupon_id: Number(coupon.id) });
      if (used >= Number(coupon.usage_limit)) {
        return { ok: false, error: "coupon_usage_limit_reached", message: "This coupon has reached its usage limit." };
      }
    }
    if ((Number(coupon.per_user_limit) || 0) > 0 && Number.isFinite(uid) && uid > 0) {
      const usedByUser = await db
        .collection("orders")
        .countDocuments({ coupon_id: Number(coupon.id), user_id: uid });
      if (usedByUser >= Number(coupon.per_user_limit)) {
        return { ok: false, error: "coupon_user_limit_reached", message: "You have already used this coupon the maximum number of times." };
      }
    }

    let discountAmount = 0;
    if (String(coupon.discount_type).toUpperCase() === "FIXED") {
      discountAmount = Number(coupon.discount_value) || 0;
    } else {
      discountAmount = subtotalNum * ((Number(coupon.discount_value) || 0) / 100);
      const cap = Math.max(0, Number(coupon.max_discount) || 0);
      if (cap > 0) discountAmount = Math.min(discountAmount, cap);
    }
    discountAmount = Math.min(subtotalNum, Math.max(0, round2(discountAmount)));
    return {
      ok: true,
      coupon,
      discount_amount: discountAmount,
    };
  }
}
