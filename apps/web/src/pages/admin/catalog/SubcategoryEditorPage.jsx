import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson } from "../../../api/client.js";

export default function SubcategoryEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isCreate = !id;
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    category_id: "",
    name: "",
    slug: "",
    description: "",
    display_order: 0,
    is_active: true,
  });
  const [err, setErr] = useState(null);

  useEffect(() => {
    apiJson("/api/admin/categories").then((d) => setCategories(d.categories ?? []));
  }, []);

  useEffect(() => {
    if (isCreate) return;
    apiJson(`/api/admin/subcategories/${id}`)
      .then((d) => {
        const s = d.subcategory;
        setForm({
          category_id: String(s.category_id ?? ""),
          name: s.name ?? "",
          slug: s.slug ?? "",
          description: s.description ?? "",
          display_order: s.display_order ?? 0,
          is_active: !!(s.is_active === 1 || s.is_active === true),
        });
      })
      .catch((e) => setErr(e.message));
  }, [id, isCreate]);

  const save = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      const payload = {
        category_id: Number(form.category_id),
        name: form.name,
        slug: form.slug || undefined,
        description: form.description || null,
        display_order: Number(form.display_order) || 0,
        is_active: form.is_active,
      };
      if (isCreate) {
        await apiJson("/api/admin/subcategories", { method: "POST", body: JSON.stringify(payload) });
      } else {
        await apiJson(`/api/admin/subcategories/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      navigate("/admin/subcategories");
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-black mb-4">{isCreate ? "Add subcategory" : "Edit subcategory"}</h1>
      {err ? <p className="text-red-600 mb-4">{err}</p> : null}
      <form onSubmit={save} className="space-y-4 bg-white border rounded-lg p-6">
        <label className="block">
          <span className="text-sm font-semibold">Category</span>
          <select
            className="mt-1 w-full border rounded px-3 py-2"
            value={form.category_id}
            onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
            required
          >
            <option value="">Select…</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Name</span>
          <input
            className="mt-1 w-full border rounded px-3 py-2"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Slug</span>
          <input className="mt-1 w-full border rounded px-3 py-2" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Description</span>
          <textarea
            className="mt-1 w-full border rounded px-3 py-2"
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Display order</span>
          <input
            type="number"
            className="mt-1 w-full border rounded px-3 py-2"
            value={form.display_order}
            onChange={(e) => setForm((f) => ({ ...f, display_order: e.target.value }))}
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
          <Link to="/admin/subcategories" className="px-4 py-2 border rounded-lg">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
