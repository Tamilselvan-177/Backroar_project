import { getDb } from "../../db/mongo.js";
import { computePosCartTotals } from "../../lib/posTotals.js";
import { nextSeq } from "./counter.js";

function stripDoc(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return rest;
}

function parseDayStart(isoDate) {
  const s = String(isoDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T00:00:00.000Z`);
}

function parseDayEnd(isoDate) {
  const s = String(isoDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T23:59:59.999Z`);
}

export class MongoPosOrderRepository {
  async nextBillNumber(storeId, financialYear, storeCode) {
    const sid = Number(storeId);
    const fy = String(financialYear ?? "").trim();
    const col = getDb().collection("bill_sequences");
    const r = await col.findOneAndUpdate(
      { store_id: sid, financial_year: fy },
      { $inc: { current_seq: 1 }, $setOnInsert: { prefix: "POS", store_id: sid, financial_year: fy, created_at: new Date() } },
      { upsert: true, returnDocument: "after" }
    );
    const doc = r?.value ?? r;
    const seq = Math.max(1, Math.floor(Number(doc?.current_seq) || 1));
    const pad = String(seq).padStart(5, "0");
    const code = String(storeCode || "STORE")
      .trim()
      .toUpperCase() || "STORE";
    return `POS-${code}-${fy}-${pad}`;
  }

  async listRecentOrders(storeId, limit = 20) {
    return getDb()
      .collection("pos_orders")
      .find({ store_id: Number(storeId) }, { projection: { id: 1, order_number: 1, grand_total: 1, created_at: 1 } })
      .sort({ created_at: -1 })
      .limit(Math.min(50, Math.max(1, Number(limit) || 20)))
      .toArray();
  }

  async createHold({ storeId, counterId, staffId, customerName, customerPhone, cart }) {
    const id = await nextSeq("pos_holds");
    const now = new Date();
    await getDb().collection("pos_holds").insertOne({
      id,
      store_id: Number(storeId),
      counter_id: counterId != null ? Number(counterId) : null,
      staff_id: staffId != null ? Number(staffId) : null,
      customer_name: String(customerName ?? "").trim(),
      customer_phone: String(customerPhone ?? "").trim(),
      cart_json: JSON.stringify(cart ?? {}),
      created_at: now,
    });
    return id;
  }

  async listHolds(storeId, counterId, limit = 20) {
    const q = { store_id: Number(storeId) };
    if (counterId != null && Number(counterId) > 0) {
      q.counter_id = Number(counterId);
    }
    const rows = await getDb()
      .collection("pos_holds")
      .find(q, { projection: { id: 1, customer_name: 1, customer_phone: 1, created_at: 1, cart_json: 1 } })
      .sort({ created_at: -1 })
      .limit(Math.min(50, Math.max(1, Number(limit) || 20)))
      .toArray();
    return rows.map((row) => {
      let lines_count = 0;
      let hold_total = 0;
      try {
        const cart = JSON.parse(String(row.cart_json ?? "{}")) || {};
        if (cart && typeof cart === "object") {
          lines_count = Object.keys(cart).length;
          hold_total = computePosCartTotals(cart, 0).grand;
        }
      } catch {
        /* ignore */
      }
      return {
        id: row.id,
        customer_name: row.customer_name,
        customer_phone: row.customer_phone,
        created_at: row.created_at,
        lines_count,
        hold_total,
      };
    });
  }

  async findHold(id) {
    return getDb().collection("pos_holds").findOne({ id: Number(id) });
  }

  async deleteHold(id) {
    const hid = Number(id);
    if (!Number.isFinite(hid) || hid <= 0) return { ok: false };
    const r = await getDb().collection("pos_holds").deleteOne({ id: hid });
    return { ok: r.deletedCount > 0 };
  }

