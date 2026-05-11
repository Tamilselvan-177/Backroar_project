import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiJson } from "../../../api/client.js";

export default function IeIncomeList() {
  const [sp] = useSearchParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(() => {
    setErr(null);
    apiJson(`/api/admin/income-expense/income-list?${sp.toString()}`)
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [sp]);

  useEffect(() => {
    load();
  }, [load]);

  if (err) return <p className="text-red-600">{err}</p>;
  if (!data) return <p className="text-gray-600">Loading…</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="p-2">Date</th>
            <th className="p-2">Store</th>
            <th className="p-2">Source</th>
            <th className="p-2">Description</th>
            <th className="p-2">Amount</th>
          </tr>
        </thead>
        <tbody>
          {(data.income ?? []).map((e) => (
            <tr key={e.id} className="border-t border-gray-100">
              <td className="p-2">{e.income_date}</td>
              <td className="p-2">{e.store_name}</td>
              <td className="p-2">{e.source_type}</td>
              <td className="p-2">{e.description}</td>
              <td className="p-2">₹{Number(e.amount).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
