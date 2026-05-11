import { Link, useLocation } from "react-router-dom";
import { P } from "./adminPermKeys.js";
import { useAdminPerm } from "./AdminPermContext.jsx";

/** Mirrors `AdminLayout` nav groups; `perm` hides tiles the user cannot open. */
const sections = [
  {
    title: "General",
    items: [
      { to: "/admin/help", title: "Help", desc: "Instructions and in-app links" },
      { to: "/admin/analytics", title: "Analytics", desc: "POS trends, payment mix, low stock (UTC)", perm: P.FINANCE_ANALYTICS },
    ],
  },
  {
    title: "Catalog",
    items: [
      { to: "/admin/categories", title: "Categories", desc: "Full CRUD", perm: P.CATALOG_CATEGORIES_VIEW },
      {
        to: "/admin/subcategories",
        title: "Subcategories",
        desc: "CRUD + visibility toggle",
        perm: P.CATALOG_SUBCATEGORIES_VIEW,
      },
      { to: "/admin/brands", title: "Brands", desc: "Full CRUD", perm: P.CATALOG_BRANDS_VIEW },
      { to: "/admin/models", title: "Models", desc: "Full CRUD", perm: P.CATALOG_MODELS_VIEW },
      {
        to: "/admin/products",
        title: "Products",
        desc: "List, editor, and image upload — MongoDB",
        perm: P.CATALOG_PRODUCTS_VIEW,
      },
    ],
  },
  {
    title: "Store & staff",
    items: [
      { to: "/admin/stores", title: "Stores", desc: "Branches / outlets", adminOnly: true },
      { to: "/admin/counters", title: "Counters", desc: "POS counters per store", perm: P.ADMIN_COUNTERS },
      { to: "/admin/staff", title: "Staff", desc: "Accounts linked to stores & roles", adminOnly: true },
      { to: "/admin/roles", title: "Roles", desc: "Roles and admin permissions", adminOnly: true },
    ],
  },
  {
    title: "Sales",
    items: [
      { to: "/admin/orders", title: "Orders", desc: "Search, list, and detail — MongoDB", perm: P.ADMIN_ORDERS },
      { to: "/admin/coupons", title: "Coupons", desc: "Create and manage discount codes", adminOnly: true },
      { to: "/admin/reviews", title: "Reviews", desc: "Approve, reject, bulk moderate", perm: P.ADMIN_REVIEWS },
    ],
  },
  {
    title: "POS & stock",
    items: [
      { to: "/admin/pos", title: "POS", desc: "Session login, billing, checkout", perm: P.ACCESS_POS },
      { to: "/admin/pos/orders", title: "POS orders", desc: "History and search", perm: P.FINANCE_POS_ORDERS },
      { to: "/admin/pos/gst-report", title: "POS GST report", desc: "Tax summary", perm: P.FINANCE_POS_GST },
      { to: "/admin/pos/returns", title: "POS returns", desc: "Return line items", perm: P.FINANCE_POS_RETURNS },
      { to: "/admin/stock-transfer", title: "Stock transfer", desc: "Move stock between stores", perm: P.ADMIN_STOCK },
      { to: "/admin/stock-management", title: "Stock management", desc: "Inventory, adjust, history, low stock", perm: P.ADMIN_STOCK },
      { to: "/admin/returns", title: "Returns", desc: "POS or web bill search, refund, stock credit", perm: P.ADMIN_RETURNS },
    ],
  },
  {
    title: "Operations",
    items: [
      { to: "/admin/attendance", title: "Attendance", desc: "My check-in/out and team board", perm: P.ADMIN_ATTENDANCE },
      {
        to: "/admin/income-expense",
        title: "Income & expense",
        desc: "Overview, expenses, income ledger, reports",
        perm: P.FINANCE_INCOME_EXPENSE,
      },
    ],
  },
];

export default function AdminDashboard() {
  const loc = useLocation();
  const denied = loc.state?.accessDenied;
  const { has, isAdmin } = useAdminPerm();

  const visibleSections = sections
    .map((s) => ({
      ...s,
      items: s.items.filter((c) => {
        if (c.adminOnly && !isAdmin) return false;
        if (c.perm && !has(c.perm)) return false;
        return true;
      }),
    }))
    .filter((s) => s.items.length > 0);

  return (
    <div>
      {denied ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-950 text-sm px-4 py-3">
          {denied === "admin_only"
            ? "That section is limited to administrator accounts."
            : `Missing permission “${String(denied)}”. Ask an administrator to grant it on your role (Roles → edit permissions).`}
        </div>
      ) : null}
      <h1 className="text-3xl font-semibold tracking-tight text-gray-900 mb-2">Dashboard</h1>
      <p className="text-gray-600 mb-8 text-sm max-w-2xl leading-relaxed">
        Tiles match what your role allows (same checks as API routes). Finance screens stay off unless explicitly granted.
        Storefront checkout is unchanged.
      </p>
      <div className="space-y-10">
        {visibleSections.map((sec) => (
          <section key={sec.title}>
            <h2 className="text-xs font-bold uppercase text-gray-400 tracking-wider mb-3">{sec.title}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sec.items.map((c) => (
                <Link
                  key={c.to}
                  to={c.to}
                  className="group block rounded-lg border border-gray-200 bg-white p-5 hover:border-gray-900 hover:shadow-sm transition-colors"
                >
                  <h3 className="font-semibold text-gray-900 text-lg group-hover:text-black">{c.title}</h3>
                  <p className="text-gray-500 text-sm mt-1.5 leading-snug">{c.desc}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
