import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiJson } from "../../../api/client.js";
import { inputCls, labelCls, sectionCard } from "./ui.js";

export default function IeExpenseEntry() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [stores, setStores] = useState([]);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    store_id: "",
    category_id: "",
    description: "",
    amount: "",
    expense_date: new Date().toISOString().slice(0, 10),
    expense_time: "",
    reference_number: "",
    notes: "",
  });

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([apiJson("/api/admin/income-expense/categories"), apiJson(`/api/admin/income-expense/overview?date=${today}`)])
      .then(([c, o]) => {
        const categoryList = c.categories ?? [];
        const storeList = o.stores ?? [];
        setCategories(categoryList);
        setStores(storeList);
        setForm((f) => ({
          ...f,
          store_id: f.store_id || (storeList[0] ? String(storeList[0].id) : ""),
          category_id: f.category_id || (categoryList[0] ? String(categoryList[0].id) : ""),
        }));
      })
      .catch((e) => setErr(e.message));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      await apiJson("/api/admin/income-expense/expenses", {
        method: "POST",
        body: JSON.stringify({
          store_id: Number(form.store_id),
          category_id: Number(form.category_id),
          description: form.description,
          amount: Number(form.amount),
          expense_date: form.expense_date,
          expense_time: form.expense_time || null,
          reference_number: form.reference_number || null,
          notes: form.notes,
        }),
      });
      navigate("/admin/income-expense/expenses");
    } catch (e2) {
      setErr(e2.body?.field ? `Please check: ${e2.body.field}` : e2.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <form onSubmit={submit} className={`${sectionCard} p-5 md:p-6`}>
        <div className="mb-5">
          <p className={labelCls}>Expense Entry</p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">Record a real operating expense</h2>
          <p className="mt-1 text-sm text-slate-600">
            Capture store, category, time, reference number, and notes so finance entries stay useful during audits.
          </p>
        </div>
        {err ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p> : null}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className={labelCls}>Store</span>
            <select className={inputCls} value={form.store_id} onChange={(e) => setForm({ ...form, store_id: e.target.value })}>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className={labelCls}>Category</span>
            <select className={inputCls} value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm md:col-span-2">
            <span className={labelCls}>Description</span>
            <input
              required
              className={inputCls}
              placeholder="Ex: Diesel for delivery van, printer toner, pantry supplies"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className={labelCls}>Amount</span>
            <input
              required
              type="number"
              step="0.01"
              min="0.01"
              className={inputCls}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className={labelCls}>Reference Number</span>
            <input
              className={inputCls}
              placeholder="Bill no / UPI ref / invoice no"
              value={form.reference_number}
              onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className={labelCls}>Expense Date</span>
            <input type="date" className={inputCls} value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className={labelCls}>Expense Time</span>
            <input type="time" className={inputCls} value={form.expense_time} onChange={(e) => setForm({ ...form, expense_time: e.target.value })} />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className={labelCls}>Notes</span>
            <textarea
              className={`${inputCls} min-h-[120px]`}
              placeholder="Optional context for the accountant or store manager"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="submit" disabled={saving} className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save expense"}
          </button>
          <button
            type="button"
            className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700"
            onClick={() =>
              setForm((f) => ({
                ...f,
                description: "",
                amount: "",
                expense_time: "",
                reference_number: "",
                notes: "",
              }))
            }
          >
            Clear fields
          </button>
        </div>
      </form>

      <aside className={`${sectionCard} p-5`}>
        <p className={labelCls}>Best Practice</p>
        <h3 className="mt-1 text-lg font-bold text-slate-950">Make each entry audit-ready</h3>
        <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
          <li>Use a clear description so someone else can understand the purchase later.</li>
          <li>Add a bill or UPI reference whenever you have one.</li>
          <li>Use the actual store where the expense happened, not just the logged-in user’s default store.</li>
          <li>Capture time for same-day cash spending when you have multiple similar entries.</li>
        </ul>
      </aside>
    </div>
  );
}
