import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../../../api/client.js";
import { useDeleteConfirm } from "../../../context/DeleteConfirmContext.jsx";
import { lbl, shellClass, tableCardClass } from "./catalogAdminUi.js";

export default function BrandsPage() {
  const askDelete = useDeleteConfirm();
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);
  const load = () =>
    apiJson("/api/admin/brands")
      .then((d) => setRows(d.brands ?? []))
      .catch((e) => setErr(e.message));
  useEffect(() => {
    load();
  }, []);
  const onDelete = async (id, name) => {
    const label = String(name ?? "").trim() || `#${id}`;
    const ok = await askDelete({
      title: "Delete this brand?",
      description: `Permanently remove “${label}” from the catalog.\n\nThis cannot be undone.`,
    });
    if (!ok) return;
    try {
      await apiJson(`/api/admin/brands/${id}`, { method: "DELETE", body: "{}" });
      load();
    } catch (e) {
      alert(e.body?.error === "brand_has_products" ? `Has ${e.body.count} products` : e.message);
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
            <p className={lbl}>Admin / Brands</p>
            <h1 className="text-2xl font-black uppercase tracking-wide text-slate-900 md:text-3xl">Brands</h1>
          </div>
          <Link
            to="/admin/brands/create"
            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow hover:bg-black md:text-sm"
          >
            + Add brand
          </Link>
        </header>

        <div className={tableCardClass}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="p-3">ID</th>
                <th className="p-3">Name</th>
                <th className="p-3">Slug</th>
                <th className="p-3">Order</th>
                <th className="p-3">Active</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-600">
                    No brands yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 bg-white hover:bg-slate-50/80">
                    <td className="p-3 align-top text-xs text-slate-600">{r.id}</td>
                    <td className="p-3 align-top font-semibold text-slate-900">{r.name}</td>
                    <td className="p-3 align-top break-all text-xs text-slate-600">{r.slug}</td>
                    <td className="p-3 align-top text-xs">{r.display_order ?? 0}</td>
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
                          to={`/admin/brands/${r.id}/edit`}
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
      </div>
    </section>
  );
}
