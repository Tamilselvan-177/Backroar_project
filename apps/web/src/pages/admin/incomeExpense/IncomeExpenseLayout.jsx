import { NavLink, Outlet } from "react-router-dom";

const linkCls = ({ isActive }) =>
  `rounded-xl px-4 py-2 text-sm font-semibold transition ${
    isActive ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
  }`;

export default function IncomeExpenseLayout() {
  return (
    <div className="max-w-6xl space-y-6">
      <div className="rounded-[1.6rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_55%,#eef2ff_100%)] p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
        <div className="max-w-3xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Operations / Finance</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Income & expense</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Track store spending, review daily and monthly profit, and audit real operating entries instead of relying on
            placeholder summaries.
          </p>
        </div>
      </div>
      <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
        <NavLink to="/admin/income-expense" end className={linkCls}>
          Overview
        </NavLink>
        <NavLink to="/admin/income-expense/expense-entry" className={linkCls}>
          Add expense
        </NavLink>
        <NavLink to="/admin/income-expense/expenses" className={linkCls}>
          Expenses
        </NavLink>
        <NavLink to="/admin/income-expense/income" className={linkCls}>
          Income
        </NavLink>
        <NavLink to="/admin/income-expense/reports" className={linkCls}>
          Reports
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
