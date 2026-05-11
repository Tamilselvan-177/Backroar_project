import { getDb } from "../../db/mongo.js";
import { nextSeq } from "./counter.js";
import { computeCartTotals } from "../../lib/cartTotals.js";

function generateOrderNumber() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const suf = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ORD-${ymd}-${suf}`;
}

function isProductActive(p) {
  return p?.is_active === 1 || p?.is_active === true;
}

function findVariant(product, variantId) {
  if (variantId == null || variantId === "") return null;
  const vid = Number(variantId);
  if (Number.isNaN(vid)) return null;
  return (product?.variants || []).find((v) => Number(v.id) === vid) ?? null;
}

/** Available units for a cart line (variant quantity if set, else product stock). */
export function availableStockForLine(item, product) {
  const v = findVariant(product, item.variant_id);
  if (v && v.quantity != null && v.quantity !== "" && !Number.isNaN(Number(v.quantity))) {
    return Number(v.quantity);
  }
  return Number(product?.stock_quantity ?? 0);
}

export function validateCartForCheckout(items, productMap) {
  const errors = [];
  for (const item of items) {
    const pid = Number(item.product_id);
    const p = productMap.get(pid);
    const name = item.product_name || `Product ${pid}`;
    if (!p || !isProductActive(p)) {
      errors.push(`${name} is no longer available.`);
      continue;
    }
    const avail = availableStockForLine(item, p);
    const q = Number(item.quantity ?? 0);
    if (q > avail) {
      errors.push(`${name} has only ${avail} items in stock.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

function sessionOpts(session) {
  return session ? { session } : {};
}

async function decrementStockForLine(db, session, productId, variantId, quantity) {
  const col = db.collection("products");
  const opts = sessionOpts(session);
  const pid = Number(productId);
  const qty = Number(quantity);
  const vid = variantId == null || variantId === "" ? null : Number(variantId);
  const now = new Date();

  if (vid != null && !Number.isNaN(vid)) {
    const p = await col.findOne({ id: pid }, opts);
    if (!p) return false;
    const variants = [...(p.variants || [])];
    const idx = variants.findIndex((x) => Number(x.id) === vid);
    if (idx >= 0) {
      const v = variants[idx];
      if (v.quantity != null && v.quantity !== "" && !Number.isNaN(Number(v.quantity))) {
        const current = Number(v.quantity);
        if (current < qty) return false;
        variants[idx] = { ...v, quantity: current - qty };
        const r = await col.updateOne({ id: pid }, { $set: { variants, updated_at: now } }, opts);
        return r.modifiedCount > 0;
      }
    }
  }

  const r = await col.updateOne(
    { id: pid, stock_quantity: { $gte: qty } },
    { $inc: { stock_quantity: -qty }, $set: { updated_at: now } },
    opts
  );
  return r.modifiedCount > 0;
}

