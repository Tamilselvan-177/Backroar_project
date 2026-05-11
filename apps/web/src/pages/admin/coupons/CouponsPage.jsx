import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../../../api/client.js";
import { useDeleteConfirm } from "../../../context/DeleteConfirmContext.jsx";

function fmtWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

export default function CouponsPage() {
  const askDelete = useDeleteConfirm();
  const [coupons, setCoupons] = useState([]);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    apiJson("/api/admin/coupons")
      .then((d) => setCoupons(d.coupons ?? []))
      .catch((e) => {
        setErr(e.body?.error === "admin_only" ? "Only administrators can manage coupons." : e.message);
        setCoupons([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (c) => {
    const code = String(c?.code ?? "").trim() || `#${c.id}`;
    const ok = await askDelete({
      title: "Delete this coupon?",
      description: `Permanently remove coupon “${code}”.\n\nThis cannot be undone.`,
    });
    if (!ok) return;
    try {
      await apiJson(`/api/admin/coupons/${c.id}`, { method: "DELETE", body: "{}" });
      load();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Coupons</h1>
          <p className="text-sm text-gray-600 mt-1">Discount codes for checkout (admin only).</p>
        </div>
        <Link
          to="/admin/coupons/create"
          className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800"
        >
          Add coupon
        </Link>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{err}</div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : (
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left p-3">Code</th>
                <th className="text-left p-3">Type</th>
                <th className="text-right p-3">Value</th>
                <th className="text-center p-3">Active</th>
                <th className="text-left p-3">Valid</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    No coupons yet, or you do not have access.
                  </td>
                </tr>
              ) : (
                coupons.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-3 font-mono font-semibold">{c.code}</td>
                    <td className="p-3">{c.discount_type}</td>
                    <td className="p-3 text-right">
                      {c.discount_type === "PERCENT" ? `${c.discount_value}%` : `₹${Number(c.discount_value).toFixed(2)}`}
                    </td>
                    <td className="p-3 text-center">{c.is_active === 1 || c.is_active === true ? "Yes" : "No"}</td>
                    <td className="p-3 text-gray-600 text-xs whitespace-nowrap">
                      {fmtWhen(c.valid_from)} → {fmtWhen(c.valid_to)}
                    </td>
                    <td className="p-3 text-right space-x-2 whitespace-nowrap">
                      <Link to={`/admin/coupons/${c.id}/edit`} className="text-[var(--brand-accent)] underline text-xs">
                        Edit
                      </Link>
                      <button type="button" className="text-red-600 underline text-xs" onClick={() => remove(c)}>
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
