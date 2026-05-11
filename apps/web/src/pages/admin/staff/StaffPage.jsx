import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../../../api/client.js";
import { useDeleteConfirm } from "../../../context/DeleteConfirmContext.jsx";

export default function StaffPage() {
  const askDelete = useDeleteConfirm();
  const [staff, setStaff] = useState([]);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    apiJson("/api/admin/staff")
      .then((d) => setStaff(d.staff ?? []))
      .catch((e) => {
        setErr(e.body?.error === "admin_only" ? "Only administrators can manage staff." : e.message);
        setStaff([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (row) => {
    const name = String(row.name ?? "").trim() || `ID ${row.id}`;
    const ok = await askDelete({
      title: "Delete this staff member?",
      description: `Remove “${name}” from staff.\n\nOnly allowed when they have no POS bills, holds, storefront orders, cart, wishlist, or reviews.\n\nThis cannot be undone.`,
    });
    if (!ok) return;
    try {
      await apiJson(`/api/admin/staff/${row.id}`, { method: "DELETE", body: "{}" });
      load();
    } catch (e) {
      const b = e.body;
      if (b?.error === "cannot_delete_self") setErr("You cannot delete your own account.");
      else if (b?.error === "staff_in_use") {
        const x = b.blockers || {};
        setErr(
          `Staff is still linked to data: POS orders ${x.pos_orders ?? 0}, holds ${x.pos_holds ?? 0}, reviews ${x.reviews ?? 0}, orders ${x.orders ?? 0}, cart ${x.cart_items ?? 0}, wishlist ${x.wishlist_items ?? 0}. Remove or reassign first.`
        );
      } else setErr(e.message);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Staff</h1>
          <p className="text-sm text-gray-600 mt-1">
            Staff log in with their email. Permissions come from the assigned role (see Roles).
          </p>
        </div>
        <Link
          to="/admin/staff/create"
          className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800"
        >
          Add staff
        </Link>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{err}</div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : (
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Phone</th>
                <th className="text-left p-3">Shop</th>
                <th className="text-left p-3">Role</th>
                <th className="text-center p-3">Active</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">
                    No staff users yet, or you do not have access.
                  </td>
                </tr>
              ) : (
                staff.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-3 font-medium text-gray-900">{s.name}</td>
                    <td className="p-3 text-gray-700">{s.email}</td>
                    <td className="p-3 text-gray-600">{s.phone || "—"}</td>
                    <td className="p-3 text-gray-600">{s.shop_name || "—"}</td>
                    <td className="p-3 text-gray-700">{s.role_name || "—"}</td>
                    <td className="p-3 text-center">{s.is_active === 1 || s.is_active === true ? "Yes" : "No"}</td>
                    <td className="p-3 text-right space-x-2 whitespace-nowrap">
                      <Link to={`/admin/staff/${s.id}/edit`} className="text-[var(--brand-accent)] underline text-xs">
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
