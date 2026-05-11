import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiJson } from "../../../api/client.js";

function buildQuery(sp) {
  const p = new URLSearchParams();
  const sid = sp.get("store_id");
  const th = sp.get("threshold");
  if (sid && sid !== "0") p.set("store_id", sid);
  if (th && th !== "5") p.set("threshold", th);
  return p.toString() ? `?${p.toString()}` : "";
}

export default function StockManagementLowStockPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    apiJson(`/api/admin/stock-management/low-stock${buildQuery(searchParams)}`)
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [searchParams]);

  useEffect(() => {
    load();
  }, [load]);

  const setStore = (v) => {
    const next = new URLSearchParams(searchParams);
    if (!v || v === "0") next.delete("store_id");
    else next.set("store_id", v);
    setSearchParams(next, { replace: true });
  };

  const setThreshold = (v) => {
    const next = new URLSearchParams(searchParams);
    if (!v || v === "5") next.delete("threshold");
    else next.set("threshold", v);
    setSearchParams(next, { replace: true });
  };

  if (err) return <p className="text-red-600">{err}</p>;
  if (loading && !data) return <p className="text-gray-600">Loading…</p>;

  const items = data?.items ?? [];
  const stores = data?.stores ?? [];
  const threshold = data?.threshold ?? 5;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap justify-between gap-3">
        <h1 className="text-2xl font-black text-gray-900">Low stock</h1>
        <Link to="/admin/stock-management" className="text-blue-600 font-semibold text-sm hover:underline">
          ← Inventory
        </Link>
      </div>

      <div className="flex flex-wrap gap-4 items-end p-4 bg-gray-50 rounded-xl border border-gray-200">
        <label className="text-sm font-semibold text-gray-700 flex flex-col gap-1">
          Store
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 font-normal min-w-[12rem]"
            value={searchParams.get("store_id") || ""}
            onChange={(e) => setStore(e.target.value)}
          >
            <option value="">All stores (capped list)</option>
            {stores.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-gray-700 flex flex-col gap-1">
          Max quantity (≤)
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 font-normal"
            value={String(threshold)}
            onChange={(e) => setThreshold(e.target.value)}
          >
            {[3, 5, 10, 20].map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-xl text-sm">
        <table className="min-w-full">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Variant</th>
              <th className="px-3 py-2">Store</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                  No rows at or below this threshold.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={`${row.variant_id}-${row.store_id}`} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{row.product_name}</td>
                  <td className="px-3 py-2">{row.variant_name}</td>
                  <td className="px-3 py-2">{row.store_name}</td>
                  <td className="px-3 py-2 text-right font-semibold text-red-700">{row.quantity}</td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      to={`/admin/stock-management/adjust?variant_id=${row.variant_id}&store_id=${row.store_id}`}
                      className="text-blue-600 font-semibold hover:underline"
                    >
                      Adjust
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
