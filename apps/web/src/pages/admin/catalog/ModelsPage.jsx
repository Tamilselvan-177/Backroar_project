import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiJson } from "../../../api/client.js";
import { useDeleteConfirm } from "../../../context/DeleteConfirmContext.jsx";
import { lbl, shellClass, tableCardClass } from "./catalogAdminUi.js";

export default function ModelsPage() {
  const askDelete = useDeleteConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const brandId = searchParams.get("brand_id") || "";
  const [data, setData] = useState({ models: [], brands: [] });
  const [err, setErr] = useState(null);

  const qs = brandId ? `?brand_id=${encodeURIComponent(brandId)}` : "";
  useEffect(() => {
    apiJson(`/api/admin/models${qs}`)
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [qs]);

  const onDelete = async (id, name) => {
    const label = String(name ?? "").trim() || `#${id}`;
    const ok = await askDelete({
      title: "Delete this model?",
      description: `Permanently remove “${label}” from the catalog.\n\nThis cannot be undone.`,
    });
    if (!ok) return;
    try {
      await apiJson(`/api/admin/models/${id}`, { method: "DELETE", body: "{}" });
      apiJson(`/api/admin/models${qs}`).then(setData);
    } catch (e) {
      alert(e.body?.error === "model_has_products" ? `Has ${e.body.count} products` : e.message);
    }
  };

  if (err) return <p className="text-red-600">{err}</p>;

  return (
    <section className={shellClass}>
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <Link
              to="/admin"
              className="inline-flex items-center rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-600 hover:bg-white"
            >
              ← Dashboard
            </Link>
            <p className={lbl}>Admin / Models</p>
            <h1 className="text-2xl font-black uppercase tracking-wide text-slate-900 md:text-3xl">Models</h1>
          </div>
          <Link
            to="/admin/models/create"
            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow hover:bg-black md:text-sm"
          >
            + Add model
          </Link>
        </header>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <label className={lbl}>Brand filter</label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm sm:w-72 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
              value={brandId}
              onChange={(e) => {
                const v = e.target.value;
                if (v) setSearchParams({ brand_id: v });
                else setSearchParams({});
              }}
            >
              <option value="">Select brand</option>
              {data.brands.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!brandId ? (
          <p className="text-sm font-medium text-slate-600">Select a brand to view models.</p>
        ) : (
          <div className={tableCardClass}>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="p-3">ID</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Slug</th>
                  <th className="p-3">Model #</th>
                  <th className="p-3">Active</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.models.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-600">
                      No models for this brand.
                    </td>
                  </tr>
                ) : (
                  data.models.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100 bg-white hover:bg-slate-50/80">
                      <td className="p-3 align-top text-xs text-slate-600">{r.id}</td>
                      <td className="p-3 align-top font-semibold text-slate-900">{r.name}</td>
                      <td className="p-3 align-top break-all text-xs text-slate-600">{r.slug}</td>
                      <td className="p-3 align-top text-xs text-slate-600">{r.model_number || "—"}</td>
                      <td className="p-3 align-top">
                        {r.is_active === 1 || r.is_active === true ? (
                          <span className="rounded-full bg-green-100 px-2 py-1 text-[11px] font-semibold text-green-700">
                            Yes
                          </span>
                        ) : (
                          <span className="rounded-full bg-red-100 px-2 py-1 text-[11px] font-semibold text-red-700">No</span>
                        )}
                      </td>
                      <td className="p-3 align-top">
                        <div className="flex flex-wrap gap-1">
                          <Link
                            to={`/admin/models/${r.id}/edit`}
                            className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white hover:bg-black"
                          >
                            Edit
                          </Link>
                          <button
                            type="button"
                            className="rounded-full bg-red-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-red-700"
                            onClick={() => onDelete(r.id, r.name)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
