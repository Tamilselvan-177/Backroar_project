import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../../../api/client.js";
import { useDeleteConfirm } from "../../../context/DeleteConfirmContext.jsx";

export default function StoresPage() {
  const askDelete = useDeleteConfirm();
  const [stores, setStores] = useState([]);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setErr(null);
    apiJson("/api/admin/stores")
      .then((d) => setStores(d.stores ?? []))
      .catch((e) => {
        setErr(e.body?.error === "admin_only" ? "Only administrators can manage stores." : e.message);
        setStores([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (s) => {
    const label = String(s.name ?? "").trim() || s.code || `#${s.id}`;
    const ok = await askDelete({
      title: "Delete this store?",
      description: `Remove “${label}”.\n\nOnly allowed when no counters, POS bills, or returns reference this store.\n\nThis cannot be undone.`,
    });
    if (!ok) return;
    try {
      await apiJson(`/api/admin/stores/${s.id}`, { method: "DELETE", body: "{}" });
      load();
    } catch (e) {
      const b = e.body;
      if (b?.error === "store_in_use") {
        setErr(
          "Store is still in use (counters, POS orders, holds, bill sequences, or returns). Remove or reassign those first."
        );
        return;
      }
      setErr(e.message);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-2xl font-black text-gray-900">Stores</h1>
        <Link
          to="/admin/stores/create"
          className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800"
        >
          Add store
        </Link>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{err}</div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left p-3">Code</th>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">City</th>
                <th className="text-left p-3">GSTIN</th>
                <th className="text-center p-3">Active</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {stores.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    No stores yet, or you do not have access.
                  </td>
                </tr>
              ) : (
                stores.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-3 font-mono font-medium">{s.code}</td>
                    <td className="p-3">{s.name}</td>
                    <td className="p-3 text-gray-600">{s.city || "—"}</td>
                    <td className="p-3 text-gray-600 text-xs">{s.gstin || "—"}</td>
                    <td className="p-3 text-center">{s.is_active === 1 || s.is_active === true ? "Yes" : "No"}</td>
                    <td className="p-3 text-right space-x-2 whitespace-nowrap">
                      <Link to={`/admin/stores/${s.id}/edit`} className="text-[var(--brand-accent)] underline text-xs">
                        Edit
                      </Link>
                      <button type="button" className="text-red-600 underline text-xs" onClick={() => remove(s)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
