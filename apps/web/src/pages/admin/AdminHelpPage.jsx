import { Link } from "react-router-dom";

const card = (title, badge, children) => (
  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between mb-2">
      <h2 className="font-bold text-lg text-gray-900">{title}</h2>
      <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-900 text-white px-2 py-0.5 rounded-full">{badge}</span>
    </div>
    {children}
  </div>
);

export default function AdminHelpPage() {
  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <p className="text-xs font-bold uppercase text-gray-400 tracking-wider mb-1">Admin / Help</p>
        <h1 className="text-2xl md:text-3xl font-black tracking-tight text-gray-900">Admin help & instructions</h1>
        <p className="text-gray-600 text-sm mt-2">
          Short guides for each admin area; links open in-app routes. For an internal feature checklist, see{" "}
          <Link className="text-[var(--brand-accent)] underline font-semibold" to="/admin/feature-coverage">
            Feature coverage
          </Link>
          .
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {card(
          "POS billing",
          "Sales",
          <>
            <p className="text-sm text-gray-600 mb-2">Opens billing for in-shop or packed orders.</p>
            <p className="text-sm mb-2">
              <strong>What it does:</strong> POS session, line items, discounts, GST, checkout.
            </p>
            <p className="text-sm mb-2">
              <strong>How:</strong>{" "}
              <Link className="text-[var(--brand-accent)] underline" to="/admin/pos">
                Open POS
              </Link>
              , choose store/counter, scan or search products, checkout.
            </p>
          </>
        )}
        {card(
          "Orders",
          "Operations",
          <>
            <p className="text-sm text-gray-600 mb-2">Website orders (Mongo).</p>
            <p className="text-sm mb-2">
              <Link className="text-[var(--brand-accent)] underline" to="/admin/orders">
                Orders
              </Link>{" "}
              — list, filters, status updates, detail.
            </p>
          </>
        )}
        {card(
          "Products",
          "Catalog",
          <>
            <p className="text-sm text-gray-600 mb-2">Create and edit catalog items.</p>
            <p className="text-sm">
              <Link className="text-[var(--brand-accent)] underline" to="/admin/products">
                Products
              </Link>
            </p>
          </>
        )}
        {card(
          "Categories",
          "Structure",
          <>
            <p className="text-sm text-gray-600 mb-2">Categories and subcategories.</p>
            <p className="text-sm">
              <Link className="text-[var(--brand-accent)] underline" to="/admin/categories">
                Categories
              </Link>{" "}
              ·{" "}
              <Link className="text-[var(--brand-accent)] underline" to="/admin/subcategories">
                Subcategories
              </Link>
            </p>
          </>
        )}
        {card(
          "Stores & staff",
          "Access",
          <>
            <p className="text-sm text-gray-600 mb-2">Branches, counters, staff, roles.</p>
            <p className="text-sm space-x-1">
              <Link className="text-[var(--brand-accent)] underline" to="/admin/stores">
                Stores
              </Link>
              ·
              <Link className="text-[var(--brand-accent)] underline" to="/admin/counters">
                Counters
              </Link>
              ·
              <Link className="text-[var(--brand-accent)] underline" to="/admin/staff">
                Staff
              </Link>
            </p>
          </>
        )}
        {card(
          "Stock transfer",
          "Inventory",
          <>
            <p className="text-sm text-gray-600 mb-2">Move stock between stores.</p>
            <p className="text-sm">
              <Link className="text-[var(--brand-accent)] underline" to="/admin/stock-transfer">
                Stock transfer
              </Link>
            </p>
          </>
        )}
        {card(
          "Coupons",
          "Marketing",
          <>
            <p className="text-sm text-gray-600 mb-2">Discount codes for checkout.</p>
            <p className="text-sm">
              <Link className="text-[var(--brand-accent)] underline" to="/admin/coupons">
                Coupons
              </Link>
            </p>
          </>
        )}
        {card(
          "Returns",
          "Service",
          <>
            <p className="text-sm text-gray-600 mb-2">POS or web bill returns with stock credit.</p>
            <p className="text-sm">
              <Link className="text-[var(--brand-accent)] underline" to="/admin/returns">
                Returns
              </Link>
            </p>
          </>
        )}
        {card(
          "Reviews",
          "Trust",
          <>
            <p className="text-sm text-gray-600 mb-2">Approve or reject customer reviews.</p>
            <p className="text-sm">
              <Link className="text-[var(--brand-accent)] underline" to="/admin/reviews">
                Reviews
              </Link>
            </p>
          </>
        )}
        {card(
          "Analytics",
          "Insights",
          <>
            <p className="text-sm text-gray-600 mb-2">POS trends, payment mix, low stock (finance permission).</p>
            <p className="text-sm">
              <Link className="text-[var(--brand-accent)] underline" to="/admin/analytics">
                Analytics
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
