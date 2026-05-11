/** Align with API `apps/api/src/lib/productPricing.js` for storefront display. */

export function variantMrp(variant, product) {
  const vp = variant?.price != null && variant.price !== "" ? Number(variant.price) : NaN;
  if (Number.isFinite(vp) && vp >= 0) return vp;
  const pp = Number(product?.price ?? 0);
  return Number.isFinite(pp) && pp >= 0 ? pp : 0;
}

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

/** Listing grid: multiple named variants → show lowest payable price. */
export function listingPriceDisplay(product) {
  const vars = Array.isArray(product?.variants) ? product.variants : [];
  const named = vars.filter(
    (v) =>
      String(v?.variant_name ?? "").trim() &&
      v.is_active !== 0 &&
      v.is_active !== false
  );
  if (named.length <= 1) {
    const v = named[0] ?? {};
    const mrp = variantMrp(v, product);
    const sale = variantSalePrice(v, product);
    const hasSale = sale != null;
    return {
      mode: "single",
      mrp,
      sale,
      current: hasSale ? sale : mrp,
      showFromPrefix: false,
    };
  }
  const sellings = named.map((v) => variantEffectiveSelling(v, product));
  const minSell = Math.min(...sellings);
  const maxMrp = Math.max(...named.map((v) => variantMrp(v, product)));
  const showStrike = maxMrp > minSell;
  return {
    mode: "from",
    mrp: maxMrp,
    sale: null,
    current: minSell,
    showFromPrefix: true,
    showStrike,
    strikeMrp: showStrike ? maxMrp : null,
  };
}