/** Inverse of decrementStockForLine (rollback after failed checkout). */
async function incrementStockForLine(db, session, productId, variantId, quantity) {
  const col = db.collection("products");
  const opts = sessionOpts(session);
  const pid = Number(productId);
  const qty = Number(quantity);
  const vid = variantId == null || variantId === "" ? null : Number(variantId);
  const now = new Date();

  if (vid != null && !Number.isNaN(vid)) {
    const p = await col.findOne({ id: pid }, opts);
    if (!p) return;
    const variants = [...(p.variants || [])];
    const idx = variants.findIndex((x) => Number(x.id) === vid);
    if (idx >= 0) {
      const v = variants[idx];
      if (v.quantity != null && v.quantity !== "" && !Number.isNaN(Number(v.quantity))) {
        const current = Number(v.quantity);
        variants[idx] = { ...v, quantity: current + qty };
        await col.updateOne({ id: pid }, { $set: { variants, updated_at: now } }, opts);
        return;
      }
    }
  }

  await col.updateOne({ id: pid }, { $inc: { stock_quantity: qty }, $set: { updated_at: now } }, opts);
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeShopId(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function productPrimaryImagePath(product) {
  const rows = Array.isArray(product?.images) ? product.images : [];
  const hit = rows.find((im) => im && !im.variant_id && im.image_path);
  return hit?.image_path ?? "";
}

async function buildProductAndShopMaps(db, productIds) {
  const ids = [...new Set((productIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) {
    return { pmap: new Map(), smap: new Map() };
  }
  const products = await db
    .collection("products")
    .find({ id: { $in: ids } })
    .project({ id: 1, shop_id: 1, images: 1, variants: 1 })
    .toArray();
  const shopIds = [...new Set(products.map((p) => normalizeShopId(p?.shop_id)).filter(Boolean))];
  const stores =
    shopIds.length > 0
      ? await db
          .collection("stores")
          .find({ id: { $in: shopIds } })
          .project({ id: 1, name: 1 })
          .toArray()
      : [];
  return {
    pmap: new Map(products.map((p) => [Number(p.id), p])),
    smap: new Map(stores.map((s) => [Number(s.id), String(s.name ?? `Shop #${s.id}`)])),
  };
}

function enrichOrderItemsWithShop(items, pmap, smap) {
  return (items || []).map((line) => {
    const pid = Number(line?.product_id);
    const product = pmap.get(pid);
    const variant = findVariant(product, line?.variant_id);
    const shopId = normalizeShopId(line?.shop_id) ?? normalizeShopId(product?.shop_id);
    return {
      ...line,
      shop_id: shopId,
      shop_name:
        String(line?.shop_name ?? "").trim() || (shopId ? smap.get(shopId) ?? `Shop #${shopId}` : "Shared / unassigned"),
      variant_name:
        String(line?.variant_name ?? "").trim() ||
        (variant?.variant_name != null && String(variant.variant_name).trim() ? String(variant.variant_name).trim() : null),
      variant_image_path: line?.variant_image_path || variant?.image_path || "",
      image_path: line?.image_path || productPrimaryImagePath(product) || "",
    };
  });
}

function fulfillmentShopsFromItems(items) {
  const seen = new Map();
  for (const line of items || []) {
    const shopId = normalizeShopId(line?.shop_id);
    const shopName = String(line?.shop_name ?? "").trim();
    const key = shopId != null ? `id:${shopId}` : `name:${shopName || "shared"}`;
    if (!seen.has(key)) {
      seen.set(key, {
        id: shopId,
        name: shopName || "Shared / unassigned",
      });
    }
  }
  return [...seen.values()];
}

function fulfillmentShopLabel(shops) {
  if (!shops?.length) return "Shared / unassigned";
  if (shops.length === 1) return shops[0].name;
  return `${shops[0].name} +${shops.length - 1} more`;
}

function adminOrderListFilter({ orderStatus, paymentStatus, q, dateFrom, dateTo } = {}) {
  const parts = [];
  const os = orderStatus != null ? String(orderStatus).trim() : "";
  const ps = paymentStatus != null ? String(paymentStatus).trim() : "";
  if (os) parts.push({ order_status: os });
  if (ps) parts.push({ payment_status: ps });
  const df = dateFrom != null ? String(dateFrom).trim().slice(0, 10) : "";
  const dt = dateTo != null ? String(dateTo).trim().slice(0, 10) : "";
  if (df || dt) {
    const range = {};
    if (df && /^\d{4}-\d{2}-\d{2}$/.test(df)) range.$gte = new Date(`${df}T00:00:00.000Z`);
    if (dt && /^\d{4}-\d{2}-\d{2}$/.test(dt)) range.$lte = new Date(`${dt}T23:59:59.999Z`);
    if (Object.keys(range).length) parts.push({ created_at: range });
  }
  const qstr = q != null ? String(q).trim() : "";
  if (qstr) {
    const or = [
      { order_number: { $regex: escapeRegex(qstr), $options: "i" } },
      { shipping_name: { $regex: escapeRegex(qstr), $options: "i" } },
      { shipping_phone: { $regex: escapeRegex(qstr), $options: "i" } },
    ];
    if (/^\d+$/.test(qstr)) {
      const n = Number(qstr);
      or.push({ user_id: n });
      or.push({ id: n });
    }
    parts.push({ $or: or });
  }
  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0];
  return { $and: parts };
}

function serializeOrderDetail(o) {
  if (!o) return null;
  return {
    id: o.id,
    order_number: o.order_number,
    user_id: o.user_id,
    subtotal: o.subtotal,
    shipping_charge: o.shipping_charge,
    total_amount: o.total_amount,
    discount_amount: o.discount_amount ?? 0,
    coupon_code: o.coupon_code ?? null,
    payment_method: o.payment_method,
    payment_status: o.payment_status,
    order_status: o.order_status,
    shipping_name: o.shipping_name,
    shipping_phone: o.shipping_phone,
    shipping_address: o.shipping_address,
    shipping_city: o.shipping_city,
    shipping_state: o.shipping_state,
    shipping_pincode: o.shipping_pincode,
    items: o.items || [],
    created_at: o.created_at,
    updated_at: o.updated_at,
  };
}

export class MongoCheckoutRepository {
  async placeOrder({ userId, shipping, couponCode: _couponCode }, { cart, coupons }) {
    const uid = Number(userId);
    const items = await cart.getCartItems(uid);
    if (!items.length) {
      return { ok: false, error: "empty_cart", message: "Your cart is empty." };
    }

    const db = getDb();
    const pids = [...new Set(items.map((i) => Number(i.product_id)))];
    const products = await db.collection("products").find({ id: { $in: pids } }).toArray();
    const pmap = new Map(products.map((p) => [p.id, p]));

    const { valid, errors } = validateCartForCheckout(items, pmap);
    if (!valid) {
      return { ok: false, error: "cart_validation_failed", errors };
    }

    const totals = computeCartTotals(items);
    let couponApplied = { coupon: null, discount_amount: 0 };
    if (_couponCode) {
      const quote = await coupons.quoteForCheckout({
        code: _couponCode,
        userId: uid,
        subtotal: totals.subtotal,
      });
      if (!quote?.ok) {
        return { ok: false, error: quote?.error || "coupon_invalid", message: quote?.message || "Coupon is invalid." };
      }
      couponApplied = quote;
    }
    const orderNumber = generateOrderNumber();
    const addr1 = String(shipping.address_line1 || "").trim();
    const addr2 = String(shipping.address_line2 || "").trim();
    const shippingAddress = addr2 ? `${addr1}, ${addr2}` : addr1;

    const orderItems = items.map((it) => {
      const product = pmap.get(Number(it.product_id));
      const variant = findVariant(product, it.variant_id);
      const price = Number(it.sale_price ?? it.price ?? 0);
      const q = Number(it.quantity ?? 0);
      return {
        product_id: Number(it.product_id),
        variant_id: it.variant_id != null && it.variant_id !== "" ? Number(it.variant_id) : null,
        product_name: String(it.product_name ?? ""),
        variant_name:
          variant?.variant_name != null && String(variant.variant_name).trim() ? String(variant.variant_name).trim() : null,
        shop_id: normalizeShopId(product?.shop_id),
        image_path: productPrimaryImagePath(product),
        variant_image_path: variant?.image_path ?? "",
        price,
        quantity: q,
        subtotal: price * q,
      };
    });

    const orderId = await nextSeq("orders");
    const now = new Date();

    const orderDoc = {
      id: orderId,
      order_number: orderNumber,
      user_id: uid,
      subtotal: totals.subtotal,
      shipping_charge: totals.shipping,
      total_amount: Math.max(0, totals.total - Number(couponApplied.discount_amount || 0)),
      discount_amount: Number(couponApplied.discount_amount || 0),
      coupon_id: couponApplied.coupon?.id ?? null,
      coupon_code: couponApplied.coupon?.code ?? null,
      payment_method: "COD",
      payment_status: "Pending",
      order_status: "Pending",
      shipping_name: String(shipping.full_name || "").trim(),
      shipping_phone: String(shipping.phone || "").trim(),
      shipping_address: shippingAddress,
      shipping_city: String(shipping.city || "").trim(),
      shipping_state: String(shipping.state || "").trim(),
      shipping_pincode: String(shipping.pincode || "").trim(),
      items: orderItems,
      created_at: now,
      updated_at: now,
    };

    const applied = [];
    try {
      for (const it of items) {
        const ok = await decrementStockForLine(db, null, it.product_id, it.variant_id, it.quantity);
        if (!ok) {
          for (const a of applied.slice().reverse()) {
            await incrementStockForLine(db, null, a.product_id, a.variant_id, a.quantity);
          }
          return {
            ok: false,
            error: "insufficient_stock",
            message: "Stock changed while placing order. Please review your cart.",
          };
        }
        applied.push({
          product_id: it.product_id,
          variant_id: it.variant_id,
          quantity: it.quantity,
        });
      }
      await db.collection("orders").insertOne(orderDoc);
    } catch (e) {
      for (const a of applied.slice().reverse()) {
        await incrementStockForLine(db, null, a.product_id, a.variant_id, a.quantity);
      }
      throw e;
    }

    await db.collection("cart_items").deleteMany({ user_id: uid });

    return {
      ok: true,
      order_number: orderNumber,
      order: {
        id: orderId,
        order_number: orderNumber,
        total_amount: orderDoc.total_amount,
        discount_amount: orderDoc.discount_amount,
        coupon_code: orderDoc.coupon_code,
        order_status: "Pending",
        payment_status: "Pending",
      },
    };
  }

  async listForUser(userId, { page = 1, perPage = 10 } = {}) {
    const uid = Number(userId);
    const p = Math.max(1, Number(page) || 1);
    const pp = Math.min(50, Math.max(1, Number(perPage) || 10));
    const col = getDb().collection("orders");
    const filter = { user_id: uid };
    const [total, rows] = await Promise.all([
      col.countDocuments(filter),
      col.find(filter).sort({ created_at: -1 }).skip((p - 1) * pp).limit(pp).toArray(),
    ]);
    const orders = rows.map((o) => ({
      id: o.id,
      order_number: o.order_number,
      subtotal: o.subtotal,
      shipping_charge: o.shipping_charge,
      total_amount: o.total_amount,
      order_status: o.order_status,
      payment_status: o.payment_status,
      item_count: (o.items || []).length,
      created_at: o.created_at,
    }));
    return {
      orders,
      total,
      per_page: pp,
      current_page: p,
      total_pages: Math.max(1, Math.ceil(total / pp)),
    };
  }

  async findForUserByOrderNumber(userId, orderNumber) {
    const uid = Number(userId);
    const o = await getDb().collection("orders").findOne({
      order_number: String(orderNumber),
      user_id: uid,
    });
    return serializeOrderDetail(o);
  }

  async cancelOrderForUser(userId, orderId) {
    const uid = Number(userId);
    const id = Number(orderId);
    if (!Number.isFinite(uid) || !Number.isFinite(id) || id <= 0) return { ok: false, error: "invalid_id" };
    const col = getDb().collection("orders");
    const o = await col.findOne({ id, user_id: uid });
    if (!o) return { ok: false, error: "not_found" };
    const st = String(o.order_status ?? "").trim().toLowerCase();
    if (!["pending", "confirmed"].includes(st)) return { ok: false, error: "not_cancellable" };
    const now = new Date();
    await col.updateOne({ id }, { $set: { order_status: "Cancelled", updated_at: now } });
    const next = await col.findOne({ id });
    return { ok: true, order: serializeOrderDetail(next) };
  }

  async listForAdmin({ page = 1, perPage = 20, orderStatus, paymentStatus, q, dateFrom, dateTo } = {}) {
    const p = Math.max(1, Number(page) || 1);
    const pp = Math.min(100, Math.max(1, Number(perPage) || 20));
    const col = getDb().collection("orders");
    const filter = adminOrderListFilter({ orderStatus, paymentStatus, q, dateFrom, dateTo });
    const [total, rows] = await Promise.all([
      col.countDocuments(filter),
      col.find(filter).sort({ created_at: -1 }).skip((p - 1) * pp).limit(pp).toArray(),
    ]);
    const userIds = [...new Set(rows.map((r) => r.user_id).filter((id) => id != null))];
    const productIds = rows.flatMap((r) => (Array.isArray(r?.items) ? r.items.map((it) => Number(it?.product_id)) : []));
    const db = getDb();
    const [users, maps] = await Promise.all([
      userIds.length > 0
        ? db
            .collection("users")
            .find({ id: { $in: userIds.map(Number) } })
            .project({ id: 1, name: 1, email: 1 })
            .toArray()
        : [],
      buildProductAndShopMaps(db, productIds),
    ]);
    const umap = new Map(users.map((u) => [u.id, u]));
    const orders = rows.map((o) => {
      const u = umap.get(Number(o.user_id));
      const enrichedItems = enrichOrderItemsWithShop(o.items || [], maps.pmap, maps.smap);
      const fulfillment_shops = fulfillmentShopsFromItems(enrichedItems);
      return {
        id: o.id,
        order_number: o.order_number,
        user_id: o.user_id,
        user_name: u?.name ?? null,
        user_email: u?.email ?? null,
        shipping_name: o.shipping_name,
        total_amount: o.total_amount,
        order_status: o.order_status,
        payment_status: o.payment_status,
        item_count: (o.items || []).length,
        fulfillment_shops,
        fulfillment_shop_label: fulfillmentShopLabel(fulfillment_shops),
        created_at: o.created_at,
      };
    });
    return {
      orders,
      total,
      per_page: pp,
      current_page: p,
      total_pages: Math.max(1, Math.ceil(total / pp)),
    };
  }

  async findByIdForAdmin(orderId) {
    const id = Number(orderId);
    if (Number.isNaN(id)) return null;
    const db = getDb();
    const o = await db.collection("orders").findOne({ id });
    if (!o) return null;
    const base = serializeOrderDetail(o);
    const [u, maps] = await Promise.all([
      db.collection("users").findOne({ id: Number(o.user_id) }, { projection: { id: 1, name: 1, email: 1 } }),
      buildProductAndShopMaps(
        db,
        Array.isArray(o?.items) ? o.items.map((it) => Number(it?.product_id)) : []
      ),
    ]);
    const items = enrichOrderItemsWithShop(base.items || [], maps.pmap, maps.smap);
    const fulfillment_shops = fulfillmentShopsFromItems(items);
    return {
      ...base,
      items,
      fulfillment_shops,
      fulfillment_shop_label: fulfillmentShopLabel(fulfillment_shops),
      user: u ? { id: u.id, name: u.name, email: u.email } : null,
    };
  }

  async updateOrderAdmin(orderId, patch) {
    const id = Number(orderId);
    if (Number.isNaN(id)) return { ok: false, error: "invalid_id" };
    const col = getDb().collection("orders");
    const existing = await col.findOne({ id });
    if (!existing) return { ok: false, error: "not_found" };
    const $set = { updated_at: new Date() };
    if (patch.order_status !== undefined) {
      const s = String(patch.order_status).trim().slice(0, 64);
      if (s) $set.order_status = s;
    }
    if (patch.payment_status !== undefined) {
      const s = String(patch.payment_status).trim().slice(0, 64);
      if (s) $set.payment_status = s;
    }
    if (Object.keys($set).length === 1) {
      return { ok: false, error: "no_changes" };
    }
    await col.updateOne({ id }, { $set });
    return { ok: true, order: await this.findByIdForAdmin(id) };
  }
}
