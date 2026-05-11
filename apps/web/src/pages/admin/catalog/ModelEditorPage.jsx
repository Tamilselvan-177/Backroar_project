import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson } from "../../../api/client.js";
import { formCardClass, inp, lbl, shellClass } from "./catalogAdminUi.js";

export default function ModelEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isCreate = !id;
  const [brands, setBrands] = useState([]);
  const [form, setForm] = useState({
    brand_id: "",
    name: "",
    slug: "",
    model_number: "",
    is_active: true,
  });
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (isCreate) {
      apiJson("/api/admin/brands")
        .then((d) => setBrands(d.brands ?? []))
        .catch((e) => setErr(e.body?.error || e.message));
      return;
    }
    apiJson(`/api/admin/models/${id}`)
      .then((d) => {
        setBrands(d.brands ?? []);
        const m = d.model;
        setForm({
          brand_id: String(m.brand_id ?? ""),
          name: m.name ?? "",
          slug: m.slug ?? "",
          model_number: m.model_number ?? "",
          is_active: !!(m.is_active === 1 || m.is_active === true),
        });
      })
      .catch((e) => setErr(e.body?.error || e.message));
  }, [id, isCreate]);

  const save = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      const payload = {
        brand_id: Number(form.brand_id),
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        model_number: form.model_number.trim() || null,
        is_active: form.is_active,
      };
      if (!payload.brand_id) {
        setErr("Choose a brand.");
        return;
      }
      if (isCreate) {
        await apiJson("/api/admin/models", { method: "POST", body: JSON.stringify(payload) });
      } else {
        await apiJson(`/api/admin/models/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      navigate(form.brand_id ? `/admin/models?brand_id=${encodeURIComponent(form.brand_id)}` : "/admin/models");
    } catch (e) {
      const b = e.body;
      setErr(b?.error === "slug_taken" ? "Slug already taken for this brand" : b?.error || e.message);
    }
  };

  return (
    <section className={shellClass}>
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <Link
              to="/admin"
              className="inline-flex items-center rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-600 hover:bg-white"
            >
              ← Dashboard
            </Link>
            <p className={lbl}>Admin / Models</p>
            <h1 className="text-2xl font-black uppercase tracking-wide text-slate-900 md:text-3xl">
              {isCreate ? "Add model" : "Edit model"}
            </h1>
          </div>
          <Link
            to="/admin/models"
            className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-white"
          >
            Back to list
          </Link>
        </header>

        {err ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
        ) : null}

        <form onSubmit={save} className={formCardClass}>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className={lbl}>Brand *</span>
              <select
                className={inp}
                value={form.brand_id}
                onChange={(e) => setForm((f) => ({ ...f, brand_id: e.target.value }))}
                required
              >
                <option value="">Select</option>
                {brands.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block md:col-span-2">
              <span className={lbl}>Name *</span>
              <input
                className={inp}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </label>
            <label className="block">
              <span className={lbl}>Slug</span>
              <input className={inp} value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
            </label>
            <label className="block">
              <span className={lbl}>Model number</span>
              <input
                className={inp}
                value={form.model_number}
                onChange={(e) => setForm((f) => ({ ...f, model_number: e.target.value }))}
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 md:col-span-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              <span className="text-xs font-semibold text-slate-700">Active</span>
            </label>
          </div>

          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-4">
            <Link to="/admin/models" className="rounded-full border border-slate-300 px-6 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Cancel
            </Link>
            <button type="submit" className="rounded-full bg-slate-900 px-6 py-2 text-xs font-semibold text-white hover:bg-black">
              {isCreate ? "Create" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
