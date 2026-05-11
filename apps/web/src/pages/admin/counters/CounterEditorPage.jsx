import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiJson } from "../../../api/client.js";

export default function CounterEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isCreate = !id;
  const preStore = searchParams.get("store_id");

  const [stores, setStores] = useState([]);
  const [form, setForm] = useState({
    store_id: preStore && /^\d+$/.test(preStore) ? preStore : "",
    code: "",
    name: "",
    pin: "",
    pin_new: "",
    pin_confirm: "",
    is_active: true,
  });
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (isCreate) {
      apiJson("/api/admin/counters")
        .then((d) => {
          setStores(d.stores ?? []);
          if (preStore && /^\d+$/.test(preStore)) {
            setForm((f) => ({ ...f, store_id: preStore }));
          }
        })
        .catch((e) => setErr(e.message));
      return;
    }
    apiJson(`/api/admin/counters/${id}`)
      .then((d) => {
        setStores(d.stores ?? []);
        const c = d.counter;
        setForm({
          store_id: String(c.store_id ?? ""),
          code: c.code ?? "",
          name: c.name ?? "",
          pin: "",
          pin_new: "",
          pin_confirm: "",
          is_active: !!(c.is_active === 1 || c.is_active === true),
        });
      })
      .catch((e) => setErr(e.message));
  }, [id, isCreate, preStore]);

  const save = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      if (isCreate) {
        await apiJson("/api/admin/counters", {
          method: "POST",
          body: JSON.stringify({
            store_id: Number(form.store_id),
            code: form.code,
            name: form.name,
            pin: form.pin,
          }),
        });
      } else {
        await apiJson(`/api/admin/counters/${id}`, {
          method: "PATCH",
          body: JSON.stringify({
            store_id: Number(form.store_id),
            code: form.code,
            name: form.name,
            is_active: form.is_active,
            pin_new: form.pin_new,
            pin_confirm: form.pin_confirm,
          }),
        });
      }
      navigate("/admin/counters");
    } catch (e) {
      const b = e.body;
      if (b?.error === "code_taken") setErr("That counter code is already in use.");
      else if (b?.error === "pin_short") setErr("PIN must be at least 4 characters.");
      else if (b?.error === "pin_mismatch") setErr("New PIN and confirmation do not match.");
      else if (b?.error === "validation_failed" && b?.field === "store_id") setErr("Choose a valid store.");
      else setErr(e.message);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="mb-4">
        <Link to="/admin/counters" className="text-sm text-[var(--brand-accent)] underline">
          ← Counters
        </Link>
      </div>
      <h1 className="text-2xl font-black mb-4">{isCreate ? "Add counter" : "Edit counter"}</h1>
      {err ? <p className="text-red-600 mb-4">{err}</p> : null}
      <form onSubmit={save} className="space-y-4 bg-white border border-gray-200 rounded-xl p-6">
        <label className="block">
          <span className="text-sm font-semibold">Store</span>
          <select
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            value={form.store_id}
            onChange={(e) => setForm((f) => ({ ...f, store_id: e.target.value }))}
            required
          >
            <option value="" disabled>
              Select store
            </option>
            {stores.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Code</span>
          <input
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 uppercase"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            required
            maxLength={32}
            autoComplete="off"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Name</span>
          <input
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </label>
        {isCreate ? (
          <label className="block">
            <span className="text-sm font-semibold">PIN (min 4 characters)</span>
            <input
              type="password"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
              value={form.pin}
              onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
              required
              minLength={4}
              autoComplete="new-password"
            />
          </label>
        ) : (
          <>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              <span className="text-sm font-semibold">Active</span>
            </label>
            <p className="text-xs text-gray-500">Leave blank to keep the current PIN.</p>
            <label className="block">
              <span className="text-sm font-semibold">New PIN</span>
              <input
                type="password"
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                value={form.pin_new}
                onChange={(e) => setForm((f) => ({ ...f, pin_new: e.target.value }))}
                minLength={4}
                autoComplete="new-password"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Confirm new PIN</span>
              <input
                type="password"
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                value={form.pin_confirm}
                onChange={(e) => setForm((f) => ({ ...f, pin_confirm: e.target.value }))}
                minLength={4}
                autoComplete="new-password"
              />
            </label>
          </>
        )}
        <div className="flex gap-3 pt-2">
          <button type="submit" className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold">
            Save
          </button>
          <Link to="/admin/counters" className="px-4 py-2 rounded-lg border border-gray-300 text-sm">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
