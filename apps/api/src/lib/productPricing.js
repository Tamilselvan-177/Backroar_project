/**
 * Variant-aware pricing for storefront cart, POS, labels, and aggregate product listing fields.
 */

export function variantMrp(variant, product) {
  const vp = variant?.price != null && variant.price !== "" ? Number(variant.price) : NaN;
  if (Number.isFinite(vp) && vp >= 0) return vp;
  const pp = Number(product?.price ?? 0);
  return Number.isFinite(pp) && pp >= 0 ? pp : 0;
}

/** Numeric sale if strictly below MRP; otherwise null. */
export function variantSalePrice(variant, product) {
  const base = variantMrp(variant, product);
  if (variant?.sale_price != null && variant.sale_price !== "") {
    const s = Number(variant.sale_price);
    if (Number.isFinite(s) && s > 0 && s < base) return s;
    return null;
  }
  const ps = product?.sale_price != null && product.sale_price !== "" ? Number(product.sale_price) : null;
  if (ps != null && Number.isFinite(ps) && ps > 0 && ps < base) return ps;
  return null;
}

export function variantEffectiveSelling(variant, product) {
  const sale = variantSalePrice(variant, product);
  if (sale != null) return sale;
  return variantMrp(variant, product);
}

export function variantGstPercent(variant, product) {
  if (variant?.gst_percent != null && variant.gst_percent !== "") {
    const n = Number(variant.gst_percent);
    if (Number.isFinite(n) && n >= 0) return Math.min(28, n);
  }
  const p = Number(product?.gst_percent ?? 0);
  return Number.isFinite(p) && p >= 0 ? Math.min(28, p) : 0;
}

export function variantCostPrice(variant, product) {
  if (variant?.cost_price != null && variant.cost_price !== "") {
    const n = Number(variant.cost_price);
    if (Number.isFinite(n) && n >= 0) return n;
    return null;
  }
  const pc = product?.cost_price != null && product.cost_price !== "" ? Number(product.cost_price) : null;
  if (pc != null && Number.isFinite(pc) && pc >= 0) return pc;
  return null;
}

/** POS / product-level cap; null means unset. */
export function variantMaxDiscountPercent(variant, product) {
  if (variant?.max_discount_percent != null && variant.max_discount_percent !== "") {
    const n = Number(variant.max_discount_percent);
    if (Number.isFinite(n) && n >= 0) return Math.min(100, n);
    return null;
  }
  const pm = product?.max_discount_percent;
  if (pm != null && pm !== "") {
    const n = Number(pm);
    if (Number.isFinite(n) && n >= 0) return Math.min(100, n);
  }
  return null;
}

export function unitPriceForLabel(product, variantRow) {
  if (variantRow && String(variantRow.variant_name ?? "").trim()) {
    return variantEffectiveSelling(variantRow, product);
  }
  const base = Number(product?.price ?? 0);
  const sale = product?.sale_price != null && product.sale_price !== "" ? Number(product.sale_price) : null;
  if (sale != null && Number.isFinite(sale) && sale > 0 && sale < base) return sale;
  return base;
}

function parseGstPercentAgg(v) {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(28, n);
}

function parseOptionalDiscountPctAgg(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(100, n);
}

/**
 * Keeps denormalized `products.price` / `sale_price` (etc.) aligned with embedded variants for listings/sort.
 * `variants` should be the full embedded array (named rows carry pricing).
 */
export function syncProductAggregatePricing(variants, legacyProduct = {}) {
  const named = (variants || []).filter((v) => String(v?.variant_name ?? "").trim());

  const legacyPrice = Number(legacyProduct.price ?? 0);
  const legacySaleRaw =
    legacyProduct.sale_price != null && legacyProduct.sale_price !== ""
      ? Number(legacyProduct.sale_price)
      : null;
  const legacySale =
    legacySaleRaw != null && Number.isFinite(legacySaleRaw) && legacySaleRaw > 0 && legacySaleRaw < legacyPrice
      ? legacySaleRaw
      : null;

  if (named.length === 0) {
    return {
      price: Number.isFinite(legacyPrice) && legacyPrice >= 0 ? legacyPrice : 0,
      sale_price: legacySale,
      gst_percent: parseGstPercentAgg(legacyProduct.gst_percent),
      max_discount_percent: parseOptionalDiscountPctAgg(legacyProduct.max_discount_percent),
      cost_price:
        legacyProduct.cost_price != null && legacyProduct.cost_price !== ""
          ? Number(legacyProduct.cost_price)
          : null,
    };
  }

  if (named.length === 1) {
    const v = named[0];
    const mrp = variantMrp(v, legacyProduct);
    const sale = variantSalePrice(v, legacyProduct);
    return {
      price: mrp,
      sale_price: sale,
      gst_percent: variantGstPercent(v, legacyProduct),
      max_discount_percent: variantMaxDiscountPercent(v, legacyProduct),
      cost_price: variantCostPrice(v, legacyProduct),
    };
  }

  const sellings = named.map((v) => variantEffectiveSelling(v, legacyProduct));
  const minSell = Math.min(...sellings);
  const first = named[0];
  return {
    price: minSell,
    sale_price: null,
    gst_percent: variantGstPercent(first, legacyProduct),
    max_discount_percent: variantMaxDiscountPercent(first, legacyProduct),
    cost_price: null,
  };
}
