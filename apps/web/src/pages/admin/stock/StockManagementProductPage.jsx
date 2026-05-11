import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { apiJson } from "../../../api/client.js";
import { productImageUrl } from "../../../lib/images.js";

export default function StockManagementProductPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  const storeId = searchParams.get("store_id") || "0";

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    const q = storeId && storeId !== "0" ? `?store_id=${encodeURIComponent(storeId)}` : "?store_id=0";
    apiJson(`/api/admin/stock-management/product/${encodeURIComponent(id)}${q}`)
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [id, storeId]);

  useEffect(() => {
    load();
  }, [load]);

  const setStore = (v) => {
    const next = new URLSearchParams(searchParams);
    if (!v || v === "0") next.delete("store_id");
    else next.set("store_id", v);
    setSearchParams(next, { replace: true });
  };

  if (err) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">{err}</p>
        <Link to="/admin/stock-management" className="text-blue-600 font-semibold">
          Back to inventory
        </Link>
      </div>
    );
  }
  if (loading && !data) return <p className="text-gray-600">Loading…</p>;
  if (!data?.product) return null;

  const { product, variant_stock, stores } = data;
  const img = productImageUrl(product.image_path);

  return (
    <div className="space-y-6 max-w-6xl">
      <Link to="/admin/stock-management" className="text-blue-600 font-semibold text-sm hover:underline">
        ← Back to inventory
      </Link>

      <div className="flex flex-wrap justify-between gap-4 items-start">
        <div>
          <h1 className="text-2xl font-black text-gray-900">{product.name}</h1>
          <p className="text-gray-600 mt-1">{product.category_name || "—"}</p>
        </div>
        <label className="text-sm font-semibold text-gray-700 flex flex-col gap-1">
          Store filter
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 font-normal min-w-[12rem]"
            value={storeId}
            onChange={(e) => setStore(e.target.value)}
          >
            <option value="0">
              All stores
            </option>
            {(stores || []).map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-white border border-gray-200 rounded-xl">
        <div>{img ? <img src={img} alt="" className="w-full max-h-64 object-contain rounded-lg" /> : null}</div>
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-3">Product</h2>
          <p className="text-sm text-gray-700">
            <span className="font-semibold">SKU:</span> {product.sku || "—"}
          </p>
        </div>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-bold text-gray-900">Variant stock</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="px-3 py-2">Variant</th>
                <th className="px-3 py-2">Store</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Threshold</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {variant_stock?.length ? (
                variant_stock.map((row) =>
                  row.stores?.length ? (
                    row.stores.map((st, i) => (
                      <tr key={`${row.variant_id}-${st.store_id}-${i}`} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <div className="font-medium">{row.variant_name}</div>
                          {row.attribute_name ? (
                            <div className="text-xs text-gray-500">
                              {row.attribute_name}: {row.attribute_value}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">{st.store_name}</td>
                        <td className="px-3 py-2 text-right font-semibold">{st.quantity}</td>
                        <td className="px-3 py-2 text-right">{st.low_stock_threshold}</td>
                        <td className="px-3 py-2">
                          {st.is_low_stock ? (
                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800">Low</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800">OK</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Link
                            to={`/admin/stock-management/adjust?variant_id=${row.variant_id}&store_id=${st.store_id}`}
                            className="text-blue-600 font-semibold hover:underline"
                          >
                            Adjust
                          </Link>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr key={`${row.variant_id}-empty`} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <div className="font-medium">{row.variant_name}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-400">—</td>
                      <td className="px-3 py-2 text-right text-gray-400">0</td>
                      <td className="px-3 py-2 text-right text-gray-400">—</td>
                      <td className="px-3 py-2">
                        <span className="text-xs text-gray-500">No rows</span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {Number(storeId) > 0 ? (
                          <Link
                            to={`/admin/stock-management/adjust?variant_id=${row.variant_id}&store_id=${storeId}`}
                            className="text-blue-600 font-semibold hover:underline"
                          >
                            Add stock
                          </Link>
                        ) : (
                          <span className="text-gray-400 text-xs">Pick a store</span>
                        )}
                      </td>
                    </tr>
                  ),
                )
              ) : (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                    No active variants for this product.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
