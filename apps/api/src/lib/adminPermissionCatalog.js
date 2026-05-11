/**
 * Admin panel capability keys (Mongo `permissions.key_name`).
 * Staff: denied unless assigned via role_permissions. Admins: always allowed.
 *
 * Finance-related keys default off for staff so revenue/tax/returns lists are not
 * visible unless an administrator explicitly grants them (client anti-theft requirement).
 */
export const ADMIN_PERMISSION_CATALOG = [
  {
    key: "access_pos",
    name: "POS terminal",
    description: "Open POS login, billing, and checkout.",
  },
  {
    key: "admin.catalog",
    name: "Catalog (full access)",
    description:
      "Equivalent to granular catalog permissions except ‘Products — all shops (catalog)’, which must be added separately so assigned-shop staff stay restricted unless an admin enables it.",
  },
  { key: "admin.catalog.categories.view", name: "Categories — view", description: "List and open categories." },
  {
    key: "admin.catalog.categories.create",
    name: "Categories — create",
    description: "Create categories.",
  },
  {
    key: "admin.catalog.categories.update",
    name: "Categories — edit",
    description: "Update categories.",
  },
  {
    key: "admin.catalog.categories.delete",
    name: "Categories — delete",
    description: "Delete categories.",
  },
  {
    key: "admin.catalog.categories.images",
    name: "Categories — images",
    description: "Upload category thumbnails.",
  },
  { key: "admin.catalog.brands.view", name: "Brands — view", description: "List and open brands." },
  { key: "admin.catalog.brands.create", name: "Brands — create", description: "Create brands." },
  { key: "admin.catalog.brands.update", name: "Brands — edit", description: "Update brands." },
  { key: "admin.catalog.brands.delete", name: "Brands — delete", description: "Delete brands." },
  { key: "admin.catalog.models.view", name: "Models — view", description: "List and open models." },
  { key: "admin.catalog.models.create", name: "Models — create", description: "Create models." },
  { key: "admin.catalog.models.update", name: "Models — edit", description: "Update models." },
  { key: "admin.catalog.models.delete", name: "Models — delete", description: "Delete models." },
  {
    key: "admin.catalog.subcategories.view",
    name: "Subcategories — view",
    description: "List and open subcategories.",
  },
  {
    key: "admin.catalog.subcategories.create",
    name: "Subcategories — create",
    description: "Create subcategories.",
  },
  {
    key: "admin.catalog.subcategories.update",
    name: "Subcategories — edit",
    description: "Update subcategories and visibility toggle.",
  },
  {
    key: "admin.catalog.subcategories.delete",
    name: "Subcategories — delete",
    description: "Delete subcategories.",
  },
  { key: "admin.catalog.products.view", name: "Products — view", description: "Product list and detail." },
  {
    key: "admin.catalog.products.create",
    name: "Products — create",
    description: "Create products (including initial variants).",
  },
  {
    key: "admin.catalog.products.update",
    name: "Products — edit",
    description: "Edit products, variants, pricing, and stock fields.",
  },
  { key: "admin.catalog.products.delete", name: "Products — delete", description: "Delete products." },
  {
    key: "admin.catalog.products.images",
    name: "Products — gallery upload (optional)",
    description:
      "Dedicated permission for queue uploads; staff with Products — edit may upload without this.",
  },
  {
    key: "admin.catalog.products.labels",
    name: "Products — thermal labels",
    description: "TSPL label preview, printer preference, and network send.",
  },
  {
    key: "admin.catalog.products.all_shops",
    name: "Products — all shops (catalog)",
    description:
      "Filter catalog products by any store / see products outside assigned shop. Without this, staff are restricted to their assigned shop only.",
  },
  {
    key: "admin.orders",
    name: "Web orders",
    description: "Customer checkout orders (admin list and status updates). Storefront checkout stays public.",
  },
  {
    key: "admin.stock",
    name: "Stock & transfers",
    description: "Stock transfer, stock management, low-stock views, and active store list for operational pickers.",
  },
  {
    key: "admin.counters",
    name: "POS counters",
    description: "Configure POS counters and PINs per store.",
  },
  {
    key: "admin.reviews",
    name: "Reviews moderation",
    description: "Approve, reject, or delete product reviews.",
  },
  {
    key: "admin.returns",
    name: "Returns register",
    description: "Look up bills and create returns (non–POS-specific admin returns).",
  },
  {
    key: "admin.attendance",
    name: "Attendance",
    description: "Attendance board, self check-in/out, and manager corrections.",
  },
  {
    key: "admin.finance.pos_orders",
    name: "POS order history",
    description: "List/detail POS bills with line totals (sensitive sales view).",
  },
  {
    key: "admin.finance.pos_gst",
    name: "POS GST report",
    description: "Aggregated GST / taxable sales reporting.",
  },
  {
    key: "admin.finance.pos_returns",
    name: "POS returns",
    description: "Return register and related financial exposure.",
  },
  {
    key: "admin.finance.income_expense",
    name: "Income & expense",
    description: "Income and expense ledgers (when migrated).",
  },
  {
    key: "admin.finance.analytics",
    name: "Analytics",
    description: "Business analytics dashboards (when migrated).",
  },
];

