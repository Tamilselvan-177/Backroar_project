import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiJson } from "../../../api/client.js";

export default function IeExpenseEntry() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [stores, setStores] = useState([]);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState({
    store_id: "1",
    category_id: "",
    description: "",
    amount: "",
    expense_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      apiJson("/api/admin/income-expense/categories"),
      apiJson(`/api/admin/income-expense/overview?store_id=1&date=${today}`),
    ])
      .then(([c, o]) => {
        setCategories(c.categories ?? []);
        if (c.categories?.[0]) setForm((f) => ({ ...f, category_id: String(c.categories[0].id) }));
        setStores(o.stores ?? []);
      })
      .catch((e) => setErr(e.message));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      await apiJson("/api/admin/income-expense/expenses", {
        method: "POST",
        body: JSON.stringify({
          store_id: Number(form.store_id),
          category_id: Number(form.category_id),
          description: form.description,
          amount: Number(form.amount),
          expense_date: form.expense_date,
          notes: form.notes,
        }),
      });
      navigate("/admin/income-expense");
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-md space-y-3 border border-gray-200 rounded-xl p-4 bg-white">
      <h2 className="font-bold text-lg">Add expense</h2>
      {err ? <p className="text-red-600 text-sm">{err}</p> : null}
      <label className="block text-sm">
        Store
        <select
          className="mt-1 w-full border rounded-lg px-3 py-2"
          value={form.store_id}
          onChange={(e) => setForm({ ...form, store_id: e.target.value })}
        >
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Category
        <select
          className="mt-1 w-full border rounded-lg px-3 py-2"
          value={form.category_id}
          onChange={(e) => setForm({ ...form, category_id: e.target.value })}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Description
        <input
          required
          className="mt-1 w-full border rounded-lg px-3 py-2"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </label>
      <label className="block text-sm">
        Amount
        <input
          required
          type="number"
          step="0.01"
          min="0.01"
          className="mt-1 w-full border rounded-lg px-3 py-2"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
        />
      </label>
      <label className="block text-sm">
        Date
        <input
          type="date"
          className="mt-1 w-full border rounded-lg px-3 py-2"
          value={form.expense_date}
          onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
        />
      </label>
      <label className="block text-sm">
        Notes
        <input className="mt-1 w-full border rounded-lg px-3 py-2" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </label>
      <button type="submit" className="w-full py-2 rounded-lg bg-gray-900 text-white font-semibold">
        Save expense
      </button>
    </form>
  );
}
