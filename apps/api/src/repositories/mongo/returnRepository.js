import { getDb } from "../../db/mongo.js";
import { nextSeq } from "./counter.js";
import { pickImagePath } from "./productRepository.js";

/**
 * Admin returns: POS or web order bill search,
 * stock restock via stockManagement.adjustWithLog, negative income row.
 */
export class MongoReturnRepository {
  constructor({ stockManagement, incomeExpense }) {
    this.sm = stockManagement;
    this.income = incomeExpense;
  }

  async _sumReturnedPosItem(posOrderItemId) {
    const db = getDb();
    const agg = await db
      .collection("returns")
      .aggregate([
        { $match: { pos_order_item_id: Number(posOrderItemId) } },
        { $group: { _id: null, qty: { $sum: { $toInt: { $ifNull: ["$quantity", 0] } } } } },
      ])
      .toArray();
    return Math.max(0, Math.floor(Number(agg[0]?.qty) || 0));
  }

  async _sumReturnedWebLine(orderId, lineIndex) {
    const db = getDb();
    const agg = await db
      .collection("returns")
      .aggregate([
        {
          $match: {
            order_id: Number(orderId),
            order_line_index: Number(lineIndex),
          },
        },
        { $group: { _id: null, qty: { $sum: { $toInt: { $ifNull: ["$quantity", 0] } } } } },
      ])
      .toArray();
    return Math.max(0, Math.floor(Number(agg[0]?.qty) || 0));
  }

  async searchBill(billNumber) {
    const bill = String(billNumber ?? "").trim();
    if (!bill) return { success: false, message: "Bill number required" };
    const db = getDb();

    const posOrder = await db.collection("pos_orders").findOne({ order_number: bill });
    if (posOrder) {
      const itemsRaw = await db
        .collection("pos_order_items")
        .find({ pos_order_id: posOrder.id })
        .sort({ id: 1 })
        .toArray();
      const pids = [...new Set(itemsRaw.map((i) => Number(i.product_id)).filter(Boolean))];
      const products = pids.length ? await db.collection("products").find({ id: { $in: pids } }).toArray() : [];
      const pmap = new Map(products.map((p) => [p.id, p]));
      const items = [];
      for (const it of itemsRaw) {
        const p = pmap.get(Number(it.product_id));
        const returned_qty = await this._sumReturnedPosItem(it.id);
        const qty = Math.max(0, Math.floor(Number(it.quantity) || 0));
        items.push({
          ...it,
          product_name: it.product_name ?? p?.name ?? "",
          sku: p?.sku ?? "",
          image_path: p ? pickImagePath(p) : null,
          returned_qty,
          remaining_qty: Math.max(0, qty - returned_qty),
        });
      }
      return { success: true, type: "pos", order: posOrder, items };
    }

    const webOrder = await db.collection("orders").findOne({ order_number: bill });
    if (webOrder) {
      const lines = Array.isArray(webOrder.items) ? webOrder.items : [];
      const pids = [...new Set(lines.map((i) => Number(i.product_id)).filter(Boolean))];
      const products = pids.length ? await db.collection("products").find({ id: { $in: pids } }).toArray() : [];
      const pmap = new Map(products.map((p) => [p.id, p]));
      const items = [];
      for (let idx = 0; idx < lines.length; idx++) {
        const it = lines[idx];
        const p = pmap.get(Number(it.product_id));
        const returned_qty = await this._sumReturnedWebLine(webOrder.id, idx);
        const qty = Math.max(0, Math.floor(Number(it.quantity) || 0));
        items.push({
          id: idx,
          order_line_index: idx,
          order_id: webOrder.id,
          product_id: Number(it.product_id),
          variant_id: it.variant_id != null ? Number(it.variant_id) : null,
          product_name: it.product_name ?? p?.name ?? "",
          sku: p?.sku ?? "",
          quantity: qty,
          subtotal: Number(it.subtotal) || 0,
          line_total: Number(it.subtotal) || 0,
          gst_amount: 0,
          image_path: p ? pickImagePath(p) : null,
          returned_qty,
          remaining_qty: Math.max(0, qty - returned_qty),
        });
      }
      return { success: true, type: "web", order: webOrder, items };
    }

    return { success: false, message: "Bill not found" };
  }

