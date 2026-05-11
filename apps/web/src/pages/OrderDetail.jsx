import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiJson, bootstrapCsrf } from "../api/client.js";
import { useDeleteConfirm } from "../context/DeleteConfirmContext.jsx";
import { productImageUrl } from "../lib/images.js";

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return String(iso);
  }
}

const STEP_STATUSES = ["Pending", "Confirmed", "Processing", "Shipped", "Delivered"];

function normLabel(s) {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function orderStatusIndex(orderStatus) {
  const n = normLabel(orderStatus);
  const i = STEP_STATUSES.indexOf(n);
  return i >= 0 ? i : 0;
}

function OrderStatusBadge({ status }) {
  const s = normLabel(status);
  const map = {
    Pending: "bg-yellow-100 text-yellow-800",
    Confirmed: "bg-blue-100 text-blue-800",
    Processing: "bg-purple-100 text-purple-800",
    Shipped: "bg-indigo-100 text-indigo-800",
    Delivered: "bg-green-100 text-green-800",
    Cancelled: "bg-red-100 text-red-800",
  };
  const cls = map[s] || "bg-gray-100 text-gray-800";
  return <span className={`px-4 py-2 rounded-full font-semibold text-sm ${cls}`}>{s || "—"}</span>;
}

function PaymentStatusBadge({ status }) {
  const s = normLabel(status);
  const map = {
    Pending: "bg-yellow-100 text-yellow-800",
    Paid: "bg-green-100 text-green-800",
    Failed: "bg-red-100 text-red-800",
    Refunded: "bg-gray-100 text-gray-800",
  };
  const cls = map[s] || "bg-gray-100 text-gray-800";
  return <span className={`px-3 py-1 rounded-full text-sm font-semibold ${cls}`}>{s || "—"}</span>;
}

export default function OrderDetail() {
  const askDelete = useDeleteConfirm();
  const { orderNumber } = useParams();
  const [order, setOrder] = useState(null);
  const [err, setErr] = useState(null);
  const [cancelErr, setCancelErr] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!orderNumber) return;
    apiJson(`/api/order/${encodeURIComponent(orderNumber)}`)
      .then((d) => setOrder(d.order))
      .catch((e) => setErr(e.body?.error || e.message));
  }, [orderNumber]);

  const canCancel =
    order &&
    ["pending", "confirmed"].includes(String(order.order_status ?? "").trim().toLowerCase());

  async function cancelOrder() {
    if (!order?.id || !canCancel) return;
    const label = order.order_number ?? order.id;
    const ok = await askDelete({
      title: "Cancel this order?",
      description: `Cancel order #${label}. This is only possible while the order is still pending or confirmed.`,
      confirmLabel: "Cancel order",
    });
    if (!ok) return;
    setCancelErr(null);
    setCancelling(true);
    try {
      await bootstrapCsrf();
      const r = await apiJson("/api/order/cancel", {
        method: "POST",
        body: JSON.stringify({ order_id: order.id }),
      });
      setOrder(r.order);
    } catch (e) {
      setCancelErr(e.body?.error || e.message);
    } finally {
      setCancelling(false);
    }
  }

  if (err === "auth_required") {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center px-4 py-16">
        <p className="mb-4 text-[var(--brand-text)]">Please log in to view this order.</p>
        <Link to="/login" className="text-[var(--brand-primary)] font-bold underline">
          Login
        </Link>
      </div>
    );
  }
  if (err) {
    return (
      <section className="py-10 bg-neutral-50 min-h-[60vh]">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-2xl font-bold mb-4 text-[var(--brand-heading)]">Order</h1>
          <p className="text-red-600 mb-6">{err === "order_not_found" ? "Order not found." : err}</p>
          <Link to="/orders" className="text-[var(--brand-primary)] font-semibold hover:underline">
            ← Back to Orders
          </Link>
        </div>
      </section>
    );
  }
  if (!order) {
    return (
      <div className="py-16 text-center text-gray-500">
        <p>Loading…</p>
      </div>
    );
  }

  const items = order.items ?? [];
  const currentIdx = orderStatusIndex(order.order_status);
  const isCancelled = normLabel(order.order_status) === "Cancelled";
  const ship = Number(order.shipping_charge ?? 0);

  return (
    <section className="py-10 bg-neutral-50 min-h-[calc(100vh-4rem)]">
      <div className="container mx-auto px-4 max-w-4xl">
        <Link
          to="/orders"
          className="inline-flex items-center text-[var(--brand-primary)] hover:opacity-90 mb-6 font-semibold"
        >
          <svg className="w-5 h-5 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Orders
        </Link>

        <h1 className="text-3xl font-bold mb-6 text-[var(--brand-heading)]">Order Details</h1>

        <div className="bg-white rounded-lg shadow-md border border-black/5 p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-[var(--brand-text)] mb-2">
                Order #{order.order_number}
              </h2>
              <p className="text-sm text-gray-500">Placed on {fmtDate(order.created_at)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <OrderStatusBadge status={order.order_status} />
              <PaymentStatusBadge status={order.payment_status} />
              {order.coupon_code ? (
                <span className="px-4 py-2 bg-purple-100 text-purple-800 rounded-full text-sm font-semibold">
                  Coupon: {order.coupon_code}
                </span>
              ) : null}
            </div>
          </div>

          {!isCancelled ? (
            <div className="relative mb-10 px-1">
              <div className="flex justify-between items-start gap-1">
                {STEP_STATUSES.map((label, i) => (
                  <div key={label} className="flex flex-col items-center flex-1 relative min-w-0">
                    <div
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center mb-2 z-10 text-sm font-bold shrink-0 ${
                        i <= currentIdx ? "bg-[var(--brand-primary)] text-white" : "bg-gray-200 text-gray-500"
                      }`}
                    >
                      {i < currentIdx ? (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ) : (
                        i + 1
                      )}
                    </div>
                    <p
                      className={`text-[10px] sm:text-xs font-semibold text-center leading-tight px-0.5 ${
                        i <= currentIdx ? "text-[var(--brand-primary)]" : "text-gray-500"
                      }`}
                    >
                      {label}
                    </p>
                    {i < STEP_STATUSES.length - 1 ? (
                      <div
                        className={`hidden sm:block absolute top-[18px] left-[calc(50%+18px)] w-[calc(100%-36px)] h-0.5 ${
                          i < currentIdx ? "bg-[var(--brand-primary)]" : "bg-gray-200"
                        }`}
                        aria-hidden
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <h3 className="font-bold text-lg mb-4 text-[var(--brand-text)]">Order Items</h3>
          <div className="space-y-4 mb-6">
            {items.map((line, idx) => {
              const img =
                productImageUrl(line.variant_image_path) || productImageUrl(line.image_path);
              const slug = line.product_slug;
              const variantLabel = line.variant_name ? ` (${line.variant_name})` : "";
              const title = (
                <>
                  {line.product_name}
                  {variantLabel ? <span className="text-gray-500 font-normal">{variantLabel}</span> : null}
                </>
              );
              return (
                <div
                  key={idx}
                  className="flex gap-4 pb-4 border-b border-[var(--card-border)] last:border-b-0 last:pb-0"
                >
                  <div className="w-20 h-20 bg-[var(--card-bg-alt)] rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                    {img ? (
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl" aria-hidden>
                        📦
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {slug ? (
                      <Link
                        to={`/product/${encodeURIComponent(slug)}`}
                        className="font-semibold text-[var(--brand-text)] hover:text-[var(--brand-primary)] block mb-1"
                      >
                        {title}
                      </Link>
                    ) : (
                      <p className="font-semibold text-[var(--brand-text)] mb-1">{title}</p>
                    )}
                    <p className="text-sm text-gray-600">Quantity: {line.quantity}</p>
                    <p className="text-sm text-gray-600">
                      Price: ₹{Number(line.price ?? 0).toFixed(2)} each
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-lg text-[var(--brand-text)]">
                      ₹{Number(line.subtotal ?? 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-[var(--card-bg-alt)] rounded-lg p-4 space-y-2 border border-black/[0.06]">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span className="font-semibold">₹{Number(order.subtotal ?? 0).toFixed(2)}</span>
            </div>
            {Number(order.discount_amount) > 0 ? (
              <div className="flex justify-between text-green-600 font-semibold">
                <span>Discount{order.coupon_code ? ` (${order.coupon_code})` : ""}</span>
                <span>−₹{Number(order.discount_amount).toFixed(2)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-gray-600">
              <span>Shipping Charge</span>
              {ship === 0 ? (
                <span className="font-semibold text-green-600">FREE</span>
              ) : (
                <span className="font-semibold">₹{ship.toFixed(2)}</span>
              )}
            </div>
            <div className="border-t border-[var(--card-border)] pt-2">
              <div className="flex justify-between text-lg font-bold text-[var(--brand-text)]">
                <span>Total Amount</span>
                <span>₹{Number(order.total_amount ?? 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-md border border-black/5 p-6">
            <h3 className="font-bold text-lg mb-4 text-[var(--brand-text)]">Delivery Address</h3>
            <div className="space-y-1 text-gray-700">
              <p className="font-semibold">{order.shipping_name}</p>
              <p className="text-sm">{order.shipping_address}</p>
              <p className="text-sm">
                {order.shipping_city}, {order.shipping_state} — {order.shipping_pincode}
              </p>
              <p className="text-sm">Phone: {order.shipping_phone}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md border border-black/5 p-6">
            <h3 className="font-bold text-lg mb-4 text-[var(--brand-text)]">Payment Information</h3>
            <div className="space-y-3">
              <div className="flex justify-between gap-4">
                <span className="text-gray-600">Payment Method</span>
                <span className="font-semibold text-right">{order.payment_method}</span>
              </div>
              <div className="flex justify-between gap-4 items-center">
                <span className="text-gray-600">Payment Status</span>
                <PaymentStatusBadge status={order.payment_status} />
              </div>
            </div>
            {cancelErr ? <p className="text-red-600 text-sm mt-4">{cancelErr}</p> : null}
          </div>
        </div>

        {canCancel ? (
          <div className="mt-6">
            <button
              type="button"
              disabled={cancelling}
              onClick={cancelOrder}
              className="px-6 py-3 border-2 border-red-600 text-red-600 rounded-lg font-bold hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {cancelling ? "Cancelling…" : "Cancel Order"}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
