import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson, apiUploadCategoryImage } from "../../../api/client.js";
import { formCardClass, inp, lbl, shellClass } from "./catalogAdminUi.js";

export default function CategoryEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isCreate = !id;
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    image_path: "",
    display_order: 0,
    is_active: true,
  });
  const [pendingFile, setPendingFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  useEffect(() => {
    if (isCreate) return;
    apiJson(`/api/admin/categories/${id}`)
      .then((d) => {
        const c = d.category;
        setForm({
          name: c.name ?? "",
          slug: c.slug ?? "",
          description: c.description ?? "",
          image_path: c.image_path ?? "",
          display_order: c.display_order ?? 0,
          is_active: !!(c.is_active === 1 || c.is_active === true),
        });
      })
      .catch((e) => setErr(e.body?.error || e.message));
  }, [id, isCreate]);

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    setPendingFile(f || null);
    setFilePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return f ? URL.createObjectURL(f) : null;
    });
  };

  const save = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        description: form.description.trim() || null,
        image_path: form.image_path.trim() || null,
        display_order: Number(form.display_order) || 0,
        is_active: form.is_active,
      };
      let categoryId = id;
      if (isCreate) {
        const r = await apiJson("/api/admin/categories", { method: "POST", body: JSON.stringify(payload) });
        categoryId = String(r.id);
      } else {
        await apiJson(`/api/admin/categories/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      }

      if (pendingFile && categoryId) {
        const up = await apiUploadCategoryImage(categoryId, pendingFile);
        if (up?.image_path) {
          setForm((f) => ({ ...f, image_path: up.image_path }));
        }
      }

      navigate("/admin/categories");
    } catch (e) {
      const b = e.body;
      setErr(
        b?.error === "slug_taken"
          ? "Slug already taken"
          : b?.error === "cloudinary_not_configured"
            ? "Cloudinary is not configured on the API."
            : b?.error || e.message
      );
    } finally {
      setBusy(false);
    }
  };

  const displayImg = filePreviewUrl || (form.image_path?.trim() ? form.image_path.trim() : null);

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
            <p className={lbl}>Admin / Categories</p>
            <h1 className="text-2xl font-black uppercase tracking-wide text-slate-900 md:text-3xl">
              {isCreate ? "Add category" : "Edit category"}
            </h1>
          </div>
          <Link
            to="/admin/categories"
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
              <span className={lbl}>Display order</span>
              <input
                type="number"
                className={inp}
                value={form.display_order}
                onChange={(e) => setForm((f) => ({ ...f, display_order: e.target.value }))}
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
            <label className="block md:col-span-2">
              <span className={lbl}>Description</span>
              <textarea
                className={inp}
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </label>
            <label className="block md:col-span-2">
              <span className={lbl}>Image URL (optional)</span>
              <input
                className={inp}
                value={form.image_path}
                onChange={(e) => setForm((f) => ({ ...f, image_path: e.target.value }))}
                placeholder="Or upload a file below"
              />
              <p className="mt-1 text-[11px] text-slate-500">Square image recommended (e.g. 600×600).</p>
            </label>

            <div className="md:col-span-2">
              <span className={lbl}>Upload / replace image</span>
              <input type="file" accept="image/*" className={`${inp} cursor-pointer`} onChange={onPickFile} />
              <p className="mt-1 text-[11px] text-slate-500">
                Saved to Cloudinary on submit (requires Cloudinary env vars on the API).
              </p>
            </div>

            <div className="md:col-span-2 flex flex-wrap items-start gap-6">
              <div>
                <span className={lbl}>Preview</span>
                {displayImg ? (
                  <img src={displayImg} alt="" className="mt-2 h-32 w-32 rounded-xl border border-slate-200 object-cover" />
                ) : (
                  <div className="mt-2 flex h-32 w-32 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
                    No image
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-4">
            <Link to="/admin/categories" className="rounded-full border border-slate-300 px-6 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-slate-900 px-6 py-2 text-xs font-semibold text-white hover:bg-black disabled:opacity-50"
            >
              {busy ? "Saving…" : isCreate ? "Create category" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