  /**
   * @param {object} data — pos_order_id + pos_order_item_id XOR order_id + order_line_index
   */
  async createReturn(data, { userId }) {
    let storeId = Math.floor(Number(data.store_id) || 0);
    const productId = Math.floor(Number(data.product_id) || 0);
    const quantity = Math.floor(Number(data.quantity) || 0);
    const refundMethod = String(data.refund_method ?? "").trim();
    let refundAmount = Number(data.refund_amount) || 0;
    let gstAdjustment = Number(data.gst_adjustment);
    if (!Number.isFinite(gstAdjustment) || gstAdjustment < 0) gstAdjustment = 0;
    const reason = String(data.reason ?? "").trim().slice(0, 500);

    if (productId <= 0 || quantity < 1 || !refundMethod) {
      return { ok: false, error: "validation_failed" };
    }

    const posOrderId = data.pos_order_id != null ? Math.floor(Number(data.pos_order_id)) : 0;
    const posOrderItemId = data.pos_order_item_id != null ? Math.floor(Number(data.pos_order_item_id)) : 0;
    const orderId = data.order_id != null ? Math.floor(Number(data.order_id)) : 0;
    const orderLineIndex =
      data.order_line_index != null && data.order_line_index !== ""
        ? Math.floor(Number(data.order_line_index))
        : -1;

    if (posOrderItemId <= 0 && (storeId <= 0 || orderId <= 0 || orderLineIndex < 0)) {
      return { ok: false, error: "validation_failed" };
    }

    const db = getDb();
    let variantId = null;

    let effectiveStoreId = storeId;

    if (posOrderItemId > 0) {
      const item = await db.collection("pos_order_items").findOne({ id: posOrderItemId });
      if (!item || Number(item.pos_order_id) !== posOrderId) {
        return { ok: false, error: "invalid_pos_item" };
      }
      if (effectiveStoreId <= 0 && posOrderId > 0) {
        const po = await db.collection("pos_orders").findOne({ id: posOrderId });
        effectiveStoreId = Math.floor(Number(po?.store_id) || 0);
      }
      if (effectiveStoreId <= 0) return { ok: false, error: "store_required" };
      variantId = item.variant_id != null ? Number(item.variant_id) : null;
      const soldQty = Math.max(0, Math.floor(Number(item.quantity) || 0));
      const returnedQty = await this._sumReturnedPosItem(posOrderItemId);
      const remaining = soldQty - returnedQty;
      if (remaining <= 0) return { ok: false, error: "already_fully_returned" };
      if (quantity > remaining) return { ok: false, error: "exceeds_remaining" };
      if (refundAmount <= 0) {
        const perUnit = (Number(item.line_total) || 0) / Math.max(1, soldQty);
        refundAmount = Math.round(perUnit * quantity * 100) / 100;
      }
      if (gstAdjustment === 0) {
        const perGst = (Number(item.gst_amount) || 0) / Math.max(1, soldQty);
        gstAdjustment = Math.round(perGst * quantity * 100) / 100;
      }
    } else if (orderId > 0 && orderLineIndex >= 0) {
      const order = await db.collection("orders").findOne({ id: orderId });
      if (!order) return { ok: false, error: "order_not_found" };
      const lines = Array.isArray(order.items) ? order.items : [];
      const oi = lines[orderLineIndex];
      if (!oi) return { ok: false, error: "invalid_order_line" };
      variantId = oi.variant_id != null ? Number(oi.variant_id) : null;
      const soldQty = Math.max(0, Math.floor(Number(oi.quantity) || 0));
      const returnedQty = await this._sumReturnedWebLine(orderId, orderLineIndex);
      const remaining = soldQty - returnedQty;
      if (remaining <= 0) return { ok: false, error: "already_fully_returned" };
      if (quantity > remaining) return { ok: false, error: "exceeds_remaining" };
      if (refundAmount <= 0) {
        const perUnit = (Number(oi.subtotal) || 0) / Math.max(1, soldQty);
        refundAmount = Math.round(perUnit * quantity * 100) / 100;
      }
    } else {
      return { ok: false, error: "missing_line_ref" };
    }

    const p = await db.collection("products").findOne({ id: productId });
    if (!p) return { ok: false, error: "product_not_found" };
    const noStore = Number(p.no_store_stock) === 1;

    const retId = await nextSeq("returns");
    const now = new Date();
    const doc = {
      id: retId,
      pos_order_id: posOrderItemId > 0 ? posOrderId : null,
      pos_order_item_id: posOrderItemId > 0 ? posOrderItemId : null,
      order_id: posOrderItemId > 0 ? null : orderId,
      order_line_index: posOrderItemId > 0 ? null : orderLineIndex,
      store_id: effectiveStoreId,
      product_id: productId,
      variant_id: variantId && variantId > 0 ? variantId : null,
      quantity,
      refund_method: refundMethod,
      refund_amount: refundAmount,
      gst_adjustment: gstAdjustment,
      reason,
      created_by: userId != null ? Number(userId) : null,
      created_at: now,
    };
    await db.collection("returns").insertOne(doc);

    if (!noStore) {
      if (variantId && variantId > 0) {
        const r = await this.sm.adjustWithLog({
          variantId,
          productId,
          storeId: effectiveStoreId,
          action: "add",
          quantity,
          reason: "RETURN",
          notes: `returns/${retId}`,
          userId,
        });
        if (!r.ok) {
          await db.collection("returns").deleteOne({ id: retId });
          return { ok: false, error: r.error || "stock_failed" };
        }
      } else {
        const r = await this.sm.adjustWithLog({
          variantId: null,
          productId,
          storeId: effectiveStoreId,
          action: "add",
          quantity,
          reason: "RETURN",
          notes: `returns/${retId}`,
          userId,
        });
        if (!r.ok) {
          await db.collection("returns").deleteOne({ id: retId });
          return { ok: false, error: r.error || "stock_failed" };
        }
      }
    }

    try {
      await this.income.recordReturnRefund({
        returnId: retId,
        storeId: effectiveStoreId,
        amount: refundAmount,
        refundMethod,
        reference: `returns/${retId}`,
        userId,
      });
    } catch {
      /* income collection optional */
    }

    return { ok: true, id: retId };
  }
}
