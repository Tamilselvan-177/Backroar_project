import { getDb } from "../../db/mongo.js";
import { nextSeq } from "./counter.js";

const DEFAULT_CATEGORIES = [
  ["Food & Beverages", "Tea, coffee, juice, snacks, etc."],
  ["Office Supplies", "Stationery, printer ink, etc."],
  ["Utilities", "Electricity, water, internet bills"],
  ["Rent", "Shop rent, office rent"],
  ["Salaries", "Employee salaries and wages"],
  ["Transportation", "Fuel, travel expenses"],
  ["Maintenance", "Repairs, cleaning, etc."],
  ["Marketing", "Advertising, promotions"],
  ["Miscellaneous", "Other expenses"],
];

function ymd(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
}

function utcDayBounds(dateStr) {
  const s = String(dateStr ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)),
    end: new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999)),
    key: s,
  };
}

export class MongoIncomeExpenseRepository {
  async ensureCategories() {
    const db = getDb();
    const col = db.collection("expense_categories");
    const n = await col.countDocuments({});
    if (n > 0) return;
    for (const [name, description] of DEFAULT_CATEGORIES) {
      const id = await nextSeq("expense_categories");
      await col.insertOne({
        id,
        name,
        description,
        is_active: 1,
        created_at: new Date(),
      });
    }
  }

  async listCategories() {
    await this.ensureCategories();
    return getDb()
      .collection("expense_categories")
      .find({ is_active: { $in: [1, true] } })
      .sort({ name: 1 })
      .toArray();
  }

  async addExpense(row) {
    await this.ensureCategories();
    const id = await nextSeq("expenses");
    const now = new Date();
    const expense_date = String(row.expense_date ?? ymd()).slice(0, 10);
    await getDb().collection("expenses").insertOne({
      id,
      store_id: Math.floor(Number(row.store_id) || 0) || null,
      category_id: Math.floor(Number(row.category_id) || 0) || null,
      description: String(row.description ?? "").trim().slice(0, 255),
      amount: Math.max(0, Number(row.amount) || 0),
      expense_date,
      expense_time: String(row.expense_time ?? "").slice(0, 12) || null,
      notes: row.notes != null ? String(row.notes).slice(0, 2000) : null,
      reference_number: row.reference_number != null ? String(row.reference_number).slice(0, 100) : null,
      recorded_by: row.recorded_by != null ? Number(row.recorded_by) : null,
      created_at: now,
      updated_at: now,
    });
    return { ok: true, id };
  }

  async dailyExpenseTotal(storeId, dateStr) {
    const b = utcDayBounds(dateStr);
    if (!b) return 0;
    const q = { expense_date: b.key };
    if (Number(storeId) > 0) q.store_id = Number(storeId);
    const agg = await getDb()
      .collection("expenses")
      .aggregate([{ $match: q }, { $group: { _id: null, t: { $sum: { $toDouble: { $ifNull: ["$amount", 0] } } } } }])
      .toArray();
    return Number(agg[0]?.t) || 0;
  }

  async dailyIncomeTotal(storeId, dateStr) {
    const b = utcDayBounds(dateStr);
    if (!b) return 0;
    const q = { income_date: b.key };
    if (Number(storeId) > 0) q.store_id = Number(storeId);
    const agg = await getDb()
      .collection("incomes")
      .aggregate([{ $match: q }, { $group: { _id: null, t: { $sum: { $toDouble: { $ifNull: ["$amount", 0] } } } } }])
      .toArray();
    return Number(agg[0]?.t) || 0;
  }

  async incomeTotalRange(storeId, dateFrom, dateTo) {
    const q = {
      income_date: { $gte: String(dateFrom).slice(0, 10), $lte: String(dateTo).slice(0, 10) },
    };
    if (Number(storeId) > 0) q.store_id = Number(storeId);
    const agg = await getDb()
      .collection("incomes")
      .aggregate([{ $match: q }, { $group: { _id: null, t: { $sum: { $toDouble: { $ifNull: ["$amount", 0] } } } } }])
      .toArray();
    return Number(agg[0]?.t) || 0;
  }

