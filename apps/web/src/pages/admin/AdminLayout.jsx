import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { apiJson, bootstrapCsrf } from "../../api/client.js";
import { subscribeAuthSessionChanged } from "../../lib/authCrossTab.js";
import { P } from "./adminPermKeys.js";
import { AdminPermProvider, useAdminPerm } from "./AdminPermContext.jsx";

const nav = [
  { to: "/admin", label: "Dashboard", end: true },
  { to: "/admin/help", label: "Help" },
  { to: "/admin/feature-coverage", label: "Feature coverage" },
  { to: "/admin/analytics", label: "Analytics", perm: P.FINANCE_ANALYTICS },
  {
    label: "Catalog",
    children: [
      { to: "/admin/categories", label: "Categories", perm: P.CATALOG_CATEGORIES_VIEW },
      { to: "/admin/subcategories", label: "Subcategories", perm: P.CATALOG_SUBCATEGORIES_VIEW },
      { to: "/admin/brands", label: "Brands", perm: P.CATALOG_BRANDS_VIEW },
      { to: "/admin/models", label: "Models", perm: P.CATALOG_MODELS_VIEW },
      { to: "/admin/products", label: "Products", perm: P.CATALOG_PRODUCTS_VIEW },
      { to: "/admin/products/labels", label: "Bulk labels", perm: P.CATALOG_PRODUCTS_LABELS },
    ],
  },
  {
    label: "Store & staff",
    children: [
      { to: "/admin/stores", label: "Stores", adminOnly: true },
      { to: "/admin/counters", label: "Counters", perm: P.ADMIN_COUNTERS },
      { to: "/admin/staff", label: "Staff", adminOnly: true },
      { to: "/admin/roles", label: "Roles", adminOnly: true },
    ],
  },
  {
    label: "Sales",
    children: [
      { to: "/admin/orders", label: "Orders", perm: P.ADMIN_ORDERS },
      { to: "/admin/coupons", label: "Coupons", adminOnly: true },
      { to: "/admin/reviews", label: "Reviews", perm: P.ADMIN_REVIEWS },
    ],
  },
  {
    label: "POS & stock",
    children: [
      { to: "/admin/pos", label: "POS", perm: P.ACCESS_POS },
      { to: "/admin/pos/orders", label: "POS orders", perm: P.FINANCE_POS_ORDERS },
      { to: "/admin/pos/gst-report", label: "POS GST report", perm: P.FINANCE_POS_GST },
      { to: "/admin/pos/returns", label: "POS returns", perm: P.FINANCE_POS_RETURNS },
      { to: "/admin/stock-transfer", label: "Stock transfer", perm: P.ADMIN_STOCK },
      { to: "/admin/stock-management", label: "Stock management", perm: P.ADMIN_STOCK },
      { to: "/admin/returns", label: "Returns", perm: P.ADMIN_RETURNS },
    ],
  },
  {
    label: "Operations",
    children: [
      { to: "/admin/attendance", label: "Attendance", perm: P.ADMIN_ATTENDANCE },
      { to: "/admin/income-expense", label: "Income & expense", perm: P.FINANCE_INCOME_EXPENSE },
    ],
  },
];

