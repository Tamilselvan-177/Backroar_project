import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiJson } from "../../../api/client.js";
import { P } from "../adminPermKeys.js";
import { useAdminPerm } from "../AdminPermContext.jsx";

function fmtMoney(n) {
  return `₹${Number(n || 0).toFixed(2)}`;
}

export default function PosGstReportPage() {
  const { has } = useAdminPerm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [payload, setPayload] = useState(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    const sid = searchParams.get("store_id");
    const range = searchParams.get("range");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (sid) p.set("store_id", sid);
    if (range) p.set("range", range);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const path = queryString ? `/api/admin/pos/gst-report?${queryString}` : "/api/admin/pos/gst-report";
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
    const range = String(fd.get("range") || "daily").trim();
    const from = String(fd.get("from") || "").trim();
    const to = String(fd.get("to") || "").trim();
    if (store_id) next.set("store_id", store_id);
    if (range) next.set("range", range);
    if (from) next.set("from", from);
    if (to) next.set("to", to);
    setSearchParams(next);
  }

  async function downloadCsv() {
    const p = new URLSearchParams(queryString);
    p.set("export", "csv");
    const r = await fetch(`/api/admin/pos/gst-report?${p.toString()}`, { credentials: "include" });
    if (!r.ok) {
      setErr("CSV export failed");
      return;
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gst_${searchParams.get("range") || payload?.filters?.range || "daily"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const rows = payload?.rows ?? [];
  const stores = payload?.stores ?? [];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">POS GST report</h1>
          <p className="text-sm text-gray-600">Daily or monthly totals from POS bills, net of returns (same period).</p>
        </div>
        <div className="flex gap-2 text-sm">
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
            Export CSV
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{err}</div>
      )}

      {loading ? (
        <div className="p-8 text-center text-gray-500 bg-white border border-gray-200 rounded-xl">Loading report…</div>
      ) : (
        <>
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
                <option value="">All stores</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-gray-700">
              Range
              <select
                name="range"
                defaultValue={searchParams.get("range") || "daily"}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2"
              >
                <option value="daily">Daily</option>
                <option value="monthly">Monthly</option>
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
              Run report
            </button>
          </form>

          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left p-3">
                    {(searchParams.get("range") || payload?.filters?.range || "daily") === "monthly" ? "Month" : "Day"}
                  </th>
                  <th className="text-right p-3">Subtotal</th>
                  <th className="text-right p-3">Discounts</th>
                  <th className="text-right p-3">GST</th>
                  <th className="text-right p-3">Grand total</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">
                      No POS data for these filters.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.period} className="border-b border-gray-100">
                      <td className="p-3 font-medium">{r.period}</td>
                      <td className="p-3 text-right">{fmtMoney(r.subtotal)}</td>
                      <td className="p-3 text-right">{fmtMoney(r.discounts)}</td>
                      <td className="p-3 text-right">{fmtMoney(r.gst)}</td>
                      <td className="p-3 text-right font-semibold">{fmtMoney(r.grand_total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
