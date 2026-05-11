import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiJson } from "../../../api/client.js";

function buildQuery(sp) {
  const p = new URLSearchParams();
  const sid = sp.get("store_id");
  const vid = sp.get("variant_id");
  const pid = sp.get("product_id");
  const reason = sp.get("reason");
  const page = sp.get("page");
  if (sid && sid !== "0") p.set("store_id", sid);
  if (vid && vid !== "0") p.set("variant_id", vid);
  if (pid && pid !== "0") p.set("product_id", pid);
  if (reason) p.set("reason", reason);
  if (page && page !== "1") p.set("page", page);
  return p.toString() ? `?${p.toString()}` : "";
}

export default function StockManagementHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    apiJson(`/api/admin/stock-management/history${buildQuery(searchParams)}`)
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [searchParams]);

  useEffect(() => {
    load();
  }, [load]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "0" || value === "") {
      if (key === "page") next.delete("page");
      else next.delete(key);
    } else next.set(key, String(value));
    if (key !== "page") next.delete("page");
    setSearchParams(next, { replace: true });
  };

  if (err) return <p className="text-red-600">{err}</p>;
  if (loading && !data) return <p className="text-gray-600">Loading…</p>;

  const movements = data?.movements ?? [];
  const stores = data?.stores ?? [];
  const pg = data?.pagination ?? {};

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap justify-between gap-3">
        <h1 className="text-2xl font-black text-gray-900">Stock history</h1>
        <Link to="/admin/stock-management" className="text-blue-600 font-semibold text-sm hover:underline">
          ← Inventory
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <label className="text-sm font-semibold text-gray-700 flex flex-col gap-1">
          Store
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 font-normal"
            value={searchParams.get("store_id") || ""}
            onChange={(e) => setParam("store_id", e.target.value)}
          >
            <option value="">All</option>
            {stores.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-gray-700 flex flex-col gap-1">
          Reason
          <input
            className="border border-gray-300 rounded-lg px-3 py-2 font-normal"
            placeholder="Exact code e.g. ADJUST"
            defaultValue={searchParams.get("reason") || ""}
            onBlur={(e) => setParam("reason", e.target.value.trim())}
          />
        </label>
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-xl text-sm">
        <table className="min-w-full">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="px-2 py-2">When</th>
              <th className="px-2 py-2">Store</th>
              <th className="px-2 py-2">Product</th>
              <th className="px-2 py-2">Variant</th>
              <th className="px-2 py-2">Dir</th>
              <th className="px-2 py-2 text-right">Qty</th>
              <th className="px-2 py-2">Reason</th>
              <th className="px-2 py-2 text-right">Prev→New</th>
              <th className="px-2 py-2">User</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {movements.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-gray-500">
                  No movements yet.
                </td>
              </tr>
            ) : (
              movements.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-2 py-2 whitespace-nowrap text-gray-600">
                    {m.created_at ? new Date(m.created_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-2 py-2">{m.store_name}</td>
                  <td className="px-2 py-2 max-w-[10rem] truncate">{m.product_name}</td>
                  <td className="px-2 py-2 max-w-[8rem] truncate">{m.variant_name || "—"}</td>
                  <td className="px-2 py-2">{m.direction}</td>
                  <td className="px-2 py-2 text-right">{m.quantity}</td>
                  <td className="px-2 py-2">{m.reason}</td>
                  <td className="px-2 py-2 text-right text-xs">
                    {m.previous_stock}→{m.new_stock}
                  </td>
                  <td className="px-2 py-2 text-xs">{m.user_name || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pg.total_pages > 1 ? (
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-600">
            Page {pg.current_page} of {pg.total_pages} ({pg.total} rows)
          </span>
          <div className="flex gap-2">
            {pg.current_page > 1 ? (
              <button
                type="button"
                className="px-3 py-1 rounded border border-gray-300"
                onClick={() => setParam("page", String(pg.current_page - 1))}
              >
                Previous
              </button>
            ) : null}
            {pg.current_page < pg.total_pages ? (
              <button
                type="button"
                className="px-3 py-1 rounded border border-gray-300"
                onClick={() => setParam("page", String(pg.current_page + 1))}
              >
                Next
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
