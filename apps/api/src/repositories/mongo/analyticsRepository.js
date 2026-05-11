import { getDb } from "../../db/mongo.js";

function utcYmd(d) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
}

function utcDaysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return utcYmd(d);
}

/** Admin analytics — Mongo aggregations. */
export class MongoAnalyticsRepository {
  async getDashboard() {
    const db = getDb();
    const today = utcYmd(new Date());
    const dayStart = new Date(`${today}T00:00:00.000Z`);
    const dayEnd = new Date(`${today}T23:59:59.999Z`);
    const since7 = new Date();
    since7.setUTCDate(since7.getUTCDate() - 7);
    since7.setUTCHours(0, 0, 0, 0);

    const posMatch7 = { created_at: { $gte: since7 } };
    const posMatchToday = { created_at: { $gte: dayStart, $lte: dayEnd } };

    const revenueTrend = await db
      .collection("pos_orders")
      .aggregate([
        { $match: posMatch7 },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at", timezone: "UTC" } },
            orders: { $sum: 1 },
            revenue: { $sum: { $toDouble: { $ifNull: ["$grand_total", 0] } } },
            gst: { $sum: { $toDouble: { $ifNull: ["$gst_total", 0] } } },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            date: "$_id",
            day_name: "—",
            orders: 1,
            revenue: 1,
            gst: 1,
            _id: 0,
          },
        },
      ])
      .toArray();

    const paymentMethods = await db
      .collection("pos_orders")
      .aggregate([
        { $match: posMatchToday },
        {
          $project: {
            cash: { $toDouble: { $ifNull: ["$cash_amount", 0] } },
            card: { $toDouble: { $ifNull: ["$card_amount", 0] } },
            upi: { $toDouble: { $ifNull: ["$upi_amount", 0] } },
            grand_total: { $toDouble: { $ifNull: ["$grand_total", 0] } },
          },
        },
        {
          $project: {
            method: {
              $cond: [
                { $and: [{ $gt: ["$cash", 0] }, { $eq: ["$card", 0] }, { $eq: ["$upi", 0] }] },
                "Cash",
                {
                  $cond: [
                    { $and: [{ $gt: ["$card", 0] }, { $eq: ["$cash", 0] }, { $eq: ["$upi", 0] }] },
                    "Card",
                    {
                      $cond: [
                        { $and: [{ $gt: ["$upi", 0] }, { $eq: ["$cash", 0] }, { $eq: ["$card", 0] }] },
                        "UPI",
                        "Mixed",
                      ],
                    },
                  ],
                },
              ],
            },
            grand_total: 1,
          },
        },
        { $group: { _id: "$method", count: { $sum: 1 }, total: { $sum: "$grand_total" } } },
        { $sort: { total: -1 } },
      ])
      .toArray();

    const topProducts = await db
      .collection("pos_order_items")
      .aggregate([
        {
          $lookup: {
            from: "pos_orders",
            localField: "pos_order_id",
            foreignField: "id",
            as: "po",
          },
        },
        { $unwind: "$po" },
        { $match: { "po.created_at": { $gte: since7 } } },
        {
          $group: {
            _id: "$product_id",
            name: { $first: "$product_name" },
            total_sold: { $sum: { $toInt: { $ifNull: ["$quantity", 0] } } },
            revenue: { $sum: { $toDouble: { $ifNull: ["$line_total", 0] } } },
          },
        },
        { $sort: { total_sold: -1 } },
        { $limit: 10 },
      ])
      .toArray();

    const storePerformance = await db
      .collection("pos_orders")
      .aggregate([
        { $match: posMatchToday },
        {
          $lookup: {
            from: "stores",
            localField: "store_id",
            foreignField: "id",
            as: "st",
          },
        },
        { $unwind: { path: "$st", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: "$store_id",
            store_name: { $first: { $ifNull: ["$st.name", "Unknown"] } },
            store_code: { $first: { $ifNull: ["$st.code", ""] } },
            orders: { $sum: 1 },
            revenue: { $sum: { $toDouble: { $ifNull: ["$grand_total", 0] } } },
          },
        },
        {
          $project: {
            store_name: 1,
            store_code: 1,
            orders: 1,
            revenue: 1,
            avg_order: { $cond: [{ $gt: ["$orders", 0] }, { $divide: ["$revenue", "$orders"] }, 0] },
            _id: 0,
          },
        },
        { $sort: { revenue: -1 } },
      ])
      .toArray();

    const hourlySales = await db
      .collection("pos_orders")
      .aggregate([
        { $match: posMatchToday },
        {
          $group: {
            _id: { $hour: { date: "$created_at", timezone: "UTC" } },
            orders: { $sum: 1 },
            revenue: { $sum: { $toDouble: { $ifNull: ["$grand_total", 0] } } },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { hour: "$_id", orders: 1, revenue: 1, _id: 0 } },
      ])
      .toArray();

    let returnsData = [];
    let returnMethods = [];
    try {
      returnsData = await db
        .collection("returns")
        .aggregate([
          { $match: { created_at: { $gte: since7 } } },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at", timezone: "UTC" } },
              total_returns: { $sum: 1 },
              items_returned: { $sum: { $toInt: { $ifNull: ["$quantity", 0] } } },
              refund_total: { $sum: { $toDouble: { $ifNull: ["$refund_amount", 0] } } },
            },
          },
          { $sort: { _id: 1 } },
          { $project: { date: "$_id", total_returns: 1, items_returned: 1, refund_total: 1, _id: 0 } },
        ])
        .toArray();

      returnMethods = await db
        .collection("returns")
        .aggregate([
          { $match: { created_at: { $gte: dayStart, $lte: dayEnd } } },
          {
            $group: {
              _id: "$refund_method",
              count: { $sum: 1 },
              total: { $sum: { $toDouble: { $ifNull: ["$refund_amount", 0] } } },
            },
          },
        ])
        .toArray();
    } catch {
      /* no returns collection */
    }

    const avgAgg = await db
      .collection("pos_orders")
      .aggregate([
        { $match: posMatchToday },
        {
          $group: {
            _id: null,
            avg_order_value: { $avg: { $toDouble: { $ifNull: ["$grand_total", 0] } } },
            max_order_value: { $max: { $toDouble: { $ifNull: ["$grand_total", 0] } } },
            min_order_value: { $min: { $toDouble: { $ifNull: ["$grand_total", 0] } } },
            total_orders: { $sum: 1 },
          },
        },
      ])
      .toArray();
    const avgTransaction = avgAgg[0] ?? {
      avg_order_value: 0,
      max_order_value: 0,
      min_order_value: 0,
      total_orders: 0,
    };

    const lowStockRows = await db
      .collection("products")
      .find({
        is_active: { $in: [1, true] },
        no_store_stock: { $nin: [1, true] },
        stock_quantity: { $lt: 10 },
      })
      .sort({ stock_quantity: 1 })
      .limit(10)
      .project({ id: 1, name: 1, stock_quantity: 1 })
      .toArray();
    const low_stock = lowStockRows.map((p) => ({
      name: p.name,
      id: p.id,
      stock_quantity: p.stock_quantity,
      store_name: "Central / aggregate",
    }));

    const yday = utcDaysAgo(1);
    const yStart = new Date(`${yday}T00:00:00.000Z`);
    const yEnd = new Date(`${yday}T23:59:59.999Z`);

    const [yRev, tRev, yOrd, tOrd, peak] = await Promise.all([
      db
        .collection("pos_orders")
        .aggregate([
          { $match: { created_at: { $gte: yStart, $lte: yEnd } } },
          { $group: { _id: null, t: { $sum: { $toDouble: { $ifNull: ["$grand_total", 0] } } } } },
        ])
        .toArray(),
      db
        .collection("pos_orders")
        .aggregate([
          { $match: posMatchToday },
          { $group: { _id: null, t: { $sum: { $toDouble: { $ifNull: ["$grand_total", 0] } } } } },
        ])
        .toArray(),
      db.collection("pos_orders").countDocuments({ created_at: { $gte: yStart, $lte: yEnd } }),
      db.collection("pos_orders").countDocuments(posMatchToday),
      db
        .collection("pos_orders")
        .aggregate([
          { $match: posMatchToday },
          { $group: { _id: { $hour: { date: "$created_at", timezone: "UTC" } }, orders: { $sum: 1 } } },
          { $sort: { orders: -1 } },
          { $limit: 1 },
          { $project: { hour: "$_id", orders: 1, _id: 0 } },
        ])
        .toArray(),
    ]);

    const yesterdayRevenue = Number(yRev[0]?.t) || 0;
    const todayRevenue = Number(tRev[0]?.t) || 0;
    const revenueGrowth = yesterdayRevenue > 0 ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100 : 0;
    const ordersGrowth = yOrd > 0 ? ((tOrd - yOrd) / yOrd) * 100 : 0;

    const top_products = topProducts.map((r) => ({
      name: r.name || `Product ${r._id}`,
      id: r._id,
      price: null,
      total_sold: r.total_sold,
      revenue: r.revenue,
    }));

    return {
      revenue_trend: revenueTrend,
      payment_methods: paymentMethods,
      top_products,
      store_performance: storePerformance,
      hourly_sales: hourlySales,
      returns_data: returnsData,
      return_methods: returnMethods,
      avg_transaction: avgTransaction,
      low_stock,
      revenue_growth: Math.round(revenueGrowth * 10) / 10,
      orders_growth: Math.round(ordersGrowth * 10) / 10,
      yesterday_revenue: yesterdayRevenue,
      today_revenue: todayRevenue,
      today_orders: tOrd,
      yesterday_orders: yOrd,
      peak_hour: peak[0] ?? { hour: 0, orders: 0 },
      generated_at: new Date().toISOString(),
      timezone_note: "Aggregations use UTC calendar dates; local-midnight semantics may differ by timezone.",
    };
  }
}
