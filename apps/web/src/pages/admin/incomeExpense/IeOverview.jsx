import { useCallback, useEffect, useState } from "react";
import { apiJson } from "../../../api/client.js";
import { fmtDateTime, fmtMoney, inputCls, labelCls, sectionCard, statTone } from "./ui.js";

export default function IeOverview() {
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState(0);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(() => {
    setErr(null);
    const qs = new URLSearchParams({ date });
    if (storeId > 0) qs.set("store_id", String(storeId));
    apiJson(`/api/admin/income-expense/overview?${qs}`)
      .then((d) => {
        setData(d);
        setStores(d.stores ?? []);
      })
      .catch((e) => setErr(e.message));
  }, [storeId, date]);

  useEffect(() => {
    load();
  }, [load]);

  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!data) return <p className="text-sm text-slate-600">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className={`${sectionCard} p-4 md:p-5`}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_220px] md:items-end">
          <div>
            <p className={labelCls}>Finance Snapshot</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">Daily and monthly business health</h2>
            <p className="mt-1 text-sm text-slate-600">
              Review cash flow for a store or all stores together, then drill into recent expenses and income activity.
            </p>
          </div>
          <label className="block text-sm">
            <span className={labelCls}>Store</span>
            <select className={inputCls} value={storeId} onChange={(e) => setStoreId(Number(e.target.value))}>
              <option value={0}>All stores</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className={labelCls}>Business Date</span>
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className={`${sectionCard} p-5`}>
          <p className={labelCls}>Daily Income</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{fmtMoney(data.daily_income)}</p>
          <p className="mt-1 text-xs text-slate-500">Sales and posted income entries for the day</p>
        </div>
        <div className={`${sectionCard} p-5`}>
          <p className={labelCls}>Daily Expense</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{fmtMoney(data.daily_expense)}</p>
          <p className="mt-1 text-xs text-slate-500">Recorded operating cost for the day</p>
        </div>
        <div className={`${sectionCard} p-5`}>
          <p className={labelCls}>Daily Profit</p>
          <p className={`mt-2 text-2xl font-black ${statTone(data.daily_profit)}`}>{fmtMoney(data.daily_profit)}</p>
          <p className="mt-1 text-xs text-slate-500">Income minus expenses</p>
        </div>
        <div className={`${sectionCard} p-5`}>
          <p className={labelCls}>Monthly Income</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{fmtMoney(data.monthly_income)}</p>
          <p className="mt-1 text-xs text-slate-500">Accumulated income this month</p>
        </div>
        <div className={`${sectionCard} p-5`}>
          <p className={labelCls}>Monthly Profit</p>
          <p className={`mt-2 text-2xl font-black ${statTone(data.monthly_profit)}`}>{fmtMoney(data.monthly_profit)}</p>
          <p className="mt-1 text-xs text-slate-500">Current net result for the month</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className={`${sectionCard} p-5`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={labelCls}>Recent Expenses</p>
              <h3 className="mt-1 text-base font-bold text-slate-950">Latest spending entries</h3>
            </div>
            <div className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
              {data.recent_expenses?.length ?? 0} entries
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {(data.recent_expenses ?? []).map((e) => (
              <div key={e.id} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{e.description}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {e.category_name || "Uncategorized"}
                      {e.store_name ? ` · ${e.store_name}` : ""}
                    </p>
                  </div>
                  <p className="font-bold text-rose-700">{fmtMoney(e.amount)}</p>
                </div>
                <p className="mt-2 text-xs text-slate-500">{fmtDateTime(e.created_at)}</p>
              </div>
            ))}
            {!data.recent_expenses?.length ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No expense entries for this date.
              </div>
            ) : null}
          </div>
        </div>

        <div className={`${sectionCard} p-5`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={labelCls}>Recent Income</p>
              <h3 className="mt-1 text-base font-bold text-slate-950">Latest credited records</h3>
            </div>
            <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              {data.recent_income?.length ?? 0} entries
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {(data.recent_income ?? []).map((e) => (
              <div key={e.id} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{e.description ?? e.source_type}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {e.source_type || "Income"}
                      {e.store_name ? ` · ${e.store_name}` : ""}
                    </p>
                  </div>
                  <p className={`font-bold ${Number(e.amount) < 0 ? "text-red-700" : "text-emerald-700"}`}>
                    {fmtMoney(e.amount)}
                  </p>
                </div>
                <p className="mt-2 text-xs text-slate-500">{fmtDateTime(e.created_at)}</p>
              </div>
            ))}
            {!data.recent_income?.length ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No income activity for this date.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className={`${sectionCard} p-5`}>
          <p className={labelCls}>Monthly Expense</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{fmtMoney(data.monthly_expense)}</p>
          <p className="mt-2 text-sm text-slate-600">Use this with reports to understand category-heavy operating cost.</p>
        </div>
        <div className={`${sectionCard} p-5`}>
          <p className={labelCls}>Operational Note</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Finance dates are stored in UTC. If you post entries late at night, keep your business date selection in mind
            while reviewing day-end numbers.
          </p>
        </div>
      </div>
    </div>
  );
}
