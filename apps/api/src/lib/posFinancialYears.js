/** Rolling financial-year window for POS date pickers. */
export function posFinancialYears() {
  const y = new Date().getFullYear();
  const pairs = [];
  for (let i = 0; i < 5; i++) {
    const start = y - i;
    const endShort = String(start + 1).slice(-2);
    pairs.push(`${start}-${endShort}`);
  }
  return pairs;
}
