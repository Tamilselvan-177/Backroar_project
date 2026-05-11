/** Cart totals helper (shipping 0; free-shipping threshold 999 for UI). */
export function computeCartTotals(items) {
  let subtotal = 0;
  let total_items = 0;
  for (const it of items) {
    const unit = Number(it.sale_price ?? it.price ?? 0);
    const q = Number(it.quantity ?? 0);
    subtotal += unit * q;
    total_items += q;
  }
  const shipping = 0;
  return {
    subtotal,
    total_items,
    shipping,
    total: subtotal + shipping,
  };
}
