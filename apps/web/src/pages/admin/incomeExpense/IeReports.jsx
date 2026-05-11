import { useCallback, useEffect, useState } from "react";
import { apiJson } from "../../../api/client.js";
import { fmtMoney, inputCls, labelCls, sectionCard, statTone } from "./ui.js";

export default function IeReports() {
  const defaultFrom = () => `${new Date().toISOString().slice(0, 7)}-01`;
  const defaultTo = () => new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [storeId, setStoreId] = useState(0);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(() => {
    setErr(null);
    const qs = new URLSearchParams({
      date_from: from,
      date_to: to,
    });
    if (storeId > 0) qs.set("store_id", String(storeId));
    apiJson(`/api/admin/income-expense/reports?${qs}`)
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [storeId, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!data) return <p className="text-sm text-slate-600">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className={`${sectionCard} p-4 md:p-5`}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_180px_180px_auto] xl:items-end">
          <div>
            <p className={labelCls}>Finance Report</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">Where profit is coming from and where it is leaking</h2>
            <p className="mt-1 text-sm text-slate-600">Use grouped totals to spot high-spend categories and compare stores over any reporting range.</p>
          </div>
          <label className="block text-sm">
            <span className={labelCls}>Store</span>
            <select className={inputCls} value={storeId} onChange={(e) => setStoreId(Number(e.target.value))}>
              <option value={0}>All stores</option>
              {(data.stores ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className={labelCls}>From</span>
            <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className={labelCls}>To</span>
            <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button type="button" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className={`${sectionCard} p-5`}>
          <p className={labelCls}>Income</p>
          <p className="mt-2 text-2xl font-black text-emerald-700">{fmtMoney(data.total_income)}</p>
        </div>
        <div className={`${sectionCard} p-5`}>
          <p className={labelCls}>Expense</p>
          <p className="mt-2 text-2xl font-black text-rose-700">{fmtMoney(data.total_expense)}</p>
        </div>
        <div className={`${sectionCard} p-5`}>
          <p className={labelCls}>Net Result</p>
          <p className={`mt-2 text-2xl font-black ${statTone(data.net_profit)}`}>{fmtMoney(data.net_profit)}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className={`${sectionCard} p-5`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={labelCls}>Income by Source</p>
              <h3 className="mt-1 text-base font-bold text-slate-950">Revenue channels</h3>
            </div>
            <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              {data.income_by_source?.length ?? 0} sources
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {(data.income_by_source ?? []).map((r) => (
              <div key={String(r._id)} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{r._id || "Unknown source"}</p>
                    <p className="mt-1 text-xs text-slate-500">{r.count} entries</p>
                  </div>
                  <p className="font-bold text-emerald-700">{fmtMoney(r.total)}</p>
                </div>
              </div>
            ))}
            {!data.income_by_source?.length ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No income found for the selected range.
              </div>
            ) : null}
          </div>
        </div>

        <div className={`${sectionCard} p-5`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={labelCls}>Expense by Category</p>
              <h3 className="mt-1 text-base font-bold text-slate-950">Major cost buckets</h3>
            </div>
            <div className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
              {data.expense_by_category?.length ?? 0} categories
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {(data.expense_by_category ?? []).map((r) => (
              <div key={String(r.category_id)} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{r.category_name}</p>
                    <p className="mt-1 text-xs text-slate-500">{r.count} entries</p>
                  </div>
                  <p className="font-bold text-rose-700">{fmtMoney(r.total)}</p>
                </div>
              </div>
            ))}
            {!data.expense_by_category?.length ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No expenses found for the selected range.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
