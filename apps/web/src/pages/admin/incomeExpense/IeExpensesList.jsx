import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiJson } from "../../../api/client.js";

export default function IeExpensesList() {
  const [sp, setSp] = useSearchParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(() => {
    setErr(null);
    apiJson(`/api/admin/income-expense/expenses?${sp.toString()}`)
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [sp]);

  useEffect(() => {
    load();
  }, [load]);

  if (err) return <p className="text-red-600">{err}</p>;
  if (!data) return <p className="text-gray-600">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm">
        <button type="button" className="underline" onClick={() => setSp({ page: String((Number(sp.get("page")) || 1) + 1) })}>
          Next page
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="p-2">Date</th>
              <th className="p-2">Store</th>
              <th className="p-2">Category</th>
              <th className="p-2">Description</th>
              <th className="p-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(data.expenses ?? []).map((e) => (
              <tr key={e.id} className="border-t border-gray-100">
                <td className="p-2">{e.expense_date}</td>
                <td className="p-2">{e.store_name}</td>
                <td className="p-2">{e.category_name}</td>
                <td className="p-2">{e.description}</td>
                <td className="p-2">₹{Number(e.amount).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