  async expenseTotalRange(storeId, dateFrom, dateTo) {
    const q = {
      expense_date: { $gte: String(dateFrom).slice(0, 10), $lte: String(dateTo).slice(0, 10) },
    };
    if (Number(storeId) > 0) q.store_id = Number(storeId);
    const agg = await getDb()
      .collection("expenses")
      .aggregate([{ $match: q }, { $group: { _id: null, t: { $sum: { $toDouble: { $ifNull: ["$amount", 0] } } } } }])
      .toArray();
    return Number(agg[0]?.t) || 0;
  }

  async listRecentExpenses(storeId, dateStr, limit = 10) {
    const b = utcDayBounds(dateStr);
    if (!b) return [];
    const q = { expense_date: b.key };
    if (Number(storeId) > 0) q.store_id = Number(storeId);
    const rows = await getDb()
      .collection("expenses")
      .find(q)
      .sort({ created_at: -1 })
      .limit(limit)
      .toArray();
    const catIds = [...new Set(rows.map((r) => r.category_id).filter(Boolean))];
    const cats = catIds.length ? await getDb().collection("expense_categories").find({ id: { $in: catIds } }).toArray() : [];
    const cmap = new Map(cats.map((c) => [c.id, c.name]));
    return rows.map((r) => ({ ...r, category_name: cmap.get(r.category_id) ?? "" }));
  }

  async listRecentIncome(storeId, dateStr, limit = 10) {
    const b = utcDayBounds(dateStr);
    if (!b) return [];
    const q = { income_date: b.key };
    if (Number(storeId) > 0) q.store_id = Number(storeId);
    return getDb().collection("incomes").find(q).sort({ created_at: -1 }).limit(limit).toArray();
  }

  async listExpensesPage({ storeId = 0, categoryId = 0, dateFrom, dateTo, page = 1, perPage = 50 } = {}) {
    const q = {};
    if (Number(storeId) > 0) q.store_id = Number(storeId);
    if (Number(categoryId) > 0) q.category_id = Number(categoryId);
    const df = dateFrom ? String(dateFrom).slice(0, 10) : "";
    const dt = dateTo ? String(dateTo).slice(0, 10) : "";
    if (df || dt) {
      q.expense_date = {};
      if (df) q.expense_date.$gte = df;
      if (dt) q.expense_date.$lte = dt;
    }
    const lim = Math.min(100, Math.max(1, Math.floor(Number(perPage) || 50)));
    const pg = Math.max(1, Math.floor(Number(page) || 1));
    const col = getDb().collection("expenses");
    const [total, rows] = await Promise.all([
      col.countDocuments(q),
      col.find(q).sort({ expense_date: -1, created_at: -1 }).skip((pg - 1) * lim).limit(lim).toArray(),
    ]);
    const catIds = [...new Set(rows.map((r) => r.category_id).filter(Boolean))];
    const cats = catIds.length ? await getDb().collection("expense_categories").find({ id: { $in: catIds } }).toArray() : [];
    const cmap = new Map(cats.map((c) => [c.id, c.name]));
    const sid = [...new Set(rows.map((r) => r.store_id).filter(Boolean))];
    const stores = sid.length ? await getDb().collection("stores").find({ id: { $in: sid } }).toArray() : [];
    const smap = new Map(stores.map((s) => [s.id, s.name]));
    return {
      expenses: rows.map((r) => ({
        ...r,
        category_name: cmap.get(r.category_id) ?? "",
        store_name: smap.get(r.store_id) ?? "",
      })),
      total,
      page: pg,
      per_page: lim,
      total_pages: Math.max(1, Math.ceil(total / lim)),
    };
  }