  async createOrderAndItems(orderDoc, lines, payments) {
    const db = getDb();
    const orderId = await nextSeq("pos_orders");
    const now = new Date();
    await db.collection("pos_orders").insertOne({
      ...orderDoc,
      id: orderId,
      created_at: now,
    });
    for (const line of lines) {
      const itemId = await nextSeq("pos_order_items");
      await db.collection("pos_order_items").insertOne({
        id: itemId,
        pos_order_id: orderId,
        product_id: line.product_id,
        variant_id: line.variant_id ?? null,
        product_name: line.product_name,
        price: line.price,
        quantity: line.quantity,
        discount_percent: line.discount_percent,
        gst_percent: line.gst_percent,
        gst_amount: line.gst_amount,
        subtotal: line.subtotal,
        line_total: line.line_total,
        created_at: now,
      });
    }
    for (const pay of payments) {
      if (pay.amount <= 0) continue;
      const pid = await nextSeq("pos_payments");
      await db.collection("pos_payments").insertOne({
        id: pid,
        pos_order_id: orderId,
        method: pay.method,
        amount: pay.amount,
        reference: pay.reference ?? null,
        created_at: now,
      });
    }
    return { orderId, orderNumber: orderDoc.order_number };
  }

  /**
   * POS orders list (non-returns view).
   */
  async listOrdersPage({ storeId = 0, staffId = 0, from = "", to = "", page = 1, perPage = 24 } = {}) {
    const db = getDb();
    const filter = {};
    if (Number(storeId) > 0) filter.store_id = Number(storeId);
    if (Number(staffId) > 0) filter.staff_id = Number(staffId);
    const created = {};
    const d0 = parseDayStart(from);
    const d1 = parseDayEnd(to);
    if (d0) created.$gte = d0;
    if (d1) created.$lte = d1;
    if (Object.keys(created).length) filter.created_at = created;

    const pg = Math.max(1, Math.floor(Number(page) || 1));
    const lim = Math.min(100, Math.max(1, Math.floor(Number(perPage) || 24)));
    const skip = (pg - 1) * lim;

    const [total, ordersRaw, grossAgg] = await Promise.all([
      db.collection("pos_orders").countDocuments(filter),
      db.collection("pos_orders").find(filter).sort({ created_at: -1 }).skip(skip).limit(lim).toArray(),
      db
        .collection("pos_orders")
        .aggregate([{ $match: filter }, { $group: { _id: null, gross: { $sum: "$grand_total" } } }])
        .toArray(),
    ]);

    const orders = ordersRaw.map((o) => stripDoc(o));
    const periodGross = Number(grossAgg[0]?.gross) || 0;

    const rFilter = { pos_order_id: { $exists: true, $ne: null } };
    if (Number(storeId) > 0) rFilter.store_id = Number(storeId);
    const rCreated = {};
    if (d0) rCreated.$gte = d0;
    if (d1) rCreated.$lte = d1;
    if (Object.keys(rCreated).length) rFilter.created_at = rCreated;

    let periodReturns = 0;
    let periodGstAdj = 0;
    try {
      const retAgg = await db
        .collection("returns")
        .aggregate([
          { $match: rFilter },
          {
            $group: {
              _id: null,
              refund: { $sum: { $toDouble: { $ifNull: ["$refund_amount", 0] } } },
              gst: { $sum: { $toDouble: { $ifNull: ["$gst_adjustment", 0] } } },
            },
          },
        ])
        .toArray();
      periodReturns = Number(retAgg[0]?.refund) || 0;
      periodGstAdj = Number(retAgg[0]?.gst) || 0;
    } catch {
      /* returns collection may be absent */
    }

    const ids = orders.map((o) => o.id);
    const previews = {};
    const return_counts = {};
    if (ids.length) {
      const items = await db
        .collection("pos_order_items")
        .find({ pos_order_id: { $in: ids } })
        .sort({ id: 1 })
        .toArray();
      for (const r of items) {
        const oid = r.pos_order_id;
        if (!previews[oid]) previews[oid] = [];
        if (previews[oid].length < 3) {
          previews[oid].push(`${String(r.product_name ?? "").trim()} x${Number(r.quantity) || 0}`);
        }
      }
      try {
        const retRows = await db
          .collection("returns")
          .aggregate([
            { $match: { pos_order_id: { $in: ids } } },
            { $group: { _id: "$pos_order_id", c: { $sum: 1 } } },
          ])
          .toArray();
        for (const rr of retRows) {
          if (rr._id != null) return_counts[Number(rr._id)] = Number(rr.c) || 0;
        }
      } catch {
        /* no returns */
      }
    }

    return {
      orders,
      total,
      page: pg,
      per_page: lim,
      total_pages: Math.max(1, Math.ceil(total / lim)),
      previews,
      return_counts,
      page_totals: {
        gross: periodGross,
        returns: periodReturns,
        net: Math.max(0, periodGross - (periodReturns - periodGstAdj)),
      },
    };
  }

