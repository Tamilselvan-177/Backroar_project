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

  return (
    <div className="max-w-3xl mx-auto space-y-6 print:max-w-none">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <div className="no-print flex flex-wrap justify-between gap-3">
        <Link to="/admin/pos/orders" className="text-sm text-[var(--brand-accent)] underline">
          ← POS orders
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="text-sm px-4 py-2 rounded-lg bg-gray-900 text-white font-medium"
        >
          Print
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4 print:border-0 print:shadow-none">
        <header className="border-b border-gray-200 pb-4">
          <h1 className="text-2xl font-black">{order.order_number}</h1>
          <p className="text-sm text-gray-600">{fmtWhen(order.created_at)}</p>
          {order.store_name && (
            <div className="mt-3 text-sm text-gray-800">
              <div className="font-semibold">{order.store_name}</div>
              {addr && <div>{addr}</div>}
              {order.store_gstin && <div className="text-xs text-gray-600">GSTIN: {order.store_gstin}</div>}
            </div>
          )}
        </header>

        <section className="text-sm grid sm:grid-cols-2 gap-2">
          <div>
            <span className="text-gray-500">Customer:</span> {order.customer_name || "—"}
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
        </section>

        <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2">Item</th>
              <th className="text-right p-2">Price</th>
              <th className="text-right p-2">Qty</th>
              <th className="text-right p-2">Line</th>
              <th className="text-right p-2 print:hidden">Return</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const r = retMap?.[it.id];
              return (
                <tr key={it.id} className="border-t border-gray-100">
                  <td className="p-2">{it.product_name}</td>
                  <td className="p-2 text-right">{fmtMoney(it.price)}</td>
                  <td className="p-2 text-right">{it.quantity}</td>
                  <td className="p-2 text-right">{fmtMoney(it.line_total)}</td>
                  <td className="p-2 text-right text-xs text-gray-600 print:hidden">
                    {r ? `${r.qty} qty · ${fmtMoney(r.refund)}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="space-y-1 text-sm max-w-xs ml-auto">
          <div className="flex justify-between">
            <span className="text-gray-600">Subtotal</span>
            <span>{fmtMoney(order.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Discount</span>
            <span>−{fmtMoney(order.discount_total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">GST</span>
            <span>{fmtMoney(order.gst_total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Service</span>
            <span>{fmtMoney(order.service_charge)}</span>
          </div>
          <div className="flex justify-between font-bold border-t border-gray-200 pt-2">
            <span>Grand</span>
            <span>{fmtMoney(order.grand_total)}</span>
          </div>
          {(net?.refund_total > 0 || net?.gst_return > 0) && (
            <>
              <div className="flex justify-between text-amber-800 pt-2">
                <span>Refunds</span>
                <span>−{fmtMoney(net.refund_total)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-600">
                <span>Net after returns</span>
                <span>{fmtMoney(net.grand_total)}</span>
              </div>
            </>
          )}
        </div>

        {payments?.length > 0 && (
          <section>
            <h2 className="font-bold text-gray-900 mb-2">Payments</h2>
            <ul className="text-sm space-y-1">
              {payments.map((p) => (
                <li key={p.id} className="flex justify-between border-b border-gray-100 py-1">
                  <span>{p.method}</span>
                  <span>{fmtMoney(p.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="text-sm text-gray-600 border-t border-gray-100 pt-3">
          <div className="flex justify-between">
            <span>Tendered</span>
            <span>{fmtMoney(order.tendered_amount)}</span>
          </div>
          <div className="flex justify-between">
            <span>Change</span>
            <span>{fmtMoney(order.change_amount)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
