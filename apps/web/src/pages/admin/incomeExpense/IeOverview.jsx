import { useCallback, useEffect, useState } from "react";
import { apiJson } from "../../../api/client.js";

function fmt(n) {
  return `₹${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function IeOverview() {
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState(1);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(() => {
    setErr(null);
    const qs = new URLSearchParams({ store_id: String(storeId), date });
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

  if (err) return <p className="text-red-600">{err}</p>;
  if (!data) return <p className="text-gray-600">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm">
          Store
          <select
            className="ml-2 border rounded-lg px-2 py-1"
            value={storeId}
            onChange={(e) => setStoreId(Number(e.target.value))}
          >
            {(stores.length ? stores : [{ id: 1, name: "Default" }]).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Date
          <input
            type="date"
            className="ml-2 border rounded-lg px-2 py-1"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-bold text-gray-500 uppercase">Daily income</p>
          <p className="text-xl font-black mt-1">{fmt(data.daily_income)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-bold text-gray-500 uppercase">Daily expense</p>
          <p className="text-xl font-black mt-1">{fmt(data.daily_expense)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-bold text-gray-500 uppercase">Daily profit</p>
          <p className="text-xl font-black mt-1">{fmt(data.daily_profit)}</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="font-bold mb-2">Month income</p>
          <p className="text-lg">{fmt(data.monthly_income)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="font-bold mb-2">Month expense</p>
          <p className="text-lg">{fmt(data.monthly_expense)}</p>
          <p className="text-sm text-gray-600 mt-1">Net {fmt(data.monthly_profit)}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <p className="font-bold mb-2">Recent expenses</p>
          <ul className="text-sm space-y-1 border rounded-lg p-3 bg-gray-50">
            {(data.recent_expenses ?? []).map((e) => (
              <li key={e.id}>
                {e.description} — {fmt(e.amount)}
              </li>
            ))}
            {!data.recent_expenses?.length ? <li className="text-gray-500">None</li> : null}
          </ul>
        </div>
        <div>
          <p className="font-bold mb-2">Recent income</p>
          <ul className="text-sm space-y-1 border rounded-lg p-3 bg-gray-50">
            {(data.recent_income ?? []).map((e) => (
              <li key={e.id}>
                {e.description ?? e.source_type} — {fmt(e.amount)}
              </li>
            ))}
            {!data.recent_income?.length ? <li className="text-gray-500">None</li> : null}
          </ul>
        </div>
      </div>
    </div>
  );
}