  /**
   * Single POS bill with lines, payments, optional returns.
   */
  async getOrderDetail(orderId, storeRepo) {
    const id = Number(orderId);
    if (!Number.isFinite(id) || id <= 0) return null;
    const db = getDb();
    const orderRaw = await db.collection("pos_orders").findOne({ id });
    if (!orderRaw) return null;
    const order = stripDoc(orderRaw);
    const store = storeRepo ? await storeRepo.findById(order.store_id) : null;
    if (store) {
      order.store_name = store.name;
      order.store_address = store.address ?? "";
      order.store_city = store.city ?? "";
      order.store_state = store.state ?? "";
      order.store_pincode = store.pincode ?? "";
      order.store_gstin = store.gstin ?? "";
    }
    const items = (
      await db.collection("pos_order_items").find({ pos_order_id: id }).sort({ id: 1 }).toArray()
    ).map((x) => stripDoc(x));
    const payments = (
      await db.collection("pos_payments").find({ pos_order_id: id }).sort({ id: 1 }).toArray()
    ).map((x) => stripDoc(x));

    const returns_by_item = {};
    let refundTotal = 0;
    let gstReturn = 0;
    try {
      const retRows = await db
        .collection("returns")
        .aggregate([
          { $match: { pos_order_id: id } },
          {
            $group: {
              _id: "$pos_order_item_id",
              qty: { $sum: { $toInt: { $ifNull: ["$quantity", 0] } } },
              refund: { $sum: { $toDouble: { $ifNull: ["$refund_amount", 0] } } },
              gst: { $sum: { $toDouble: { $ifNull: ["$gst_adjustment", 0] } } },
            },
          },
        ])
        .toArray();
      for (const r of retRows) {
        const iid = Number(r._id);
        if (!Number.isFinite(iid)) continue;
        returns_by_item[iid] = {
          qty: Number(r.qty) || 0,
          refund: Number(r.refund) || 0,
          gst: Number(r.gst) || 0,
        };
        refundTotal += Number(r.refund) || 0;
        gstReturn += Number(r.gst) || 0;
      }
    } catch {
      /* no returns */
    }

    const net = {
      subtotal: Number(order.subtotal) - Math.max(0, refundTotal - gstReturn),
      gst_total: Number(order.gst_total) - gstReturn,
      grand_total: Number(order.grand_total) - refundTotal,
      refund_total: refundTotal,
      gst_return: gstReturn,
    };

    return { order, items, payments, returns_by_item, net };
  }

