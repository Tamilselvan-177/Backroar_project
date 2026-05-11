export function fmtMoney(n) {
  return `₹${(Number(n) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function fmtDateTime(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(value);
  }
}

export function fmtDateOnly(value) {
  if (!value) return "—";
  try {
    return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
      dateStyle: "medium",
    });
  } catch {
    return String(value);
  }
}

export const sectionCard =
  "rounded-2xl border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.08)]";

export const inputCls =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10";

export const labelCls = "text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500";

export function statTone(value) {
  if (Number(value) > 0) return "text-emerald-700";
  if (Number(value) < 0) return "text-red-700";
  return "text-slate-900";
}
