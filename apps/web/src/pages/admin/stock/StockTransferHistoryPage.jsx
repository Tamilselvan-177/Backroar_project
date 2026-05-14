import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiJson } from "../../../api/client.js";

function fmtDateTime(v) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

function setParam(sp, setSp, key, value) {
  const next = new URLSearchParams(sp);
  if (value == null || value === "") next.delete(key);
  else next.set(key, String(value));
  next.delete("page");
  setSp(next, { replace: true });
}

export default function StockTransferHistoryPage() {
  const [sp, setSp] = useSearchParams();
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);
  const [stores, setStores] = useState([]);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const selectedId = Number(sp.get("transfer_id") || 0);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const list = await apiJson(`/api/admin/stock-transfer/history?${sp.toString()}`);
      setData(list);
      if (selectedId > 0) {
        const d = await apiJson(`/api/admin/stock-transfer/history/${selectedId}`);
        setDetail(d);
      } else {
        setDetail(null);
      }
      if (!stores.length) {
        const state = await apiJson("/api/admin/stock-transfer/state");
        setStores(state.stores ?? []);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [sp, selectedId, stores.length]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-6xl space-y-5">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Stock transfer history</h1>
        <p className="mt-2 text-sm text-gray-600">Track completed movements between stores with full item-level details.</p>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm">
            Source store
            <select className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" value={sp.get("source_store_id") ?? ""} onChange={(e) => setParam(sp, setSp, "source_store_id", e.target.value)}>
              <option value="">All</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Destination store
            <select className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" value={sp.get("dest_store_id") ?? ""} onChange={(e) => setParam(sp, setSp, "dest_store_id", e.target.value)}>
              <option value="">All</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Date from
            <input type="date" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" value={sp.get("date_from") ?? ""} onChange={(e) => setParam(sp, setSp, "date_from", e.target.value)} />
          </label>
          <label className="text-sm">
            Date to
            <input type="date" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" value={sp.get("date_to") ?? ""} onChange={(e) => setParam(sp, setSp, "date_to", e.target.value)} />
          </label>
          <div className="flex items-end">
            <button type="button" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold" onClick={() => setSp({}, { replace: true })}>
              Clear filters
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-3 py-2">Transfer #</th>
                  <th className="px-3 py-2">Route</th>
                  <th className="px-3 py-2">Items</th>
                  <th className="px-3 py-2">By</th>
                  <th className="px-3 py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-3 py-10 text-center text-gray-500" colSpan={5}>
                      Loading…
                    </td>
                  </tr>
                ) : (data?.transfers ?? []).length === 0 ? (
                  <tr>
                    <td className="px-3 py-10 text-center text-gray-500" colSpan={5}>
                      No transfer records found.
                    </td>
                  </tr>
                ) : (
                  (data?.transfers ?? []).map((r) => (
                    <tr key={r.id} className={`border-t border-gray-100 ${selectedId === r.id ? "bg-indigo-50/40" : ""}`}>
                      <td className="px-3 py-2">
                        <button type="button" className="font-semibold text-[var(--brand-accent)] underline" onClick={() => setParam(sp, setSp, "transfer_id", r.id)}>
                          {r.transfer_number}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {r.source_store_name || `#${r.source_store_id}`} → {r.dest_store_name || `#${r.dest_store_id}`}
                      </td>
                      <td className="px-3 py-2">{r.total_items}</td>
                      <td className="px-3 py-2">{r.initiated_by_name || "—"}</td>
                      <td className="px-3 py-2">{fmtDateTime(r.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 px-3 py-3 text-sm">
            <p className="text-gray-500">
              Page {data?.page ?? 1} / {data?.total_pages ?? 1}
            </p>
            <div className="space-x-2">
              <button
                type="button"
                className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40"
                disabled={(data?.page ?? 1) <= 1}
                onClick={() => setParam(sp, setSp, "page", (data?.page ?? 1) - 1)}
              >
                Prev
              </button>
              <button
                type="button"
                className="rounded-lg bg-gray-900 px-3 py-1.5 text-white disabled:opacity-40"
                disabled={(data?.page ?? 1) >= (data?.total_pages ?? 1)}
                onClick={() => setParam(sp, setSp, "page", (data?.page ?? 1) + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <aside className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="font-bold text-gray-900">Transfer details</h2>
          {!selectedId ? <p className="mt-2 text-sm text-gray-500">Select a transfer number to view line items.</p> : null}
          {selectedId && !detail ? <p className="mt-2 text-sm text-gray-500">Loading details…</p> : null}
          {detail ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-lg bg-gray-50 p-3 text-sm">
                <p className="font-semibold">{detail.transfer_number}</p>
                <p className="text-gray-600 mt-1">
                  {detail.source_store_name || `#${detail.source_store_id}`} → {detail.dest_store_name || `#${detail.dest_store_id}`}
                </p>
                <p className="text-gray-500 mt-1">By {detail.initiated_by_name || "—"}</p>
                <p className="text-gray-500">{fmtDateTime(detail.created_at)}</p>
              </div>
              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg max-h-[420px] overflow-y-auto">
                {(detail.items ?? []).map((line) => (
                  <li key={line.id} className="p-3 text-sm">
                    <p className="font-medium text-gray-900">
                      {line.product_name}
                      {line.variant_name ? ` — ${line.variant_name}` : ""}
                    </p>
                    <p className="mt-1 text-gray-600">Qty: {line.quantity}</p>
                    {line.sku ? <p className="text-xs text-gray-500">SKU: {line.sku}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <Link to="/admin/stock-transfer" className="mt-4 inline-block text-sm text-[var(--brand-accent)] underline">
            Back to Stock transfer
          </Link>
        </aside>
      </div>
    </div>
  );
}