  /**
   * POS GST summary by day or month, net of returns in the same period.
   */
  async getGstReport({ storeId = 0, range = "daily", from = "", to = "" } = {}) {
    const db = getDb();
    const match = {};
    if (Number(storeId) > 0) match.store_id = Number(storeId);
    const d0 = parseDayStart(from);
    const d1 = parseDayEnd(to);
    if (d0 || d1) {
      match.created_at = {};
      if (d0) match.created_at.$gte = d0;
      if (d1) match.created_at.$lte = d1;
    }

    const isMonthly = String(range).toLowerCase() === "monthly";
    const dateFormat = isMonthly ? "%Y-%m" : "%Y-%m-%d";
    const limit = isMonthly ? 24 : 60;

    const orderAgg = await db
      .collection("pos_orders")
      .aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              $dateToString: { format: dateFormat, date: "$created_at", timezone: "UTC" },
            },
            subtotal: { $sum: { $toDouble: { $ifNull: ["$subtotal", 0] } } },
            discounts: { $sum: { $toDouble: { $ifNull: ["$discount_total", 0] } } },
            gst: { $sum: { $toDouble: { $ifNull: ["$gst_total", 0] } } },
            grand_total: { $sum: { $toDouble: { $ifNull: ["$grand_total", 0] } } },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: limit },
        {
          $project: {
            period: "$_id",
            subtotal: 1,
            discounts: 1,
            gst: 1,
            grand_total: 1,
            _id: 0,
          },
        },
      ])
      .toArray();

    const rMatch = {};
    if (Number(storeId) > 0) rMatch.store_id = Number(storeId);
    if (d0 || d1) {
      rMatch.created_at = {};
      if (d0) rMatch.created_at.$gte = d0;
      if (d1) rMatch.created_at.$lte = d1;
    }

    let retRows = [];
    try {
      retRows = await db
        .collection("returns")
        .aggregate([
          { $match: rMatch },
          {
            $group: {
              _id: {
                $dateToString: { format: dateFormat, date: "$created_at", timezone: "UTC" },
              },
              refund_total: { $sum: { $toDouble: { $ifNull: ["$refund_amount", 0] } } },
              gst_return: { $sum: { $toDouble: { $ifNull: ["$gst_adjustment", 0] } } },
            },
          },
        ])
        .toArray();
    } catch {
      /* returns collection missing */
    }

    const retMap = {};
    for (const r of retRows) {
      const key = String(r._id ?? "");
      if (!key) continue;
      retMap[key] = {
        refund_total: Number(r.refund_total) || 0,
        gst_return: Number(r.gst_return) || 0,
      };
    }

    const rows = orderAgg.map((row) => {
      const p = String(row.period ?? "");
      const ref = retMap[p] || { refund_total: 0, gst_return: 0 };
      const refund = ref.refund_total;
      const gstRet = ref.gst_return;
      return {
        period: p,
        subtotal: Number(row.subtotal) - Math.max(0, refund - gstRet),
        discounts: Number(row.discounts) || 0,
        gst: Number(row.gst) - gstRet,
        grand_total: Number(row.grand_total) - refund,
      };
    });

    return { rows, range: isMonthly ? "monthly" : "daily" };
  }

  /**
   * POS-linked returns list.
   */
  async listPosReturnsPage({ storeId = 0, from = "", to = "", page = 1, perPage = 24 } = {}) {
    const db = getDb();
    const match = { pos_order_id: { $exists: true, $ne: null } };
    if (Number(storeId) > 0) match.store_id = Number(storeId);
    const d0 = parseDayStart(from);
    const d1 = parseDayEnd(to);
    if (d0 || d1) {
      match.created_at = {};
      if (d0) match.created_at.$gte = d0;
      if (d1) match.created_at.$lte = d1;
    }

    const pg = Math.max(1, Math.floor(Number(page) || 1));
    const lim = Math.min(100, Math.max(1, Math.floor(Number(perPage) || 24)));
    const skip = (pg - 1) * lim;

    try {
      const col = db.collection("returns");
      const [total, rows] = await Promise.all([
        col.countDocuments(match),
        col
          .aggregate([
            { $match: match },
            { $sort: { created_at: -1 } },
            { $skip: skip },
            { $limit: lim },
            {
              $lookup: {
                from: "pos_orders",
                localField: "pos_order_id",
                foreignField: "id",
                as: "po",
              },
            },
            { $unwind: { path: "$po", preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: "products",
                localField: "product_id",
                foreignField: "id",
                as: "p",
              },
            },
            { $unwind: { path: "$p", preserveNullAndEmptyArrays: true } },
            {
              $project: {
                _id: 0,
                id: 1,
                pos_order_id: 1,
                pos_order_item_id: 1,
                store_id: 1,
                product_id: 1,
                quantity: 1,
                refund_method: 1,
                refund_amount: 1,
                gst_adjustment: 1,
                reason: 1,
                created_at: 1,
                order_number: "$po.order_number",
                customer_name: "$po.customer_name",
                product_name: "$p.name",
              },
            },
          ])
          .toArray(),
      ]);

      return {
        returns: rows,
        total,
        page: pg,
        per_page: lim,
        total_pages: Math.max(1, Math.ceil(total / lim)),
      };
    } catch {
      return { returns: [], total: 0, page: 1, per_page: lim, total_pages: 1 };
    }
  }
}
