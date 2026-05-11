import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiJson } from "../api/client.js";

export default function CheckoutSuccess() {
  const { orderNumber } = useParams();
  const [order, setOrder] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!orderNumber) return;
    apiJson(`/api/order/${encodeURIComponent(orderNumber)}`)
      .then((d) => setOrder(d.order))
      .catch((e) => setErr(e.body?.error || e.message));
  }, [orderNumber]);

  if (err === "auth_required") {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="mb-4">Please log in to view this order.</p>
        <Link to="/login" className="text-[var(--brand-accent)] font-bold underline">
          Login
        </Link>
      </div>
    );
  }
  if (err) {
    return (
      <div className="container mx-auto px-4 py-16 text-center max-w-lg">
        <h1 className="text-2xl font-black mb-4">Order</h1>
        <p className="text-red-600 mb-6">{err === "order_not_found" ? "We could not find that order." : err}</p>
        <Link to="/orders" className="text-[var(--brand-accent)] underline">
          My orders
        </Link>
      </div>
    );
  }
  if (!order) return <p className="text-center py-12 text-gray-600">Loading…</p>;

  return (
    <div className="container mx-auto px-4 py-16 max-w-lg">
      <h1 className="text-3xl font-black mb-4 text-center uppercase tracking-wide">Order placed</h1>
      <p className="text-gray-700 mb-2 text-center">
        Reference{" "}
        <span className="font-mono font-bold text-[var(--brand-text)]">{order.order_number}</span>
      </p>
      <p className="text-gray-600 text-sm mb-6 text-center">
        Status: {order.order_status} · Payment: {order.payment_method} ({order.payment_status})
      </p>
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <p className="flex justify-between text-lg font-bold text-[var(--brand-text)]">
          <span>Total</span>
          <span>₹{Number(order.total_amount ?? 0).toFixed(2)}</span>
        </p>
        <p className="text-sm text-gray-600 mt-2">
          Shipping to {order.shipping_name}, {order.shipping_city}
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link to={`/order/${encodeURIComponent(order.order_number)}`} className="nav-cta px-6 py-3 text-center">
          Order details
        </Link>
        <Link
          to="/orders"
          className="px-6 py-3 text-center border border-[var(--card-border)] rounded-lg font-semibold hover:bg-[var(--card-bg-alt)]"
        >
          All orders
        </Link>
      </div>
    </div>
  );
}
