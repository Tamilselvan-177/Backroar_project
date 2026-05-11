import { useCallback, useEffect, useState } from "react";
import { apiJson } from "../../../api/client.js";

export default function IeReports() {
  const defaultFrom = () => `${new Date().toISOString().slice(0, 7)}-01`;
  const defaultTo = () => new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [storeId, setStoreId] = useState(1);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(() => {
    setErr(null);
    const qs = new URLSearchParams({
      store_id: String(storeId),
      date_from: from,
      date_to: to,
    });
    apiJson(`/api/admin/income-expense/reports?${qs}`)
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [storeId, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  if (err) return <p className="text-red-600">{err}</p>;
  if (!data) return <p className="text-gray-600">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 text-sm items-end">
        <label>
          Store
          <select
            className="ml-1 border rounded px-2 py-1"
            value={storeId}
            onChange={(e) => setStoreId(Number(e.target.value))}
          >
            {(data.stores ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input type="date" className="ml-1 border rounded px-2 py-1" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" className="ml-1 border rounded px-2 py-1" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" className="px-3 py-1 rounded-lg bg-gray-900 text-white" onClick={load}>
          Refresh
        </button>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-xl border p-4 bg-white">
          <p className="text-xs text-gray-500 font-bold uppercase">Income</p>
          <p className="text-xl font-black">₹{Number(data.total_income).toFixed(2)}</p>
        </div>
        <div className="rounded-xl border p-4 bg-white">
          <p className="text-xs text-gray-500 font-bold uppercase">Expense</p>
          <p className="text-xl font-black">₹{Number(data.total_expense).toFixed(2)}</p>
        </div>
        <div className="rounded-xl border p-4 bg-white">
          <p className="text-xs text-gray-500 font-bold uppercase">Net</p>
          <p className="text-xl font-black">₹{Number(data.net_profit).toFixed(2)}</p>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <p className="font-bold mb-2">Income by source</p>
          <ul className="text-sm space-y-1">
            {(data.income_by_source ?? []).map((r) => (
              <li key={String(r._id)}>
                {r._id}: ₹{Number(r.total).toFixed(2)} ({r.count})
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-bold mb-2">Expense by category</p>
          <ul className="text-sm space-y-1">
            {(data.expense_by_category ?? []).map((r) => (
              <li key={String(r.category_id)}>
                {r.category_name}: ₹{Number(r.total).toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
