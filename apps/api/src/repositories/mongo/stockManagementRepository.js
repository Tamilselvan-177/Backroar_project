import { getDb } from "../../db/mongo.js";
import { nextSeq } from "./counter.js";
import { pickImagePath } from "./productRepository.js";

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function asVariantArray(v) {
  return Array.isArray(v) ? v : [];
}

function activeVariants(p) {
  return asVariantArray(p?.variants).filter((v) => v.is_active !== 0 && v.is_active !== false);
}

export class MongoStockManagementRepository {
  constructor(stockTransferRepo) {
    this.st = stockTransferRepo;
  }

  async _productTotalAtStore(productDoc, storeId) {
    const sid = Number(storeId);
    const vars = activeVariants(productDoc);
    if (vars.length) {
      let sum = 0;
      for (const v of vars) {
        sum += await this.st.getLineQtyAtStore(sid, productDoc.id, Number(v.id), productDoc);
      }
      return sum;
    }
    return this.st.getLineQtyAtStore(sid, productDoc.id, null, productDoc);
  }

  async _productTotalAllStores(productDoc) {
    const db = getDb();
    const vars = activeVariants(productDoc);
    const pid = Number(productDoc.id);
    if (vars.length) {
      const ids = vars.map((v) => Number(v.id));
      const agg = await db
        .collection("variant_store_stock")
        .aggregate([
          { $match: { variant_id: { $in: ids } } },
          { $group: { _id: null, t: { $sum: { $ifNull: ["$quantity", 0] } } } },
        ])
        .toArray();
      return Math.max(0, Math.floor(Number(agg[0]?.t) || 0));
    }
    const agg = await db
      .collection("store_stock")
      .aggregate([{ $match: { product_id: pid } }, { $group: { _id: null, t: { $sum: { $ifNull: ["$quantity", 0] } } } }])
      .toArray();
    return Math.max(0, Math.floor(Number(agg[0]?.t) || 0));
  }

  async listInventory({ storeId = 0, categoryId = 0, search = "", lowStockOnly = false, page = 1, perPage = 40 }) {
    const db = getDb();
    const match = { is_active: { $in: [1, true] } };
    if (Number(categoryId) > 0) match.category_id = Number(categoryId);
    const term = String(search ?? "").trim();
    if (term.length >= 1) {
      const re = new RegExp(escapeRegex(term), "i");
      match.$or = [{ name: re }, { sku: re }];
    }
    const pg = Math.max(1, Math.floor(Number(page) || 1));
    const size = Math.min(80, Math.max(10, Math.floor(Number(perPage) || 40)));

    const totalProducts = await db.collection("products").countDocuments(match);
    const rows = await db
      .collection("products")
      .find(match)
      .sort({ name: 1 })
      .skip((pg - 1) * size)
      .limit(size)
      .toArray();

    const catIds = [...new Set(rows.map((r) => r.category_id).filter((x) => x != null))];
    const cats = catIds.length ? await db.collection("categories").find({ id: { $in: catIds } }).toArray() : [];
    const catMap = Object.fromEntries(cats.map((c) => [c.id, c.name]));

    const sid = Number(storeId);
    const products = [];
    for (const p of rows) {
      if (Number(p.no_store_stock) === 1) continue;
      const variantCount = activeVariants(p).length;
      const totalStock =
        sid > 0 ? await this._productTotalAtStore(p, sid) : await this._productTotalAllStores(p);
      if (totalStock <= 0 && variantCount <= 0) continue;
      if (lowStockOnly && totalStock > 5) continue;
      products.push({
        id: p.id,
        name: p.name,
        sku: p.sku ?? "",
        category_id: p.category_id ?? null,
        category_name: catMap[p.category_id] ?? "",
        image_path: pickImagePath(p),
        variant_count: variantCount,
        total_stock: totalStock,
      });
    }

    return {
      products,
      pagination: { page: pg, per_page: size, product_match_total: totalProducts },
    };
  }

