import { NavLink, Outlet } from "react-router-dom";

const linkCls = ({ isActive }) =>
  `px-3 py-1.5 rounded-lg text-sm font-semibold ${isActive ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`;

export default function IncomeExpenseLayout() {
  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-black">Income & expense</h1>
        <p className="text-gray-600 text-sm mt-1">Income and expense ledgers (API uses UTC dates).</p>
      </div>
      <nav className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
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
