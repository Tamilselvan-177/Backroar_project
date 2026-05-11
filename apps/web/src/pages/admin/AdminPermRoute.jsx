import { Navigate } from "react-router-dom";
import { useAdminPerm } from "./AdminPermContext.jsx";

/** Gate SPA routes to match `/api/admin/*` RBAC (deep links). Checkout storefront routes stay outside `/admin`. */
export default function AdminPermRoute({ perm, adminOnly, children }) {
  const { ready, has, isAdmin } = useAdminPerm();
  if (!ready) {
    return <div className="text-gray-500 text-sm py-8">Loading…</div>;
  }
  if (adminOnly && !isAdmin) {
    return <Navigate to="/admin" replace state={{ accessDenied: "admin_only" }} />;
  }
  if (perm && !has(perm)) {
    return <Navigate to="/admin" replace state={{ accessDenied: perm }} />;
  }
  return children;
}
