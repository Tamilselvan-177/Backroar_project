import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiJson } from "../../api/client.js";
import { productImageUrl } from "../../lib/images.js";

const ORDER_OPTIONS = ["Pending", "Confirmed", "Processing", "Shipped", "Delivered", "Cancelled"];
const PAYMENT_OPTIONS = ["Pending", "Paid", "Failed", "Refunded"];

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
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
    Pending: "bg-gray-100 text-gray-800",
    Confirmed: "bg-blue-100 text-blue-800",
    Processing: "bg-indigo-100 text-indigo-800",
    Shipped: "bg-sky-100 text-sky-800",
    Delivered: "bg-green-100 text-green-800",
    Cancelled: "bg-red-100 text-red-800",
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles[s] || "bg-gray-100 text-gray-800"}`}>
      {s}
    </span>
  );
}

function PaymentPill({ status }) {
  const s = normLabel(status);
  const styles = {
    Paid: "bg-green-100 text-green-800",
    Failed: "bg-red-100 text-red-800",
    Pending: "bg-amber-100 text-amber-900",
    Refunded: "bg-gray-100 text-gray-800",
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles[s] || "bg-amber-100 text-amber-900"}`}>
      Payment: {s}
    </span>
  );
}

const shellGrad =
  "bg-[radial-gradient(circle_at_top,_#f9fafb_0%,_#e5e7eb_40%,_#f3f4f6_100%)] min-h-[calc(100vh-6rem)]";

const adminCard =
  "rounded-[1.1rem] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)] border border-slate-300/60 overflow-hidden";