  async getProductDetail(productId, storeFilter = 0) {
    const pid = Number(productId);
    const db = getDb();
    const p = await db.collection("products").findOne({ id: pid });
    if (!p) return null;
    const cat = p.category_id ? await db.collection("categories").findOne({ id: Number(p.category_id) }) : null;
    const stores = await db
      .collection("stores")
      .find({ is_active: { $in: [1, true] } })
      .sort({ name: 1 })
      .toArray();
    const storeName = Object.fromEntries(stores.map((s) => [s.id, s.name]));

    const sid = Number(storeFilter);
    const vars = activeVariants(p);
    const variant_stock = [];

    for (const v of vars) {
      const vid = Number(v.id);
      const threshold = Math.max(0, Math.floor(Number(v.low_stock_threshold) || 5));
      const storesOut = [];
      if (sid > 0) {
        const qty = await this.st.getLineQtyAtStore(sid, pid, vid, p);
        const row = await this.st.getStoreVariantRow(sid, vid);
        const th = row?.low_stock_threshold != null ? Math.floor(Number(row.low_stock_threshold) || 5) : threshold;
        storesOut.push({
          store_id: sid,
          store_name: storeName[sid] ?? `Store ${sid}`,
          quantity: qty,
          low_stock_threshold: th,
          is_low_stock: qty <= th,
        });
      } else {
        const stockRows = await db.collection("variant_store_stock").find({ variant_id: vid }).toArray();
        for (const r of stockRows) {
          const qty = Math.max(0, Math.floor(Number(r.quantity) || 0));
          const th = r.low_stock_threshold != null ? Math.floor(Number(r.low_stock_threshold) || 5) : threshold;
          storesOut.push({
            store_id: r.store_id,
            store_name: storeName[r.store_id] ?? `Store ${r.store_id}`,
            quantity: qty,
            low_stock_threshold: th,
            is_low_stock: qty <= th,
          });
        }
      }
      variant_stock.push({
        variant_id: vid,
        variant_name: v.variant_name ?? "",
        attribute_name: v.attribute_name ?? null,
        attribute_value: v.attribute_value ?? null,
        variant_image: v.image_path ?? null,
        stores: storesOut,
      });
    }

    return {
      product: {
        id: p.id,
        name: p.name,
        sku: p.sku ?? "",
        category_name: cat?.name ?? "",
        image_path: pickImagePath(p),
      },
      variants: vars.map((v) => ({
        id: v.id,
        variant_name: v.variant_name,
        attribute_name: v.attribute_name,
        attribute_value: v.attribute_value,
        image_path: v.image_path,
      })),
      variant_stock,
      stores: stores.map((s) => ({ id: s.id, name: s.name })),
      selected_store: sid,
    };
  }

  async getAdjustForm({ variantId, storeId }) {
    const vid = Math.floor(Number(variantId) || 0);
    const sid = Math.floor(Number(storeId) || 0);
    if (vid <= 0 || sid <= 0) return { ok: false, error: "invalid_params" };
    const db = getDb();
    const p = await db.collection("products").findOne({ "variants.id": vid });
    if (!p) return { ok: false, error: "variant_not_found" };
    const v = asVariantArray(p?.variants).find((x) => Number(x.id) === vid);
    if (!v || v.is_active === 0 || v.is_active === false) return { ok: false, error: "variant_inactive" };
    const stores = await db
      .collection("stores")
      .find({ is_active: { $in: [1, true] } })
      .sort({ name: 1 })
      .toArray();
    const current_stock = await this.st.getLineQtyAtStore(sid, p.id, vid, p);
    return {
      ok: true,
      product: { id: p.id, name: p.name },
      variant: {
        id: v.id,
        variant_name: v.variant_name,
        attribute_name: v.attribute_name,
        attribute_value: v.attribute_value,
      },
      stores: stores.map((s) => ({ id: s.id, name: s.name })),
      selected_store: sid,
      current_stock,
    };
  }

