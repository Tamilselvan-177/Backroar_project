/** Cart totals for POS checkout. */
export function computePosCartTotals(cart, serviceCharge) {
  let subtotal = 0;
  let discountTotal = 0;
  let gstTotal = 0;
  for (const item of Object.values(cart || {})) {
    const basePrice = Number(item.price) || 0;
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const dp = Number(item.discount_percent) || 0;
    const effectiveUnit =
      item.effective_price > 0 ? Number(item.effective_price) : basePrice * (1 - dp / 100);
    const lineSub = basePrice * qty;
    const lineAfterDisc = effectiveUnit * qty;
    const disc = lineSub - lineAfterDisc;
    const gst = lineAfterDisc * ((Number(item.gst_percent) || 0) / 100);
    subtotal += lineSub;
    discountTotal += disc;
    gstTotal += gst;
  }
  const svc = Math.max(0, round2(serviceCharge));
  const grand = subtotal - discountTotal + gstTotal + svc;
  return { subtotal, discountTotal, gstTotal, serviceCharge: svc, grand };
}

export function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function changeBreakdown(change) {
  const denoms = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
  const breakdown = {};
  let rem = Math.floor(change + 0.00001);
  for (const d of denoms) {
    const cnt = Math.floor(rem / d);
    if (cnt > 0) {
      breakdown[String(d)] = cnt;
      rem -= cnt * d;
    } else {
      breakdown[String(d)] = 0;
    }
  }
  const paise = Math.max(0, round2(change - Math.floor(change)));
  return { denoms: breakdown, remainder: paise };
}
