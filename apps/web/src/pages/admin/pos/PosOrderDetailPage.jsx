import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiJson } from "../../../api/client.js";

function fmtMoney(n) {
  return `₹${Number(n || 0).toFixed(2)}`;
}

function fmtWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

export default function PosOrderDetailPage() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    apiJson(`/api/admin/pos/orders/${id}`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setErr(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return <div className="py-12 text-center text-gray-600">Loading bill…</div>;
  }
  if (err || !data?.order) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">{err || "Order not found."}</p>
        <Link to="/admin/pos/orders" className="text-[var(--brand-accent)] underline">
          ← POS orders
        </Link>
      </div>
    );
  }

  const { order, items, payments, returns_by_item: retMap, net } = data;
  const addr = [order.store_address, order.store_city, order.store_state, order.store_pincode]
    .filter(Boolean)
    .join(", ");
  const totalQty = items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
  const visiblePayments = (payments || []).filter((p) => Number(p.amount) > 0);
  const hasReturns = Number(net?.refund_total) > 0 || Number(net?.gst_return) > 0;

  return (
    <div className="pos-bill-shell mx-auto max-w-3xl space-y-6 print:max-w-none">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .admin-shell > aside { display: none !important; }
          .admin-workspace-banner { display: none !important; }
          .admin-content {
            padding: 0 !important;
            overflow: visible !important;
          }
          .pos-bill-shell {
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 auto !important;
          }
          .pos-bill-card {
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
          }
          .pos-bill-table th,
          .pos-bill-table td {
            padding-left: 0 !important;
            padding-right: 0 !important;
            font-size: 11px !important;
          }
          .pos-bill-meta,
          .pos-bill-payments,
          .pos-bill-summary {
            font-size: 11px !important;
          }
        }
      `}</style>

      <div className="no-print flex flex-wrap justify-between gap-3">
        <Link to="/admin/pos/orders" className="text-sm text-[var(--brand-accent)] underline">
          ← POS orders
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          Print bill
        </button>
      </div>

      <div className="pos-bill-card space-y-4 rounded-xl border border-gray-200 bg-white p-6 print:border-0 print:shadow-none">
        <header className="border-b border-dashed border-gray-300 pb-4 text-center">
          {order.store_name ? (
            <div className="text-sm text-gray-800">
              <div className="text-lg font-black tracking-wide text-gray-900">{order.store_name}</div>
              {addr ? <div className="mt-1 text-xs leading-relaxed text-gray-600">{addr}</div> : null}
              {order.store_gstin ? <div className="mt-1 text-[11px] text-gray-600">GSTIN: {order.store_gstin}</div> : null}
            </div>
          ) : null}
          <div className="mt-4 space-y-1">
            <h1 className="text-xl font-black tracking-wide text-gray-900">{order.order_number}</h1>
            <p className="text-xs text-gray-600">{fmtWhen(order.created_at)}</p>
          </div>
        </header>

        <section className="pos-bill-meta grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <span className="text-gray-500">Customer:</span> {order.customer_name || "Walk-in customer"}
          </div>
          <div>
            <span className="text-gray-500">Phone:</span> {order.customer_phone || "—"}
          </div>
          <div>
            <span className="text-gray-500">Financial year:</span> {order.financial_year || "—"}
          </div>
          <div>
            <span className="text-gray-500">Sale type:</span> {order.sale_type || "Shop"}
          </div>
          <div>
            <span className="text-gray-500">Items:</span> {totalQty}
          </div>
          <div>
            <span className="text-gray-500">Order id:</span> {order.id}
          </div>
        </section>

        <table className="pos-bill-table w-full border-b border-t border-dashed border-gray-300 text-sm">
          <thead className="bg-gray-50/60">
            <tr>
              <th className="py-2 text-left">Item</th>
              <th className="py-2 text-right">Rate</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const r = retMap?.[it.id];
              return (
                <tr key={it.id} className="align-top border-t border-dashed border-gray-200">
                  <td className="py-2 pr-2">
                    <div className="font-medium text-gray-900">{it.product_name}</div>
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      GST {Number(it.gst_percent || 0).toFixed(0)}%
                      {Number(it.discount_percent) > 0 ? ` · Disc ${Number(it.discount_percent).toFixed(0)}%` : ""}
                      {r ? ` · Returned ${r.qty}` : ""}
                    </div>
                    {r ? <div className="text-[11px] text-amber-700">Refund {fmtMoney(r.refund)}</div> : null}
                  </td>
                  <td className="py-2 text-right">{fmtMoney(it.price)}</td>
                  <td className="py-2 text-right">{it.quantity}</td>
                  <td className="py-2 text-right font-medium">{fmtMoney(it.line_total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="pos-bill-summary ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Subtotal</span>
            <span>{fmtMoney(order.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Discount</span>
            <span>-{fmtMoney(order.discount_total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">GST</span>
            <span>{fmtMoney(order.gst_total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Service</span>
            <span>{fmtMoney(order.service_charge)}</span>
          </div>
          <div className="flex justify-between border-t border-dashed border-gray-300 pt-2 text-base font-bold">
            <span>Grand Total</span>
            <span>{fmtMoney(order.grand_total)}</span>
          </div>
          {hasReturns ? (
            <>
              <div className="flex justify-between pt-2 text-amber-800">
                <span>Refunds</span>
                <span>-{fmtMoney(net.refund_total)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-600">
                <span>Net after returns</span>
                <span>{fmtMoney(net.grand_total)}</span>
              </div>
            </>
          ) : null}
        </div>

        {visiblePayments.length > 0 ? (
          <section className="pos-bill-payments border-t border-dashed border-gray-300 pt-3">
            <h2 className="mb-2 text-sm font-bold text-gray-900">Payments</h2>
            <ul className="space-y-1 text-sm">
              {visiblePayments.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>{p.method}</span>
                  <span>{fmtMoney(p.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="border-t border-dashed border-gray-300 pt-3 text-sm text-gray-600">
          <div className="flex justify-between">
            <span>Tendered</span>
            <span>{fmtMoney(order.tendered_amount)}</span>
          </div>
          <div className="flex justify-between">
            <span>Change</span>
            <span>{fmtMoney(order.change_amount)}</span>
          </div>
          <div className="mt-3 border-t border-dashed border-gray-200 pt-3 text-center text-xs text-gray-500">
            <div>Thank you for shopping with us.</div>
            <div className="mt-1">Please keep this bill for exchange or return reference.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