  async insertMovement(row) {
    const id = await nextSeq("stock_movements");
    const now = new Date();
    await getDb().collection("stock_movements").insertOne({
      id,
      store_id: Number(row.store_id),
      product_id: Number(row.product_id),
      variant_id: row.variant_id != null ? Number(row.variant_id) : null,
      quantity: Math.max(0, Math.floor(Number(row.quantity) || 0)),
      direction: row.direction === "OUT" ? "OUT" : "IN",
      reason: String(row.reason ?? "ADJUST").slice(0, 64),
      previous_stock: Math.max(0, Math.floor(Number(row.previous_stock) || 0)),
      new_stock: Math.max(0, Math.floor(Number(row.new_stock) || 0)),
      user_id: row.user_id != null ? Number(row.user_id) : null,
      notes: row.notes != null ? String(row.notes).slice(0, 500) : null,
      created_at: now,
    });
  }

  async adjustWithLog({ variantId, productId, storeId, action, quantity, reason, notes, userId }) {
    const sid = Number(storeId);
    if (!sid) return { ok: false, error: "store_required" };
    const q = Math.floor(Number(quantity) || 0);
    if (q < 1) return { ok: false, error: "bad_quantity" };
    if (action !== "add" && action !== "remove") return { ok: false, error: "bad_action" };
    const delta = action === "add" ? q : -q;
    const db = getDb();
    const vid = variantId != null && Number(variantId) > 0 ? Number(variantId) : null;
    const recReason = String(reason || "ADJUST").trim().slice(0, 64) || "ADJUST";
    const noteStr = notes != null ? String(notes).trim().slice(0, 500) : null;
    const uid = userId != null ? Number(userId) : null;

    if (vid != null) {
      const p = await db.collection("products").findOne({ "variants.id": vid });
      if (!p) return { ok: false, error: "variant_not_found" };
      const v = asVariantArray(p?.variants).find((x) => Number(x.id) === vid);
      if (!v || v.is_active === 0 || v.is_active === false) return { ok: false, error: "variant_inactive" };
      const pid = Number(p.id);
      const prev = await this.st.getLineQtyAtStore(sid, pid, vid, p);
      const r = await this.st.adjustStoreVariantQuantity(sid, pid, vid, delta);
      if (!r.ok) return { ok: false, error: r.error, previous_stock: prev };
      const newStock = await this.st.getLineQtyAtStore(sid, pid, vid, p);
      await this.insertMovement({
        store_id: sid,
        product_id: pid,
        variant_id: vid,
        quantity: q,
        direction: action === "add" ? "IN" : "OUT",
        reason: recReason,
        previous_stock: prev,
        new_stock: newStock,
        user_id: uid,
        notes: noteStr,
      });
      return { ok: true, previous_stock: prev, new_stock: newStock };
    }

    const pid = Number(productId);
    if (!pid) return { ok: false, error: "product_or_variant_required" };
    const p = await db.collection("products").findOne({ id: pid });
    if (!p) return { ok: false, error: "product_not_found" };
    if (activeVariants(p).length) return { ok: false, error: "variant_required" };
    const prev = await this.st.getLineQtyAtStore(sid, pid, null, p);
    const r = await this.st.adjustStoreProductQuantity(sid, pid, delta);
    if (!r.ok) return { ok: false, error: r.error, previous_stock: prev };
    const newStock = await this.st.getLineQtyAtStore(sid, pid, null, p);
    await this.insertMovement({
      store_id: sid,
      product_id: pid,
      variant_id: null,
      quantity: q,
      direction: action === "add" ? "IN" : "OUT",
      reason: recReason,
      previous_stock: prev,
      new_stock: newStock,
      user_id: uid,
      notes: noteStr,
    });
    return { ok: true, previous_stock: prev, new_stock: newStock };
  }

