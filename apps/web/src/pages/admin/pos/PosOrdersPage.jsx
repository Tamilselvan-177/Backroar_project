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

export default function PosOrdersPage() {
  const { has } = useAdminPerm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [payload, setPayload] = useState(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    const sid = searchParams.get("store_id");
    const uid = searchParams.get("staff_id");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = searchParams.get("page");
    if (sid) p.set("store_id", sid);
    if (uid) p.set("staff_id", uid);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (page) p.set("page", page);
    return p.toString();
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const path = queryString ? `/api/admin/pos/orders?${queryString}` : "/api/admin/pos/orders";
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
    const staff_id = String(fd.get("staff_id") || "").trim();
    const from = String(fd.get("from") || "").trim();
    const to = String(fd.get("to") || "").trim();
    if (store_id) next.set("store_id", store_id);
    if (staff_id) next.set("staff_id", staff_id);
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

  const stores = payload?.stores ?? [];
  const staff = payload?.staff ?? [];
  const orders = payload?.orders ?? [];
  const previews = payload?.previews ?? {};
  const returnCounts = payload?.return_counts ?? {};
  const totals = payload?.page_totals ?? { gross: 0, returns: 0, net: 0 };
  const page = payload?.page ?? 1;
  const totalPages = payload?.total_pages ?? 1;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">POS orders</h1>
          <p className="text-sm text-gray-600">Browse bills, filters, and open a bill for print.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link to="/admin/pos" className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50">
            POS login
          </Link>
          <Link to="/admin/pos/billing" className="px-3 py-2 rounded-lg bg-gray-900 text-white">
            Billing
          </Link>
          {has(P.FINANCE_POS_GST) ? (
            <Link to="/admin/pos/gst-report" className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50">
              GST report
            </Link>
          ) : null}
          {has(P.FINANCE_POS_RETURNS) ? (
            <Link to="/admin/pos/returns" className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50">
              POS returns
            </Link>
          ) : null}
        </div>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{err}</div>
      )}

      <form
        key={queryString}
        onSubmit={applyFilters}
        className="bg-white border border-gray-200 rounded-xl p-4 grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
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
          Staff
          <select
            name="staff_id"
            defaultValue={searchParams.get("staff_id") || ""}
            className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2"
          >
            <option value="">All</option>
            {staff.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
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

      {!loading && payload && (
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="text-gray-500">Gross (filtered period)</div>
            <div className="text-lg font-bold">{fmtMoney(totals.gross)}</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="text-gray-500">Returns</div>
            <div className="text-lg font-bold">{fmtMoney(totals.returns)}</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="text-gray-500">Net</div>
            <div className="text-lg font-bold">{fmtMoney(totals.net)}</div>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left p-3">Bill</th>
                <th className="text-left p-3">When</th>
                <th className="text-left p-3">Customer</th>
                <th className="text-right p-3">Total</th>
                <th className="text-left p-3">Preview</th>
                <th className="text-right p-3">Returns</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    No POS orders match these filters.
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-3">
                      <Link className="font-semibold text-[var(--brand-accent)] underline" to={`/admin/pos/orders/${o.id}`}>
                        {o.order_number}
                      </Link>
                    </td>
                    <td className="p-3 text-gray-700 whitespace-nowrap">{fmtWhen(o.created_at)}</td>
                    <td className="p-3 text-gray-700">
                      <div>{o.customer_name || "—"}</div>
                      <div className="text-xs text-gray-500">{o.customer_phone || ""}</div>
                    </td>
                    <td className="p-3 text-right font-medium">{fmtMoney(o.grand_total)}</td>
                    <td className="p-3 text-gray-600 text-xs max-w-[14rem]">
                      {(previews[o.id] || []).join(" · ") || "—"}
                    </td>
                    <td className="p-3 text-right text-gray-600">{returnCounts[o.id] ?? 0}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
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
    </div>
  );
}