/** @type {readonly string[]} */
export const ALL_ADMIN_PERMISSION_KEY_STRINGS = Object.freeze(
  ADMIN_PERMISSION_CATALOG.map((row) => row.key)
);

/** Stable aliases for route guards (keep in sync with `ADMIN_PERMISSION_CATALOG`). */
export const PERM = Object.freeze({
  ACCESS_POS: "access_pos",
  ADMIN_CATALOG: "admin.catalog",
  CATALOG_CATEGORIES_VIEW: "admin.catalog.categories.view",
  CATALOG_CATEGORIES_CREATE: "admin.catalog.categories.create",
  CATALOG_CATEGORIES_UPDATE: "admin.catalog.categories.update",
  CATALOG_CATEGORIES_DELETE: "admin.catalog.categories.delete",
  CATALOG_CATEGORIES_IMAGES: "admin.catalog.categories.images",
  CATALOG_BRANDS_VIEW: "admin.catalog.brands.view",
  CATALOG_BRANDS_CREATE: "admin.catalog.brands.create",
  CATALOG_BRANDS_UPDATE: "admin.catalog.brands.update",
  CATALOG_BRANDS_DELETE: "admin.catalog.brands.delete",
  CATALOG_MODELS_VIEW: "admin.catalog.models.view",
  CATALOG_MODELS_CREATE: "admin.catalog.models.create",
  CATALOG_MODELS_UPDATE: "admin.catalog.models.update",
  CATALOG_MODELS_DELETE: "admin.catalog.models.delete",
  CATALOG_SUBCATEGORIES_VIEW: "admin.catalog.subcategories.view",
  CATALOG_SUBCATEGORIES_CREATE: "admin.catalog.subcategories.create",
  CATALOG_SUBCATEGORIES_UPDATE: "admin.catalog.subcategories.update",
  CATALOG_SUBCATEGORIES_DELETE: "admin.catalog.subcategories.delete",
  CATALOG_PRODUCTS_VIEW: "admin.catalog.products.view",
  CATALOG_PRODUCTS_CREATE: "admin.catalog.products.create",
  CATALOG_PRODUCTS_UPDATE: "admin.catalog.products.update",
  CATALOG_PRODUCTS_DELETE: "admin.catalog.products.delete",
  CATALOG_PRODUCTS_IMAGES: "admin.catalog.products.images",
  CATALOG_PRODUCTS_LABELS: "admin.catalog.products.labels",
  CATALOG_PRODUCTS_ALL_SHOPS: "admin.catalog.products.all_shops",
  ADMIN_ORDERS: "admin.orders",
  ADMIN_STOCK: "admin.stock",
  ADMIN_COUNTERS: "admin.counters",
  ADMIN_REVIEWS: "admin.reviews",
  ADMIN_RETURNS: "admin.returns",
  ADMIN_ATTENDANCE: "admin.attendance",
  FINANCE_POS_ORDERS: "admin.finance.pos_orders",
  FINANCE_POS_GST: "admin.finance.pos_gst",
  FINANCE_POS_RETURNS: "admin.finance.pos_returns",
  FINANCE_INCOME_EXPENSE: "admin.finance.income_expense",
  FINANCE_ANALYTICS: "admin.finance.analytics",
});

/** Staff editing products may load taxonomy lists without separate category/brand roles. */
export const PERM_EXTRA_PRODUCT_EDITOR_READ = Object.freeze([
  PERM.CATALOG_PRODUCTS_VIEW,
  PERM.CATALOG_PRODUCTS_CREATE,
  PERM.CATALOG_PRODUCTS_UPDATE,
]);
