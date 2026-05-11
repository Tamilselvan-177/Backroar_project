import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiJson } from "../../../api/client.js";
import { P } from "../adminPermKeys.js";
import { useAdminPerm } from "../AdminPermContext.jsx";

function fmtMoney(n) {
  return `₹${Number(n || 0).toFixed(2)}`;
}

function fmtWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

export default function PosReturnsPage() {
  const { has } = useAdminPerm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [payload, setPayload] = useState(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    const sid = searchParams.get("store_id");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = searchParams.get("page");
    if (sid) p.set("store_id", sid);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (page) p.set("page", page);
    return p.toString();
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const path = queryString ? `/api/admin/pos/returns?${queryString}` : "/api/admin/pos/returns";
    apiJson(path)
      .then((data) => {
        if (!cancelled) setPayload(data);
      })
      .catch((e) => {
        if (!cancelled) setErr(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [queryString]);

  function applyFilters(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const next = new URLSearchParams();
    const store_id = String(fd.get("store_id") || "").trim();
    const from = String(fd.get("from") || "").trim();
    const to = String(fd.get("to") || "").trim();
    if (store_id) next.set("store_id", store_id);
    if (from) next.set("from", from);
    if (to) next.set("to", to);
    next.set("page", "1");
    setSearchParams(next);
  }

  function goPage(pg) {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(pg));
    setSearchParams(next);
  }

  async function downloadCsv() {
    const p = new URLSearchParams(queryString);
    p.set("export", "csv");
    const r = await fetch(`/api/admin/pos/returns?${p.toString()}`, { credentials: "include" });
    if (!r.ok) {
      setErr("CSV export failed");
      return;
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pos_returns.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const rows = payload?.returns ?? [];
  const stores = payload?.stores ?? [];
  const page = payload?.page ?? 1;
  const totalPages = payload?.total_pages ?? 1;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">POS returns</h1>
          <p className="text-sm text-gray-600">Refunds linked to POS orders.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {has(P.FINANCE_POS_ORDERS) ? (
            <Link to="/admin/pos/orders" className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50">
              POS orders
            </Link>
          ) : null}
          <button
            type="button"
            onClick={downloadCsv}
            disabled={loading || !rows.length}
            className="px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-40"
          >
            Export CSV (this page)
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{err}</div>
      )}

      {loading ? (
        <div className="p-8 text-center text-gray-500 bg-white border border-gray-200 rounded-xl">Loading…</div>
      ) : (
        <>
      <form
        key={queryString}
        onSubmit={applyFilters}
        className="bg-white border border-gray-200 rounded-xl p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end"
      >
        <label className="text-sm font-medium text-gray-700">
          Store
          <select
            name="store_id"
            defaultValue={searchParams.get("store_id") || ""}
            className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2"
          >
            <option value="">All</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">
          From
          <input
            type="date"
            name="from"
            defaultValue={searchParams.get("from") || ""}
            className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2"
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          To
          <input
            type="date"
            name="to"
            defaultValue={searchParams.get("to") || ""}
            className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2"
          />
        </label>
        <button type="submit" className="py-2 rounded-lg bg-gray-900 text-white font-medium">
          Apply
        </button>
      </form>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left p-3">ID</th>
                <th className="text-left p-3">POS order</th>
                <th className="text-left p-3">Customer</th>
                <th className="text-left p-3">Product</th>
                <th className="text-right p-3">Qty</th>
                <th className="text-left p-3">Method</th>
                <th className="text-right p-3">Refund</th>
                <th className="text-right p-3">GST adj.</th>
                <th className="text-left p-3">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-gray-500">
                    No POS returns for these filters.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-3">{r.id}</td>
                    <td className="p-3">
                      {r.pos_order_id ? (
                        has(P.FINANCE_POS_ORDERS) ? (
                          <Link className="text-[var(--brand-accent)] underline" to={`/admin/pos/orders/${r.pos_order_id}`}>
                            {r.order_number || `#${r.pos_order_id}`}
                          </Link>
                        ) : (
                          <span className="text-gray-800">{r.order_number || `#${r.pos_order_id}`}</span>
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3 text-gray-800">{r.customer_name || "—"}</td>
                    <td className="p-3 text-gray-700">{r.product_name || "—"}</td>
                    <td className="p-3 text-right">{r.quantity}</td>
                    <td className="p-3">{r.refund_method || "—"}</td>
                    <td className="p-3 text-right">{fmtMoney(r.refund_amount)}</td>
                    <td className="p-3 text-right">{fmtMoney(r.gst_adjustment)}</td>
                    <td className="p-3 whitespace-nowrap text-gray-600">{fmtWhen(r.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => goPage(page - 1)}
            className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="px-2 py-1 text-gray-600">
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => goPage(page + 1)}
            className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
        </>
      )}
    </div>
  );
}
