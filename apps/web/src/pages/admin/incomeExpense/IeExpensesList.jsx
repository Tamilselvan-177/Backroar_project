import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiJson } from "../../../api/client.js";
import { fmtDateOnly, fmtMoney, inputCls, labelCls, sectionCard } from "./ui.js";

function updateSearchParams(current, patch) {
  const next = new URLSearchParams(current);
  Object.entries(patch).forEach(([key, value]) => {
    if (value == null || value === "" || value === "0") next.delete(key);
    else next.set(key, String(value));
  });
  if (!patch.page) next.delete("page");
  return next;
}

export default function IeExpensesList() {
  const [sp, setSp] = useSearchParams();
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [stores, setStores] = useState([]);
  const [err, setErr] = useState(null);

  const filters = useMemo(
    () => ({
      store_id: sp.get("store_id") ?? "",
      category_id: sp.get("category_id") ?? "",
      date_from: sp.get("date_from") ?? "",
      date_to: sp.get("date_to") ?? "",
    }),
    [sp]
  );

  const load = useCallback(() => {
    setErr(null);
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      apiJson(`/api/admin/income-expense/expenses?${sp.toString()}`),
      apiJson("/api/admin/income-expense/categories"),
      apiJson(`/api/admin/income-expense/overview?date=${today}`),
    ])
      .then(([expenseData, categoryData, overview]) => {
        setData(expenseData);
        setCategories(categoryData.categories ?? []);
        setStores(overview.stores ?? []);
      })
      .catch((e) => setErr(e.message));
  }, [sp]);

  useEffect(() => {
    load();
  }, [load]);

  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!data) return <p className="text-sm text-slate-600">Loading…</p>;

  return (
    <div className="space-y-5">
      <div className={`${sectionCard} p-4 md:p-5`}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="block text-sm">
            <span className={labelCls}>Store</span>
            <select
              className={inputCls}
              value={filters.store_id}
              onChange={(e) => setSp(updateSearchParams(sp, { store_id: e.target.value }))}
            >
              <option value="">All stores</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className={labelCls}>Category</span>
            <select
              className={inputCls}
              value={filters.category_id}
              onChange={(e) => setSp(updateSearchParams(sp, { category_id: e.target.value }))}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className={labelCls}>From</span>
            <input type="date" className={inputCls} value={filters.date_from} onChange={(e) => setSp(updateSearchParams(sp, { date_from: e.target.value }))} />
          </label>
          <label className="block text-sm">
            <span className={labelCls}>To</span>
            <input type="date" className={inputCls} value={filters.date_to} onChange={(e) => setSp(updateSearchParams(sp, { date_to: e.target.value }))} />
          </label>
          <div className="flex items-end gap-3">
            <button
              type="button"
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              onClick={() => setSp({})}
            >
              Clear filters
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className={`${sectionCard} p-5`}>
          <p className={labelCls}>Matching Entries</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{data.total ?? 0}</p>
        </div>
        <div className={`${sectionCard} p-5`}>
          <p className={labelCls}>Current Page</p>
          <p className="mt-2 text-2xl font-black text-slate-950">
            {data.page} / {data.total_pages}
          </p>
        </div>
        <div className={`${sectionCard} p-5`}>
          <p className={labelCls}>Page Size</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{data.per_page}</p>
        </div>
      </div>

      <div className={`${sectionCard} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Store</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Description</th>
                <th className="px-4 py-3 font-semibold">Reference</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(data.expenses ?? []).map((e) => (
                <tr key={e.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3 text-slate-700">
                    <div>{fmtDateOnly(e.expense_date)}</div>
                    <div className="text-xs text-slate-400">{e.expense_time || "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{e.store_name || "Shared / unassigned"}</td>
                  <td className="px-4 py-3 text-slate-700">{e.category_name || "Uncategorized"}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{e.description}</div>
                    {e.notes ? <div className="mt-1 text-xs text-slate-500">{e.notes}</div> : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{e.reference_number || "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold text-rose-700">{fmtMoney(e.amount)}</td>
                </tr>
              ))}
              {!data.expenses?.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                    No expenses found for the selected filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Showing page {data.page} of {data.total_pages}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={data.page <= 1}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
            onClick={() => setSp(updateSearchParams(sp, { page: data.page - 1 }))}
          >
            Previous
          </button>
          <button
            type="button"
            disabled={data.page >= data.total_pages}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            onClick={() => setSp(updateSearchParams(sp, { page: data.page + 1 }))}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
