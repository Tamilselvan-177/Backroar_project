import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiJson } from "../../api/client.js";

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return String(iso);
  }
}

function normLabel(s) {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function OrderStatusPill({ status }) {
  const s = normLabel(status);
  const styles = {
    Pending: "bg-gray-100 text-gray-700",
    Confirmed: "bg-blue-100 text-blue-800",
    Processing: "bg-indigo-100 text-indigo-700",
    Shipped: "bg-sky-100 text-sky-800",
    Delivered: "bg-green-100 text-green-700",
    Cancelled: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles[s] || "bg-gray-100 text-gray-700"}`}>
      {s || "—"}
    </span>
  );
}

function PaymentPill({ status }) {
  const s = normLabel(status);
  const styles = {
    Paid: "bg-green-100 text-green-700",
    Failed: "bg-red-100 text-red-700",
    Pending: "bg-yellow-100 text-yellow-700",
    Refunded: "bg-gray-100 text-gray-700",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles[s] || "bg-yellow-100 text-yellow-700"}`}>
      {s || "—"}
    </span>
  );
}

const ORDER_STATUSES = ["", "Pending", "Confirmed", "Processing", "Shipped", "Delivered", "Cancelled"];
const PAYMENT_STATUSES = ["", "Pending", "Paid", "Failed", "Refunded"];

const shellGrad =
  "bg-[radial-gradient(circle_at_top,_#f9fafb_0%,_#e5e7eb_40%,_#f3f4f6_100%)] min-h-[calc(100vh-6rem)]";

const adminCard =
  "rounded-[1.1rem] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)] border border-slate-300/60";

