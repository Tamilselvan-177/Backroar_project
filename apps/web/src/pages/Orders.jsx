import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiJson, bootstrapCsrf } from "../api/client.js";
import { useDeleteConfirm } from "../context/DeleteConfirmContext.jsx";

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return String(iso);
  }
}

function normLabel(s) {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
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
  return <span className={`px-3 py-1 rounded-full text-sm font-semibold ${cls}`}>{s || "—"}</span>;
}

function PaymentBadge({ status }) {
  const s = normLabel(status);
  const map = {
    Pending: "bg-gray-100 text-gray-800",
    Paid: "bg-green-100 text-green-800",
    Failed: "bg-red-100 text-red-800",
    Refunded: "bg-gray-100 text-gray-700",
  };
  const cls = map[s] || "bg-gray-100 text-gray-800";
  const label =
    s === "Pending" ? "Payment Pending" : s === "Paid" ? "Paid" : s === "Failed" ? "Payment Failed" : s;
  return <span className={`px-3 py-1 rounded-full text-sm font-semibold ${cls}`}>{label}</span>;
}

export default function Orders() {
  const askDelete = useDeleteConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [cancelId, setCancelId] = useState(null);

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const qs = searchParams.toString();

  useEffect(() => {
    apiJson(`/api/orders${qs ? `?${qs}` : ""}`)
      .then(setData)
      .catch((e) => setErr(e.body?.error || e.message));
  }, [qs]);

  async function cancelOrder(orderId, orderNumber) {
    const label = orderNumber ? `#${orderNumber}` : `#${orderId}`;
    const ok = await askDelete({
      title: "Cancel this order?",
      description: `Cancel order ${label}. This is only possible while the order is still pending or confirmed.`,
      confirmLabel: "Cancel order",
    });
    if (!ok) return;
    setCancelId(orderId);
    try {
      await bootstrapCsrf();
      await apiJson("/api/order/cancel", {
        method: "POST",
        body: JSON.stringify({ order_id: orderId }),
      });
      const next = await apiJson(`/api/orders${qs ? `?${qs}` : ""}`);
      setData(next);
    } catch (e) {
      alert(e.body?.error || e.message || "Cancel failed");
    } finally {
      setCancelId(null);
    }
  }

  if (err) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center px-4 py-16">
        <p className="mb-4 text-[var(--brand-text)]">
          {err === "auth_required" ? "Please log in to view orders." : err}
        </p>
        <Link to="/login" className="text-[var(--brand-primary)] font-bold underline">
          Login
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-16 text-center text-gray-500">
        <p>Loading…</p>
      </div>
    );
  }

  const orders = data.orders ?? [];
  const totalPages = data.total_pages ?? 1;

  return (
    <section className="py-10 bg-neutral-50 min-h-[calc(100vh-4rem)]">
      <div className="container mx-auto px-4 max-w-5xl">
        <h1 className="text-3xl md:text-4xl font-bold mb-8 text-[var(--brand-heading)]">Order History</h1>

        {orders.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md border border-black/5 p-12 text-center">
            <div className="text-6xl mb-4" aria-hidden>
              📦
            </div>
            <h2 className="text-2xl font-bold mb-2 text-[var(--brand-text)]">No Orders Yet</h2>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              You haven&apos;t placed any orders yet. Start shopping to see your orders here!
            </p>
            <Link
              to="/categories"
              className="inline-block px-6 py-3 bg-[var(--brand-primary)] text-white rounded-lg font-bold hover:bg-[var(--brand-primary-hover)] transition-colors"
            >
              Start Shopping
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {orders.map((o) => {
                const canCancel = ["pending", "confirmed"].includes(
                  String(o.order_status ?? "").trim().toLowerCase()
                );
                return (
                  <div
                    key={o.id}
                    className="bg-white rounded-lg shadow-md border border-black/5 overflow-hidden"
                  >
                    <div className="p-6">
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-[var(--brand-text)] mb-1">
                            Order #{o.order_number}
                          </h3>
                          <p className="text-sm text-gray-500">{fmtDate(o.created_at)}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <OrderStatusBadge status={o.order_status} />
                          <PaymentBadge status={o.payment_status} />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4 border-t border-b border-[var(--card-border)]">
                        <div>
                          <p className="text-sm text-gray-500 mb-1">Total Amount</p>
                          <p className="text-xl font-bold text-[var(--brand-text)]">
                            ₹{Number(o.total_amount ?? 0).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500 mb-1">Items</p>
                          <p className="font-semibold">{o.item_count ?? 0} line(s)</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500 mb-1">Order ID</p>
                          <p className="font-semibold font-mono text-sm">#{o.id}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3 mt-4">
                        <Link
                          to={`/order/${encodeURIComponent(o.order_number)}`}
                          className="px-4 py-2 bg-[var(--brand-primary)] text-white rounded-lg font-semibold hover:bg-[var(--brand-primary-hover)] transition-colors text-sm"
                        >
                          View Details
                        </Link>
                        {canCancel ? (
                          <button
                            type="button"
                            disabled={cancelId === o.id}
                            onClick={() => cancelOrder(o.id, o.order_number)}
                            className="px-4 py-2 border border-red-600 text-red-600 rounded-lg font-semibold hover:bg-red-50 transition-colors text-sm disabled:opacity-50"
                          >
                            {cancelId === o.id ? "Cancelling…" : "Cancel Order"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 ? (
              <div className="flex justify-center gap-2 mt-8 flex-wrap">
                {page > 1 ? (
                  <button
                    type="button"
                    className="px-4 py-2 border border-[var(--card-border)] rounded-lg hover:bg-white text-sm font-semibold"
                    onClick={() => {
                      setSearchParams((prev) => {
                        const n = new URLSearchParams(prev);
                        n.set("page", String(page - 1));
                        return n;
                      });
                    }}
                  >
                    Previous
                  </button>
                ) : null}
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() =>
                      setSearchParams((prev) => {
                        const n = new URLSearchParams(prev);
                        n.set("page", String(p));
                        return n;
                      })
                    }
                    className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                      p === page
                        ? "bg-[var(--brand-primary)] text-white"
                        : "border border-[var(--card-border)] hover:bg-white"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                {page < totalPages ? (
                  <button
                    type="button"
                    className="px-4 py-2 border border-[var(--card-border)] rounded-lg hover:bg-white text-sm font-semibold"
                    onClick={() => {
                      setSearchParams((prev) => {
                        const n = new URLSearchParams(prev);
                        n.set("page", String(page + 1));
                        return n;
                      });
                    }}
                  >
                    Next
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