  async listMovements({ storeId = 0, variantId = 0, productId = 0, reason = "", page = 1, perPage = 20 }) {
    const db = getDb();
    const q = {};
    if (Number(storeId) > 0) q.store_id = Number(storeId);
    if (Number(variantId) > 0) q.variant_id = Number(variantId);
    if (Number(productId) > 0) q.product_id = Number(productId);
    if (String(reason).trim()) q.reason = String(reason).trim();

    const pg = Math.max(1, Math.floor(Number(page) || 1));
    const size = Math.min(50, Math.max(5, Math.floor(Number(perPage) || 20)));
    const total = await db.collection("stock_movements").countDocuments(q);
    const rows = await db
      .collection("stock_movements")
      .find(q)
      .sort({ created_at: -1 })
      .skip((pg - 1) * size)
      .limit(size)
      .toArray();

    const pids = [...new Set(rows.map((r) => r.product_id).filter(Boolean))];
    const products = pids.length ? await db.collection("products").find({ id: { $in: pids } }).toArray() : [];
    const pmap = Object.fromEntries(products.map((p) => [p.id, p]));

    const sids = [...new Set(rows.map((r) => r.store_id).filter(Boolean))];
    const stores = sids.length ? await db.collection("stores").find({ id: { $in: sids } }).toArray() : [];
    const smap = Object.fromEntries(stores.map((s) => [s.id, s.name]));

    const uids = [...new Set(rows.map((r) => r.user_id).filter((x) => x != null))];
    const users = uids.length ? await db.collection("users").find({ id: { $in: uids } }).toArray() : [];
    const umap = Object.fromEntries(users.map((u) => [u.id, u.name ?? u.email ?? `#${u.id}`]));

    const movements = rows.map((m) => {
      const pr = pmap[m.product_id];
      let variant_name = "";
      if (m.variant_id && pr) {
        const vv = asVariantArray(pr.variants).find((x) => Number(x.id) === Number(m.variant_id));
        variant_name = vv?.variant_name ?? "";
      }
      return {
        id: m.id,
        created_at: m.created_at,
        store_id: m.store_id,
        store_name: smap[m.store_id] ?? "",
        product_id: m.product_id,
        product_name: pr?.name ?? "",
        variant_id: m.variant_id,
        variant_name,
        quantity: m.quantity,
        direction: m.direction,
        reason: m.reason,
        previous_stock: m.previous_stock,
        new_stock: m.new_stock,
        user_name: m.user_id != null ? umap[m.user_id] ?? "" : "",
        notes: m.notes ?? "",
      };
    });

    return {
      movements,
      pagination: {
        total,
        current_page: pg,
        per_page: size,
        total_pages: Math.max(1, Math.ceil(total / size)),
      },
    };
  }

  async listLowStock({ storeId = 0, threshold = 5 }) {
    const db = getDb();
    const th = Math.max(0, Math.floor(Number(threshold) || 5));
    const match = { quantity: { $lte: th } };
    if (Number(storeId) > 0) match.store_id = Number(storeId);
    const rows = await db.collection("variant_store_stock").find(match).sort({ quantity: 1 }).limit(400).toArray();

    const pids = [...new Set(rows.map((r) => r.product_id).filter(Boolean))];
    const products = pids.length ? await db.collection("products").find({ id: { $in: pids }, is_active: { $in: [1, true] } }).toArray() : [];
    const pmap = Object.fromEntries(products.map((p) => [p.id, p]));

    const sids = [...new Set(rows.map((r) => r.store_id))];
    const stores = sids.length ? await db.collection("stores").find({ id: { $in: sids } }).toArray() : [];
    const smap = Object.fromEntries(stores.map((s) => [s.id, s]));

    const out = [];
    for (const r of rows) {
      const p = pmap[r.product_id];
      if (!p) continue;
      const vid = Number(r.variant_id);
      const v = asVariantArray(p?.variants).find((x) => Number(x.id) === vid);
      if (!v || v.is_active === 0 || v.is_active === false) continue;
      const st = smap[r.store_id];
      out.push({
        variant_id: vid,
        product_id: p.id,
        product_name: p.name,
        variant_name: v.variant_name ?? "",
        store_id: r.store_id,
        store_name: st?.name ?? "",
        quantity: Math.max(0, Math.floor(Number(r.quantity) || 0)),
        low_stock_threshold: th,
        image_path: pickImagePath(p),
      });
    }
    return { items: out };
  }

  async lowStockCountForStore(storeId, threshold = 5) {
    const { items } = await this.listLowStock({ storeId, threshold });
    return items.length;
  }
}