export default function AdminOrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const qs = searchParams.toString();

  useEffect(() => {
    apiJson(`/api/admin/orders${qs ? `?${qs}` : ""}`)
      .then(setData)
      .catch((e) => setErr(e.body?.error || e.message));
  }, [qs]);

  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  function clearFilters() {
    setSearchParams({});
  }

  if (err) {
    return (
      <div className={`${shellGrad} -mx-4 px-4 py-8 md:-mx-8 md:px-8`}>
        <p className="text-red-600">{err}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={`${shellGrad} -mx-4 px-4 py-8 md:-mx-8 md:px-8`}>
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  const rows = data.orders ?? [];

  return (
    <div className={`${shellGrad} -mx-4 px-4 py-8 md:-mx-8 md:px-8 print:bg-white`}>
      <div className="max-w-6xl mx-auto animate-[fadeUp_0.4s_ease-out] motion-reduce:animate-none">
        <style>{`
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        <header className="flex flex-wrap justify-between items-start gap-4 mb-6 print:hidden">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/admin"
              className="px-3 py-1.5 rounded-full border border-slate-300 text-[11px] font-semibold text-gray-600 hover:bg-white/80 bg-white/60"
            >
              ← Dashboard
            </Link>
            <div>
              <p className="text-[0.7rem] uppercase tracking-[0.18em] text-gray-500 mb-1">Admin / Orders</p>
              <h1 className="text-2xl md:text-3xl font-black tracking-[0.12em] uppercase text-gray-900">
                Orders
              </h1>
            </div>
          </div>
        </header>

        <p className="text-gray-600 text-sm mb-4 max-w-2xl print:hidden">
          Search by order number, customer name, phone, user id, or order id — Mongo-backed.
        </p>

        <div className={`${adminCard} p-4 mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 print:hidden`}>
          <input
            type="text"
            placeholder="Search order #, name, phone…"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full xl:col-span-2"
            defaultValue={searchParams.get("q") ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim();
              setSearchParams((prev) => {
                const n = new URLSearchParams(prev);
                if (v) n.set("q", v);
                else n.delete("q");
                n.delete("page");
                return n;
              });
            }}
          />
          <select
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
            value={searchParams.get("order_status") ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setSearchParams((prev) => {
                const n = new URLSearchParams(prev);
                if (v) n.set("order_status", v);
                else n.delete("order_status");
                n.delete("page");
                return n;
              });
            }}
          >
            {ORDER_STATUSES.map((s) => (
              <option key={s || "os-all"} value={s}>
                {s ? `Order: ${s}` : "All order statuses"}
              </option>
            ))}
          </select>
          <select
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
            value={searchParams.get("payment_status") ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setSearchParams((prev) => {
                const n = new URLSearchParams(prev);
                if (v) n.set("payment_status", v);
                else n.delete("payment_status");
                n.delete("page");
                return n;
              });
            }}
          >
            {PAYMENT_STATUSES.map((s) => (
              <option key={s || "ps-all"} value={s}>
                {s ? `Payment: ${s}` : "All payment statuses"}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
            value={searchParams.get("date_from") ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setSearchParams((prev) => {
                const n = new URLSearchParams(prev);
                if (v) n.set("date_from", v);
                else n.delete("date_from");
                n.delete("page");
                return n;
              });
            }}
          />
          <input
            type="date"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
            value={searchParams.get("date_to") ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setSearchParams((prev) => {
                const n = new URLSearchParams(prev);
                if (v) n.set("date_to", v);
                else n.delete("date_to");
                n.delete("page");
                return n;
              });
            }}
          />
          <div className="xl:col-span-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={clearFilters}
              className="px-4 py-2 rounded-full border border-gray-300 text-gray-700 text-xs font-semibold hover:bg-gray-50 bg-white"
            >
              Clear filters
            </button>
          </div>
        </div>

        <div className={`${adminCard} overflow-x-auto`}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 border-b border-slate-200">
                <th className="p-3 whitespace-nowrap">#</th>
                <th className="p-3 whitespace-nowrap">Order</th>
                <th className="p-3 whitespace-nowrap">Customer</th>
                <th className="p-3 whitespace-nowrap">User</th>
                <th className="p-3 whitespace-nowrap">Items</th>
                <th className="p-3 whitespace-nowrap">Total</th>
                <th className="p-3 whitespace-nowrap">Order</th>
                <th className="p-3 whitespace-nowrap">Payment</th>
                <th className="p-3 whitespace-nowrap">Created</th>
                <th className="p-3 whitespace-nowrap print:hidden">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-t border-slate-100 bg-white hover:bg-slate-50/80 transition-colors">
                  <td className="p-3 align-top text-xs font-mono text-gray-600">{o.id}</td>
                  <td className="p-3 align-top">
                    <Link
                      to={`/admin/orders/${o.id}`}
                      className="font-semibold text-gray-900 hover:text-blue-700 hover:underline text-sm"
                    >
                      {o.order_number}
                    </Link>
                    <div className="text-[11px] text-gray-500 mt-0.5">{fmtDate(o.created_at)}</div>
                  </td>
                  <td className="p-3 align-top">
                    <div className="font-medium text-gray-900">{o.shipping_name ?? "—"}</div>
                  </td>
                  <td className="p-3 align-top text-xs text-gray-700">
                    {o.user_email ? (
                      <>
                        #{o.user_id}
                        <div className="text-[11px] text-gray-500 break-all">{o.user_email}</div>
                      </>
                    ) : (
                      <>#{o.user_id}</>
                    )}
                  </td>
                  <td className="p-3 align-top">{o.item_count ?? 0}</td>
                  <td className="p-3 align-top font-semibold text-gray-900">
                    ₹{Number(o.total_amount ?? 0).toFixed(2)}
                  </td>
                  <td className="p-3 align-top">
                    <OrderStatusPill status={o.order_status} />
                  </td>
                  <td className="p-3 align-top">
                    <PaymentPill status={o.payment_status} />
                  </td>
                  <td className="p-3 align-top whitespace-nowrap text-gray-600 text-xs">{fmtDate(o.created_at)}</td>
                  <td className="p-3 align-top text-right print:hidden">
                    <Link
                      to={`/admin/orders/${o.id}`}
                      className="inline-flex px-3 py-1 rounded-full border border-slate-300 text-[11px] font-semibold hover:bg-gray-100"
                    >
                      View details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows.length === 0 ? (
          <p className="text-gray-500 mt-6 text-center py-8 bg-white/60 rounded-xl border border-dashed border-slate-300">
            No orders match your filters.
          </p>
        ) : null}

        {data.total_pages > 1 ? (
          <div className="flex gap-2 mt-6 flex-wrap justify-center print:hidden">
            {Array.from({ length: data.total_pages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  p === page ? "bg-gray-900 text-white border-gray-900" : "bg-white border-slate-300 hover:bg-slate-50"
                }`}
                onClick={() =>
                  setSearchParams((prev) => {
                    const n = new URLSearchParams(prev);
                    n.set("page", String(p));
                    return n;
                  })
                }
              >
                {p}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