  async listIncomePage({ storeId = 0, sourceType = "", dateFrom, dateTo, page = 1, perPage = 50 } = {}) {
    const q = {};
    if (Number(storeId) > 0) q.store_id = Number(storeId);
    if (String(sourceType).trim()) q.source_type = String(sourceType).trim();
    const df = dateFrom ? String(dateFrom).slice(0, 10) : "";
    const dt = dateTo ? String(dateTo).slice(0, 10) : "";
    if (df || dt) {
      q.income_date = {};
      if (df) q.income_date.$gte = df;
      if (dt) q.income_date.$lte = dt;
    }
    const lim = Math.min(100, Math.max(1, Math.floor(Number(perPage) || 50)));
    const pg = Math.max(1, Math.floor(Number(page) || 1));
    const col = getDb().collection("incomes");
    const [total, rows] = await Promise.all([
      col.countDocuments(q),
      col.find(q).sort({ income_date: -1, created_at: -1 }).skip((pg - 1) * lim).limit(lim).toArray(),
    ]);
    const sid = [...new Set(rows.map((r) => r.store_id).filter((x) => x != null))];
    const stores = sid.length ? await getDb().collection("stores").find({ id: { $in: sid } }).toArray() : [];
    const smap = new Map(stores.map((s) => [s.id, s.name]));
    return {
      income: rows.map((r) => ({ ...r, store_name: smap.get(r.store_id) ?? "" })),
      total,
      page: pg,
      per_page: lim,
      total_pages: Math.max(1, Math.ceil(total / lim)),
    };
  }

  async incomeBySource(storeId, dateFrom, dateTo) {
    const match = {
      income_date: { $gte: String(dateFrom).slice(0, 10), $lte: String(dateTo).slice(0, 10) },
    };
    if (Number(storeId) > 0) match.store_id = Number(storeId);
    return getDb()
      .collection("incomes")
      .aggregate([
        { $match: match },
        { $group: { _id: "$source_type", total: { $sum: { $toDouble: { $ifNull: ["$amount", 0] } } }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ])
      .toArray();
  }

  async expensesByCategory(storeId, dateFrom, dateTo) {
    const match = {
      expense_date: { $gte: String(dateFrom).slice(0, 10), $lte: String(dateTo).slice(0, 10) },
    };
    if (Number(storeId) > 0) match.store_id = Number(storeId);
    const agg = await getDb()
      .collection("expenses")
      .aggregate([
        { $match: match },
        { $group: { _id: "$category_id", total: { $sum: { $toDouble: { $ifNull: ["$amount", 0] } } }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ])
      .toArray();
    const catIds = agg.map((a) => a._id).filter(Boolean);
    const cats = catIds.length ? await getDb().collection("expense_categories").find({ id: { $in: catIds } }).toArray() : [];
    const cmap = new Map(cats.map((c) => [c.id, c.name]));
    return agg.map((a) => ({
      category_id: a._id,
      category_name: cmap.get(a._id) ?? "Uncategorized",
      total: a.total,
      count: a.count,
    }));
  }

  /** Record return as negative income ledger line. */
  async recordReturnRefund({ returnId, storeId, amount, refundMethod, reference, userId }) {
    const id = await nextSeq("incomes");
    const now = new Date();
    const key = ymd(now);
    await getDb().collection("incomes").insertOne({
      id,
      store_id: Number(storeId) || null,
      source_type: "Return_Refund",
      source_id: Number(returnId),
      amount: -Math.abs(Number(amount) || 0),
      income_date: key,
      income_time: `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}:${String(now.getUTCSeconds()).padStart(2, "0")}`,
      description: "Product Return/Refund",
      payment_method: String(refundMethod ?? "cash").slice(0, 50),
      reference_number: String(reference ?? "").slice(0, 100),
      recorded_by: userId != null ? Number(userId) : null,
      created_at: now,
      updated_at: now,
    });
  }
}
