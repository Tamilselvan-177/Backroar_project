import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../../../api/client.js";
import { useDeleteConfirm } from "../../../context/DeleteConfirmContext.jsx";

export default function RolesPage() {
  const askDelete = useDeleteConfirm();
  const [roles, setRoles] = useState([]);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setErr(null);
    apiJson("/api/admin/roles")
      .then((d) => setRoles(d.roles ?? []))
      .catch((e) => {
        setErr(
          e.body?.error === "admin_only" ? "Only administrators can manage roles." : e.message
        );
        setRoles([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (r) => {
    const name = String(r.name ?? "").trim() || `#${r.id}`;
    const ok = await askDelete({
      title: "Delete this role?",
      description: `Remove role “${name}”.\n\nOnly allowed when no users are assigned and it is not a system role.\n\nThis cannot be undone.`,
    });
    if (!ok) return;
    try {
      await apiJson(`/api/admin/roles/${r.id}`, { method: "DELETE", body: "{}" });
      load();
    } catch (e) {
      const b = e.body;
      if (b?.error === "system_role") setErr("System roles cannot be deleted.");
      else if (b?.error === "role_in_use") setErr("Remove this role from all users before deleting.");
      else setErr(e.message);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Roles</h1>
          <p className="text-sm text-gray-600 mt-1">
            Define permission bundles for staff. Finance-related keys stay off until you enable them here.
          </p>
        </div>
        <Link
          to="/admin/roles/create"
          className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800"
        >
          Add role
        </Link>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{err}</div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : (
          <table className="w-full text-sm min-w-[520px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Description</th>
                <th className="text-center p-3">Users</th>
                <th className="text-center p-3">System</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">
                    No roles yet, or you do not have access.
                  </td>
                </tr>
              ) : (
                roles.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-3 font-medium text-gray-900">{r.name}</td>
                    <td className="p-3 text-gray-600 max-w-xs truncate" title={r.description || ""}>
                      {r.description || "—"}
                    </td>
                    <td className="p-3 text-center">{r.users_count ?? 0}</td>
                    <td className="p-3 text-center">{r.is_system_role === 1 || r.is_system_role === true ? "Yes" : "No"}</td>
                    <td className="p-3 text-right space-x-2 whitespace-nowrap">
                      <Link to={`/admin/roles/${r.id}/edit`} className="text-[var(--brand-accent)] underline text-xs">
                        Edit
                      </Link>
                      {!(r.is_system_role === 1 || r.is_system_role === true) && (r.users_count ?? 0) === 0 ? (
                        <button type="button" className="text-red-600 underline text-xs" onClick={() => remove(r)}>
                          Delete
                        </button>
                      ) : null}
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
