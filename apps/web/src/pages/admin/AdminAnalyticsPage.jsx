import { useEffect, useState } from "react";
import { apiJson } from "../../api/client.js";

function fmtMoney(n) {
  const x = Number(n) || 0;
  return `₹${x.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    apiJson("/api/admin/analytics")
      .then(setData)
      .catch((e) => setErr(e.body?.required_permission ? "Missing finance permission." : e.message));
  }, []);

  if (err) return <p className="text-red-600">{err}</p>;
  if (!data) return <p className="text-gray-600">Loading analytics…</p>;

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-black">Analytics</h1>
        <p className="text-gray-600 text-sm mt-1">{data.timezone_note}</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-500 font-bold">Today revenue</p>
          <p className="text-2xl font-black mt-1">{fmtMoney(data.today_revenue)}</p>
          <p className="text-xs text-gray-500 mt-1">Growth vs yesterday {data.revenue_growth}%</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-500 font-bold">Today orders</p>
          <p className="text-2xl font-black mt-1">{data.today_orders}</p>
          <p className="text-xs text-gray-500 mt-1">Yesterday {data.yesterday_orders}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-500 font-bold">Peak hour (UTC)</p>
          <p className="text-2xl font-black mt-1">{data.peak_hour?.hour ?? "—"}</p>
          <p className="text-xs text-gray-500 mt-1">{data.peak_hour?.orders ?? 0} bills</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-500 font-bold">Avg ticket today</p>
          <p className="text-2xl font-black mt-1">{fmtMoney(data.avg_transaction?.avg_order_value)}</p>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-bold mb-2">POS revenue trend (7 days)</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-2">Date</th>
                <th className="p-2">Orders</th>
                <th className="p-2">Revenue</th>
                <th className="p-2">GST</th>
              </tr>
            </thead>
            <tbody>
              {(data.revenue_trend ?? []).map((row) => (
                <tr key={row.date} className="border-t border-gray-100">
                  <td className="p-2">{row.date}</td>
                  <td className="p-2">{row.orders}</td>
                  <td className="p-2">{fmtMoney(row.revenue)}</td>
                  <td className="p-2">{fmtMoney(row.gst)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-bold mb-2">Payment mix (today)</h2>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="p-2">Method</th>
                  <th className="p-2">Count</th>
                  <th className="p-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {(data.payment_methods ?? []).map((row) => (
                  <tr key={row._id} className="border-t border-gray-100">
                    <td className="p-2">{row._id}</td>
                    <td className="p-2">{row.count}</td>
                    <td className="p-2">{fmtMoney(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h2 className="text-lg font-bold mb-2">Top products (7 days)</h2>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="p-2">Product</th>
                  <th className="p-2">Qty</th>
                  <th className="p-2">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {(data.top_products ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="p-2">{row.name}</td>
                    <td className="p-2">{row.total_sold}</td>
                    <td className="p-2">{fmtMoney(row.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-2">Store performance (today)</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-2">Store</th>
                <th className="p-2">Orders</th>
                <th className="p-2">Revenue</th>
                <th className="p-2">Avg</th>
              </tr>
            </thead>
            <tbody>
              {(data.store_performance ?? []).map((row, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="p-2">
                    {row.store_name} ({row.store_code})
                  </td>
                  <td className="p-2">{row.orders}</td>
                  <td className="p-2">{fmtMoney(row.revenue)}</td>
                  <td className="p-2">{fmtMoney(row.avg_order)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-2">Low stock (global aggregate)</h2>
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-amber-100/80 text-left">
              <tr>
                <th className="p-2">Product</th>
                <th className="p-2">Stock</th>
              </tr>
            </thead>
            <tbody>
              {(data.low_stock ?? []).map((row) => (
                <tr key={row.id} className="border-t border-amber-100">
                  <td className="p-2">{row.name}</td>
                  <td className="p-2">{row.stock_quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
