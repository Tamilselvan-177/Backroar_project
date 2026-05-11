import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiJson } from "../../../api/client.js";
import { productImageUrl } from "../../../lib/images.js";

function buildInventoryQuery(sp) {
  const p = new URLSearchParams();
  const sid = sp.get("store_id");
  const cid = sp.get("category_id");
  const q = sp.get("search");
  const low = sp.get("low_stock");
  const page = sp.get("page");
  if (sid && sid !== "0") p.set("store_id", sid);
  if (cid && cid !== "0") p.set("category_id", cid);
  if (q) p.set("search", q);
  if (low === "1") p.set("low_stock", "1");
  if (page && page !== "1") p.set("page", page);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export default function StockManagementListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    const qs = buildInventoryQuery(searchParams);
    apiJson(`/api/admin/stock-management/inventory${qs}`)
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
    } else {
      next.set(key, String(value));
    }
    if (key !== "page") next.delete("page");
    setSearchParams(next, { replace: true });
  };

  if (err) return <p className="text-red-600">{err}</p>;
  if (loading && !data) return <p className="text-gray-600">Loading…</p>;

  const products = data?.products ?? [];
  const stores = data?.stores ?? [];
  const categories = data?.categories ?? [];
  const lowCount = data?.low_stock_count ?? 0;
  const pg = data?.pagination ?? {};

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-2xl font-black text-gray-900">Stock management</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/admin/stock-management/low-stock"
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
          >
            Low stock
            {Number(searchParams.get("store_id") || 0) > 0 && lowCount > 0 ? ` (${lowCount})` : ""}
          </Link>
          <Link
            to="/admin/stock-management/history"
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800"
          >
            History
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <label className="text-sm font-semibold text-gray-700 flex flex-col gap-1">
          Store
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 font-normal"
            value={searchParams.get("store_id") || ""}
            onChange={(e) => setParam("store_id", e.target.value)}
          >
            <option value="">All stores</option>
            {stores.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-gray-700 flex flex-col gap-1">
          Category
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 font-normal"
            value={searchParams.get("category_id") || ""}
            onChange={(e) => setParam("category_id", e.target.value)}
          >
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-gray-700 flex flex-col gap-1 md:col-span-2">
          Search
          <div className="flex gap-2">
            <input
              type="search"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 font-normal"
              placeholder="Name or SKU"
              defaultValue={searchParams.get("search") || ""}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setParam("search", e.currentTarget.value.trim());
                }
              }}
            />
            <button
              type="button"
              className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold"
              onClick={(e) => {
                const input = e.currentTarget.previousElementSibling;
                if (input && "value" in input) setParam("search", String(input.value).trim());
              }}
            >
              Go
            </button>
          </div>
        </label>
        <label className="md:col-span-4 flex items-center gap-2 text-sm font-semibold text-gray-800 cursor-pointer">
          <input
            type="checkbox"
            checked={searchParams.get("low_stock") === "1"}
            onChange={(e) => setParam("low_stock", e.target.checked ? "1" : "")}
          />
          Low stock only (total ≤ 5 at selected store / all stores)
        </label>
      </div>

      {loading ? <p className="text-gray-500 text-sm">Refreshing…</p> : null}

      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2 text-right">Variants</th>
              <th className="px-3 py-2 text-right">Total stock</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {products.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                  No matching products.
                </td>
              </tr>
            ) : (
              products.map((p) => {
                const img = productImageUrl(p.image_path);
                const sid = searchParams.get("store_id") || "0";
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {img ? <img src={img} alt="" className="h-10 w-10 object-contain rounded" /> : <span className="w-10" />}
                        <div>
                          <div className="font-semibold text-gray-900">{p.name}</div>
                          <div className="text-xs text-gray-500">{p.sku || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{p.category_name || "—"}</td>
                    <td className="px-3 py-2 text-right">{p.variant_count}</td>
                    <td className="px-3 py-2 text-right font-semibold">{p.total_stock}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        to={`/admin/stock-management/product/${p.id}?store_id=${encodeURIComponent(sid)}`}
                        className="text-blue-600 font-semibold hover:underline"
                      >
                        Detail
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pg.product_match_total > pg.per_page ? (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            Page {pg.page} — showing {products.length} of catalog slice (filters apply to product list pages).
          </span>
          <div className="flex gap-2">
            {pg.page > 1 ? (
              <button
                type="button"
                className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50"
                onClick={() => setParam("page", String(pg.page - 1))}
              >
                Previous
              </button>
            ) : null}
            {products.length >= (pg.per_page || 40) ? (
              <button
                type="button"
                className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50"
                onClick={() => setParam("page", String((pg.page || 1) + 1))}
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
