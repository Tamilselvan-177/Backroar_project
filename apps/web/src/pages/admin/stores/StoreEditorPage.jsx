import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson } from "../../../api/client.js";

export default function StoreEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isCreate = !id;
  const [form, setForm] = useState({
    code: "",
    name: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    gstin: "",
    is_active: true,
  });
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (isCreate) return;
    apiJson(`/api/admin/stores/${id}`)
      .then((d) => {
        const s = d.store;
        setForm({
          code: s.code ?? "",
          name: s.name ?? "",
          address: s.address ?? "",
          city: s.city ?? "",
          state: s.state ?? "",
          pincode: s.pincode ?? "",
          gstin: s.gstin ?? "",
          is_active: !!(s.is_active === 1 || s.is_active === true),
        });
      })
      .catch((e) => setErr(e.message));
  }, [id, isCreate]);

  const save = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      if (isCreate) {
        await apiJson("/api/admin/stores", {
          method: "POST",
          body: JSON.stringify({
            code: form.code,
            name: form.name,
            address: form.address,
            city: form.city,
            state: form.state,
            pincode: form.pincode,
            gstin: form.gstin,
            is_active: form.is_active,
          }),
        });
      } else {
        await apiJson(`/api/admin/stores/${id}`, {
          method: "PATCH",
          body: JSON.stringify({
            code: form.code,
            name: form.name,
            address: form.address,
            city: form.city,
            state: form.state,
            pincode: form.pincode,
            gstin: form.gstin,
            is_active: form.is_active,
          }),
        });
      }
      navigate("/admin/stores");
    } catch (e) {
      if (e.body?.error === "code_taken") setErr("That store code is already in use.");
      else setErr(e.message);
    }
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-black mb-4">{isCreate ? "Add store" : "Edit store"}</h1>
      {err ? <p className="text-red-600 mb-4">{err}</p> : null}
      <form onSubmit={save} className="space-y-4 bg-white border border-gray-200 rounded-xl p-6">
        <label className="block">
          <span className="text-sm font-semibold">Code</span>
          <input
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            required
            maxLength={32}
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
        <label className="block">
          <span className="text-sm font-semibold">Address</span>
          <input
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          />
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-semibold">City</span>
            <input
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">State</span>
            <input
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
              value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
            />
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-semibold">Pincode</span>
          <input
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            value={form.pincode}
            onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))}
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">GSTIN</span>
          <input
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            value={form.gstin}
            onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value }))}
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
          />
          <span className="text-sm font-semibold">Active</span>
        </label>
        <div className="flex gap-3 pt-2">
          <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-lg font-semibold">
            Save
          </button>
          <Link to="/admin/stores" className="px-4 py-2 border border-gray-300 rounded-lg">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
