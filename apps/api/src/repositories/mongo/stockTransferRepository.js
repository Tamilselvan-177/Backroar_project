import { getDb } from "../../db/mongo.js";
import { nextSeq } from "./counter.js";

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function asVariantArray(v) {
  return Array.isArray(v) ? v : [];
}

function activeVariants(p) {
  return asVariantArray(p?.variants).filter((v) => v.is_active !== 0 && v.is_active !== false);
}

function posAvailableEmbedded(p, variantId) {
  if (variantId != null && !Number.isNaN(Number(variantId))) {
    const v = asVariantArray(p?.variants).find((x) => Number(x.id) === Number(variantId));
    return Math.max(0, Math.floor(Number(v?.quantity) || 0));
  }
  return Math.max(0, Math.floor(Number(p.stock_quantity) || 0));
}

function normalizeStoreId(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export class MongoStockTransferRepository {
  async countActiveStores() {
    return getDb().collection("stores").countDocuments({ is_active: { $in: [1, true] } });
  }

  async getStoreProductRow(storeId, productId) {
    return getDb()
      .collection("store_stock")
      .findOne({ store_id: Number(storeId), product_id: Number(productId) });
  }

  async getStoreVariantRow(storeId, variantId) {
    return getDb()
      .collection("variant_store_stock")
      .findOne({ store_id: Number(storeId), variant_id: Number(variantId) });
  }

  /**
   * Qty available at store: explicit row, else embedded stock when only one active store (legacy).
   */
  async getAvailableForLine(storeId, productId, variantId) {
    const p = await getDb().collection("products").findOne({ id: Number(productId) });
    return this.getLineQtyAtStore(Number(storeId), Number(productId), variantId, p);
  }

  async getLineQtyAtStore(storeId, productId, variantId, productDoc) {
    const sid = Number(storeId);
    const pid = Number(productId);
    const vid = variantId != null && !Number.isNaN(Number(variantId)) ? Number(variantId) : null;
    const stores = await this.countActiveStores();
    const productShopId = normalizeStoreId(productDoc?.shop_id);
    if (vid != null) {
      const row = await this.getStoreVariantRow(sid, vid);
      if (row) return Math.max(0, Math.floor(Number(row.quantity) || 0));
      if (productDoc) {
        if (stores <= 1) return posAvailableEmbedded(productDoc, vid);
        if (productShopId > 0 && productShopId === sid) return posAvailableEmbedded(productDoc, vid);
        const anyVariantRow = await getDb().collection("variant_store_stock").findOne({ variant_id: vid });
        if (!anyVariantRow && productShopId === 0) return posAvailableEmbedded(productDoc, vid);
      }
      return 0;
    }
    const row = await this.getStoreProductRow(sid, pid);
    if (row) return Math.max(0, Math.floor(Number(row.quantity) || 0));
    if (productDoc) {
      if (stores <= 1) return posAvailableEmbedded(productDoc, null);
      if (productShopId > 0 && productShopId === sid) return posAvailableEmbedded(productDoc, null);
      const anyProductRow = await getDb().collection("store_stock").findOne({ product_id: pid });
      if (!anyProductRow && productShopId === 0) return posAvailableEmbedded(productDoc, null);
    }
    return 0;
  }

  async ensureStoreProductRow(storeId, productId, initialQty) {
    const db = getDb();
    const sid = Number(storeId);
    const pid = Number(productId);
    const existing = await db.collection("store_stock").findOne({ store_id: sid, product_id: pid });
    if (existing) return Math.max(0, Math.floor(Number(existing.quantity) || 0));
    const q = Math.max(0, Math.floor(Number(initialQty) || 0));
    const id = await nextSeq("store_stock");
    const now = new Date();
    await db.collection("store_stock").insertOne({
      id,
      store_id: sid,
      product_id: pid,
      quantity: q,
      created_at: now,
      updated_at: now,
    });
    return q;
  }

  async ensureStoreVariantRow(storeId, variantId, productId, initialQty) {
    const db = getDb();
    const sid = Number(storeId);
    const vid = Number(variantId);
    const pid = Number(productId);
    const existing = await db.collection("variant_store_stock").findOne({ store_id: sid, variant_id: vid });
    if (existing) return Math.max(0, Math.floor(Number(existing.quantity) || 0));
    const q = Math.max(0, Math.floor(Number(initialQty) || 0));
    const id = await nextSeq("variant_store_stock");
    const now = new Date();
    await db.collection("variant_store_stock").insertOne({
      id,
      store_id: sid,
      variant_id: vid,
      product_id: pid,
      quantity: q,
      created_at: now,
      updated_at: now,
    });
    return q;
  }

  async adjustStoreProductQuantity(storeId, productId, delta) {
    const sid = Number(storeId);
    const pid = Number(productId);
    const d = Math.floor(Number(delta) || 0);
    if (!d) return { ok: true };
    const db = getDb();
    const p = await db.collection("products").findOne({ id: pid });
    if (!p) return { ok: false, error: "product_not_found" };
    if (activeVariants(p).length) return { ok: false, error: "multi_variant_use_barcode" };
    let row = await this.getStoreProductRow(sid, pid);
    let cur = row ? Math.max(0, Math.floor(Number(row.quantity) || 0)) : await this.getLineQtyAtStore(sid, pid, null, p);
    if (!row) {
      await this.ensureStoreProductRow(sid, pid, cur);
      row = await this.getStoreProductRow(sid, pid);
      cur = Math.max(0, Math.floor(Number(row?.quantity) || 0));
    }
    const next = cur + d;
    if (next < 0) return { ok: false, error: "insufficient_stock" };
    await db.collection("store_stock").updateOne(
      { store_id: sid, product_id: pid },
      { $set: { quantity: next, updated_at: new Date() } }
    );
    await this._syncProductStockFromStoreRows(pid);
    return { ok: true };
  }

  async adjustStoreVariantQuantity(storeId, productId, variantId, delta) {
    const sid = Number(storeId);
    const pid = Number(productId);
    const vid = Number(variantId);
    const d = Math.floor(Number(delta) || 0);
    if (!d) return { ok: true };
    const db = getDb();
    const p = await db.collection("products").findOne({ id: pid });
    if (!p) return { ok: false, error: "product_not_found" };
    let row = await this.getStoreVariantRow(sid, vid);
    let cur = row ? Math.max(0, Math.floor(Number(row.quantity) || 0)) : await this.getLineQtyAtStore(sid, pid, vid, p);
    if (!row) {
      await this.ensureStoreVariantRow(sid, vid, pid, cur);
      row = await this.getStoreVariantRow(sid, vid);
      cur = Math.max(0, Math.floor(Number(row?.quantity) || 0));
    }
    const next = cur + d;
    if (next < 0) return { ok: false, error: "insufficient_stock" };
    await db.collection("variant_store_stock").updateOne(
      { store_id: sid, variant_id: vid },
      { $set: { quantity: next, updated_at: new Date() } }
    );
    await this._syncVariantEmbeddedFromRows(pid, vid);
    return { ok: true };
  }

  async _syncProductStockFromStoreRows(productId) {
    const pid = Number(productId);
    const db = getDb();
    const p = await db.collection("products").findOne({ id: pid });
    if (!p) return;
    const vars = activeVariants(p);
    if (vars.length) {
      const tot = vars.reduce((s, v) => s + Math.max(0, Math.floor(Number(v.quantity) || 0)), 0);
      await db.collection("products").updateOne({ id: pid }, { $set: { stock_quantity: tot, updated_at: new Date() } });
      return;
    }
    const rows = await db.collection("store_stock").find({ product_id: pid }).toArray();
    if (!rows.length) return;
    const sum = rows.reduce((s, r) => s + Math.max(0, Math.floor(Number(r.quantity) || 0)), 0);
    await db.collection("products").updateOne({ id: pid }, { $set: { stock_quantity: sum, updated_at: new Date() } });
  }

  async _syncVariantEmbeddedFromRows(productId, variantId) {
    const pid = Number(productId);
    const vid = Number(variantId);
    const db = getDb();
    const rows = await db.collection("variant_store_stock").find({ variant_id: vid }).toArray();
    const sum = rows.reduce((s, r) => s + Math.max(0, Math.floor(Number(r.quantity) || 0)), 0);
    await db.collection("products").updateOne(
      { id: pid, variants: { $elemMatch: { id: vid } } },
      { $set: { "variants.$.quantity": sum, updated_at: new Date() } }
    );
    const p = await db.collection("products").findOne({ id: pid });
    if (p?.variants?.length) {
      const tot = activeVariants(p).reduce((s, v) => s + Math.max(0, Math.floor(Number(v.quantity) || 0)), 0);
      await db.collection("products").updateOne({ id: pid }, { $set: { stock_quantity: tot, updated_at: new Date() } });
    }
  }

  async searchProductsAtStore(storeId, q, limit = 24) {
    const term = String(q ?? "").trim();
    if (term.length < 2) return [];
    const sid = Number(storeId);
    const re = new RegExp(escapeRegex(term), "i");
    const db = getDb();
    const rows = await db
      .collection("products")
      .find({
        $and: [{ is_active: { $in: [1, true] } }, { $or: [{ name: re }, { sku: re }] }],
      })
      .sort({ name: 1 })
      .limit(Math.min(48, Math.max(1, Number(limit) || 24)))
      .toArray();
    const out = [];
    for (const p of rows) {
      if (Number(p.no_store_stock) === 1) continue;
      const vars = activeVariants(p);
      const baseName = String(p.name ?? "").trim() || "Item";

      if (vars.length === 0) {
        const available = await this.getLineQtyAtStore(sid, p.id, null, p);
        if (available <= 0) continue;
        out.push({
          product_id: p.id,
          variant_id: null,
          name: baseName,
          sku: p.sku ?? "",
          available,
        });
        continue;
      }

      for (const v of vars) {
        const variantId = Number(v.id);
        const available = await this.getLineQtyAtStore(sid, p.id, variantId, p);
        if (available <= 0) continue;
        const label = String(v.variant_name ?? "").trim();
        const name = label ? `${baseName} — ${label}` : baseName;
        out.push({
          product_id: p.id,
          variant_id: variantId,
          name,
          sku: p.sku ?? "",
          available,
        });
      }
    }
    return out;
  }

  async createTransferRecord({ sourceStoreId, destStoreId, userId, itemCount }) {
    const id = await nextSeq("stock_transfers");
    const num = `TRF-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(Math.floor(Math.random() * 9999) + 1).padStart(4, "0")}`;
    const now = new Date();
    await getDb().collection("stock_transfers").insertOne({
      id,
      transfer_number: num,
      source_store_id: Number(sourceStoreId),
      dest_store_id: Number(destStoreId),
      initiated_by: Number(userId) || null,
      total_items: itemCount,
      status: "COMPLETED",
      created_at: now,
      completed_at: now,
    });
    return { id, transfer_number: num };
  }

  async insertTransferItem(transferId, productId, variantId, qty) {
    const id = await nextSeq("stock_transfer_items");
    await getDb().collection("stock_transfer_items").insertOne({
      id,
      transfer_id: Number(transferId),
      product_id: Number(productId),
      variant_id: variantId != null ? Number(variantId) : null,
      quantity: Math.floor(Number(qty) || 0),
    });
  }
}