export default function AdminOrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [err, setErr] = useState(null);
  const [orderStatus, setOrderStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(null);

  useEffect(() => {
    if (!id) return;
    apiJson(`/api/admin/orders/${encodeURIComponent(id)}`)
      .then((d) => {
        setOrder(d.order);
        setOrderStatus(d.order?.order_status ?? "");
        setPaymentStatus(d.order?.payment_status ?? "");
      })
      .catch((e) => setErr(e.body?.error || e.message));
  }, [id]);

  async function save(e) {
    e.preventDefault();
    setSaveErr(null);
    setSaving(true);
    try {
      const body = {};
      if (orderStatus !== order.order_status) body.order_status = orderStatus;
      if (paymentStatus !== order.payment_status) body.payment_status = paymentStatus;
      if (Object.keys(body).length === 0) {
        setSaveErr("No changes to save.");
        return;
      }
      const r = await apiJson(`/api/admin/orders/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setOrder(r.order);
      setOrderStatus(r.order?.order_status ?? "");
      setPaymentStatus(r.order?.payment_status ?? "");
    } catch (e) {
      setSaveErr(e.body?.message || e.body?.error || e.message);
    } finally {
      setSaving(false);
    }
  }

  if (err === "not_found") {
    return (
      <div className={`${shellGrad} -mx-4 px-4 py-8 md:-mx-8 md:px-8`}>
        <p className="text-red-600 mb-4">Order not found.</p>
        <Link to="/admin/orders" className="text-blue-600 font-semibold hover:underline">
          ← Orders
        </Link>
      </div>
    );
  }

  if (err) {
    return (
      <div className={`${shellGrad} -mx-4 px-4 py-8 md:-mx-8 md:px-8`}>
        <p className="text-red-600">{err}</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className={`${shellGrad} -mx-4 px-4 py-8 md:-mx-8 md:px-8`}>
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  const items = order.items ?? [];
  const u = order.user;

  return (
    <div className={`${shellGrad} -mx-4 px-4 py-8 md:-mx-8 md:px-8 print:bg-white`}>
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex flex-wrap justify-between items-start gap-4 print:hidden">
          <div>
            <p className="text-[0.7rem] uppercase tracking-[0.18em] text-gray-500 mb-1">Admin / Orders / Details</p>
            <h1 className="text-xl md:text-2xl font-black tracking-[0.14em] uppercase text-gray-900">
              Order #{order.order_number}
            </h1>
            <p className="text-xs text-gray-500 mt-2">{fmtDate(order.created_at)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/admin/returns?bill=${encodeURIComponent(order.order_number ?? "")}`}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 shadow-sm"
            >
              Process return
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-sm"
            >
              Print / PDF
            </button>
          </div>
        </header>

        <div className={adminCard}>
          <div className="px-5 py-4 border-b border-slate-200 bg-white">
            <p className="text-[0.7rem] uppercase tracking-[0.14em] text-gray-500 mb-2">Order status</p>
            <div className="flex flex-wrap gap-2">
              <OrderStatusPill status={order.order_status} />
              <PaymentPill status={order.payment_status} />
            </div>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5 bg-slate-50/80">
            <div className="rounded-xl p-4 bg-gray-50 border border-slate-200">
              <div className="text-[0.75rem] uppercase tracking-[0.1em] text-gray-500 font-semibold mb-3">
                Customer information
              </div>
              {u ? (
                <div className="space-y-2 text-sm text-gray-800">
                  <p>
                    <strong>Name:</strong> {u.name}
                  </p>
                  <p>
                    <strong>Email:</strong> {u.email}
                  </p>
                  <p>
                    <strong>User id:</strong> {u.id}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-600">User id {order.user_id} (profile not loaded)</p>
              )}
            </div>
            <div className="rounded-xl p-4 bg-gray-50 border border-slate-200">
              <div className="text-[0.75rem] uppercase tracking-[0.1em] text-gray-500 font-semibold mb-3">
                Delivery address
              </div>
              <div className="bg-white p-4 rounded-lg border-l-[3px] border-l-blue-500 shadow-sm">
                <p className="font-semibold text-gray-900">{order.shipping_name}</p>
                <p className="text-sm text-gray-700 mt-2 leading-relaxed">
                  {order.shipping_address}
                  <br />
                  {order.shipping_city}, {order.shipping_state}
                  <br />
                  <strong>PIN: {order.shipping_pincode}</strong>
                  <br />
                  <strong>{order.shipping_phone}</strong>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className={adminCard}>
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-gray-900">Order items</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 border-b border-slate-200">
                <tr className="text-left text-gray-700">
                  <th className="p-3 font-semibold">Product</th>
                  <th className="p-3 font-semibold">Variant</th>
                  <th className="p-3 font-semibold text-center">Qty</th>
                  <th className="p-3 font-semibold">Price</th>
                  <th className="p-3 font-semibold">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {items.map((line, idx) => {
                  const img =
                    productImageUrl(line.variant_image_path) || productImageUrl(line.image_path);
                  const variantLabel =
                    line.variant_name != null && String(line.variant_name).trim()
                      ? String(line.variant_name).trim()
                      : line.variant_id != null
                        ? `#${line.variant_id}`
                        : "—";
                  return (
                    <tr key={idx} className="border-t border-slate-100 bg-white">
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="w-[52px] h-[52px] rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                            {img ? (
                              <img src={img} alt="" className="w-full h-full object-contain" />
                            ) : (
                              <span className="text-lg">📦</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900">
                              {line.product_name}
                              {line.variant_name ? (
                                <span className="text-gray-500 font-normal">
                                  {" "}
                                  ({line.variant_name})
                                </span>
                              ) : null}
                            </div>
                            <div className="text-[11px] text-gray-500">Product #{line.product_id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-gray-600">{variantLabel}</td>
                      <td className="p-3 text-center">{line.quantity}</td>
                      <td className="p-3">₹{Number(line.price ?? 0).toFixed(2)}</td>
                      <td className="p-3 font-semibold">₹{Number(line.subtotal ?? 0).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-4 bg-gray-50 border-t border-slate-200 flex justify-end">
            <div className="w-full max-w-sm space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>₹{Number(order.subtotal ?? 0).toFixed(2)}</span>
              </div>
              {Number(order.discount_amount) > 0 ? (
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>Discount{order.coupon_code ? ` (${order.coupon_code})` : ""}</span>
                  <span>−₹{Number(order.discount_amount).toFixed(2)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-gray-600">
                <span>Shipping</span>
                <span>₹{Number(order.shipping_charge ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t-2 border-slate-300 text-base font-bold text-gray-900">
                <span>Total</span>
                <span className="text-blue-600">₹{Number(order.total_amount ?? 0).toFixed(2)}</span>
              </div>
              <p className="text-xs text-gray-500 pt-1">
                <strong>Payment method:</strong> {order.payment_method}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={save} className={`${adminCard} print:hidden`}>
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-gray-900">Update delivery & payment status</h2>
          </div>
          <div className="p-5 flex flex-wrap gap-4 items-end">
            {saveErr ? <p className="text-red-600 text-sm w-full">{saveErr}</p> : null}
            <label className="flex flex-col text-xs font-semibold text-gray-600 min-w-[180px]">
              Order status
              <select
                className="border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm font-normal bg-white"
                value={orderStatus}
                onChange={(e) => setOrderStatus(e.target.value)}
              >
                {[...new Set([order.order_status, ...ORDER_OPTIONS].filter(Boolean))].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs font-semibold text-gray-600 min-w-[180px]">
              Payment status
              <select
                className="border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm font-normal bg-white"
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
              >
                {[...new Set([order.payment_status, ...PAYMENT_OPTIONS].filter(Boolean))].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
            >
              {saving ? "Saving…" : "Update status"}
            </button>
          </div>
        </form>

        <div className="print:hidden pt-2">
          <Link to="/admin/orders" className="text-blue-600 font-medium hover:underline text-sm">
            ← Back to orders
          </Link>
        </div>
      </div>
    </div>
  );
}