function AdminNav() {
  const { has, isAdmin } = useAdminPerm();

  return (
    <nav className="space-y-3 text-sm max-h-[70vh] overflow-y-auto pr-1">
      {nav.map((item) => {
        if (item.perm && !has(item.perm)) return null;
        if (item.to) {
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 font-medium transition ${
                  isActive ? "bg-gray-900 text-white shadow-sm" : "text-gray-700 hover:bg-gray-100"
                }`
              }
            >
              {item.label}
            </NavLink>
          );
        }
        const children = (item.children ?? []).filter((c) => {
          if (c.adminOnly && !isAdmin) return false;
          if (c.perm && !has(c.perm)) return false;
          return true;
        });
        if (children.length === 0) return null;
        return (
          <div key={item.label} className="pt-2">
            <div className="text-[11px] font-bold uppercase text-gray-400 tracking-wider mb-1.5">{item.label}</div>
            <div className="space-y-1 pl-2 border-l-2 border-gray-200">
              {children.map((c) => (
                <NavLink
                  key={c.to}
                  to={c.to}
                  className={({ isActive }) =>
                    `block rounded-lg px-2.5 py-1.5 transition ${
                      isActive ? "bg-gray-900 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"
                    }`
                  }
                >
                  {c.label}
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const loc = useLocation();
  const [gate, setGate] = useState("loading");
  const [perm, setPerm] = useState({
    ready: false,
    isAdmin: false,
    keys: [],
    sessionStorage: null,
    catalogScope: null,
  });

  useEffect(() => {
    let cancelled = false;
    apiJson("/api/admin/ping")
      .then((d) => {
        if (cancelled) return;
        setPerm({
          ready: true,
          isAdmin: !!d.isAdmin,
          keys: Array.isArray(d.adminPermissionKeys) ? d.adminPermissionKeys : [],
          sessionStorage: d.session_storage ?? null,
          catalogScope: d.catalog_scope ?? null,
        });
        setGate("ok");
      })
      .catch(() => {
        if (!cancelled) setGate("denied");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return subscribeAuthSessionChanged(async () => {
      await bootstrapCsrf();
      try {
        const d = await apiJson("/api/admin/ping");
        setPerm({
          ready: true,
          isAdmin: !!d.isAdmin,
          keys: Array.isArray(d.adminPermissionKeys) ? d.adminPermissionKeys : [],
          sessionStorage: d.session_storage ?? null,
          catalogScope: d.catalog_scope ?? null,
        });
        setGate("ok");
      } catch {
        setGate("denied");
      }
    });
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      apiJson("/api/admin/ping")
        .then((d) => {
          setPerm({
            ready: true,
            isAdmin: !!d.isAdmin,
            keys: Array.isArray(d.adminPermissionKeys) ? d.adminPermissionKeys : [],
            sessionStorage: d.session_storage ?? null,
            catalogScope: d.catalog_scope ?? null,
          });
          setGate("ok");
        })
        .catch(() => setGate("denied"));
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (gate === "denied") {
      navigate(`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`, { replace: true });
    }
  }, [gate, navigate, loc.pathname, loc.search]);

  if (gate !== "ok") {
    return (
      <div className="container mx-auto px-4 py-16 text-center text-gray-600">
        {gate === "denied" ? "Redirecting to login…" : "Checking admin session…"}
      </div>
    );
  }

  return (
    <AdminPermProvider ready={perm.ready} isAdmin={perm.isAdmin} keys={perm.keys} catalogScope={perm.catalogScope}>
      <div className="admin-shell min-h-screen bg-neutral-50 flex flex-col md:flex-row text-gray-900">
        <aside className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-gray-200 bg-white/95 backdrop-blur p-4 md:p-5 space-y-4 md:sticky md:top-0 md:h-screen md:overflow-y-auto">
          <div className="pb-3 border-b border-gray-100">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">Control center</div>
            <div className="font-semibold text-lg tracking-tight text-gray-900 mt-1">Backroar Admin</div>
          </div>
          <AdminNav />
          <Link to="/" className="text-sm text-[var(--brand-accent)] underline block pt-2">
            ← Storefront
          </Link>
        </aside>
        <main className="admin-content flex-1 p-4 md:p-8 overflow-x-auto">
          <div className="mb-5 rounded-xl border border-gray-200 bg-white/80 px-4 py-3 shadow-sm">
            <div className="text-[11px] uppercase tracking-[0.14em] text-gray-500 font-semibold">Workspace</div>
            <div className="text-lg font-semibold text-gray-900">Manage operations, catalog, POS and finance</div>
          </div>
          {perm.sessionStorage === "memory" ? (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Sessions are using in-memory storage (POS carts and stock-transfer drafts reset when the API
              restarts). Set <code className="font-mono text-xs bg-white/80 px-1 rounded">USE_REDIS=true</code> and{" "}
              <code className="font-mono text-xs bg-white/80 px-1 rounded">REDIS_URL</code> in{" "}
              <code className="font-mono text-xs bg-white/80 px-1 rounded">.env</code> for persistent server-side
              sessions.
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>
    </AdminPermProvider>
  );
}
