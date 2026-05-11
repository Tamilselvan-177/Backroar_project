import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../api/client.js";
import { useDeleteConfirm } from "../context/DeleteConfirmContext.jsx";
import { cartLineImageUrl } from "../lib/images.js";

function unitPrice(item) {
  const sale = item.sale_price != null && item.sale_price !== "" ? Number(item.sale_price) : null;
  const base = Number(item.price ?? 0);
  if (sale != null && !Number.isNaN(sale) && sale > 0 && sale < base) return sale;
  return base;
}

function lineSubtotal(item) {
  return unitPrice(item) * Number(item.quantity ?? 0);
}

export default function CartPage() {
  const askDelete = useDeleteConfirm();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const reload = useCallback(async () => {
    const d = await apiJson("/api/cart");
    setData(d);
  }, []);

  useEffect(() => {
    reload().catch((e) => setErr(e.body?.error || e.message));
  }, [reload]);

  const totals = data?.totals ?? { subtotal: 0, total_items: 0, shipping: 0, total: 0 };
  const items = data?.items ?? [];

  const freeShipGap = useMemo(() => {
    const need = 999 - Number(totals.subtotal ?? 0);
    return need > 0 ? need : 0;
  }, [totals.subtotal]);

  async function sendQty(cartItemId, quantity) {
    setBusyId(cartItemId);
    try {
      await apiJson("/api/cart/update", {
        method: "POST",
        body: JSON.stringify({ cartItemId, quantity }),
      });
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(cartItemId) {
    const ok = await askDelete({
      title: "Remove this item?",
      description: "This line will be removed from your cart.",
      confirmLabel: "Remove",
    });
    if (!ok) return;
    setBusyId(cartItemId);
    try {
      await apiJson("/api/cart/remove", {
        method: "POST",
        body: JSON.stringify({ cartItemId }),
      });
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function clearCart() {
    const ok = await askDelete({
      title: "Clear entire cart?",
      description: "Every item will be removed from your cart.",
      confirmLabel: "Clear cart",
    });
    if (!ok) return;
    await apiJson("/api/cart/clear", { method: "POST", body: JSON.stringify({}) });
    await reload();
  }

  if (err) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="mb-4 text-gray-700">
          {err === "auth_required" ? "Please login to view your cart" : err}
        </p>
        <Link to="/login" className="text-[var(--brand-accent)] font-bold underline">
          Login
        </Link>
      </div>
    );
  }
  if (!data) return <p className="text-center py-12 text-gray-600">Loading…</p>;

  return (
    <section className="py-10 bg-[var(--body-bg)]">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl md:text-4xl font-bold mb-8 text-[var(--brand-heading)]">Shopping Cart</h1>

        {items.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow overflow-hidden">
                {items.map((item) => {
                  const img = cartLineImageUrl(item);
                  const max = Math.max(1, Number(item.stock_quantity ?? 9999));
                  const u = unitPrice(item);
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col sm:flex-row gap-4 p-4 border-b border-[var(--card-border)] last:border-b-0"
                      data-unit-price={u}
                      data-cart-item-id={item.id}
                    >
                      <div className="w-full sm:w-32 h-32 bg-[var(--card-bg-alt)] rounded-lg overflow-hidden flex-shrink-0">
                        {img ? (
                          <img
                            src={img}
                            alt={item.variant_name || item.product_name}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-4xl">📦</div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <Link
                          to={`/product/${encodeURIComponent(item.product_slug)}`}
                          className="text-lg font-semibold text-[var(--brand-text)] hover:text-[var(--brand-primary)] block mb-2"
                        >
                          {item.product_name}
                          {item.variant_name ? (
                            <span className="text-sm font-normal text-gray-600"> ({item.variant_name})</span>
                          ) : null}
                        </Link>

                        {item.brand_name ? <p className="text-sm text-gray-500 mb-1">Brand: {item.brand_name}</p> : null}
                        {item.model_name ? <p className="text-sm text-gray-500 mb-2">Model: {item.model_name}</p> : null}

                        <div className="flex items-center gap-2 mb-3">
                          {item.sale_price != null && Number(item.sale_price) > 0 && Number(item.sale_price) < Number(item.price) ? (
                            <>
                              <span className="text-xl font-bold text-red-600">₹{item.sale_price}</span>
                              <span className="text-sm text-gray-500 line-through">₹{item.price}</span>
                            </>
                          ) : (
                            <span className="text-xl font-bold text-[var(--brand-text)]">₹{item.price}</span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-4">
                          <div className="flex items-center border border-[var(--card-border)] rounded-lg overflow-hidden">
                            <button
                              type="button"
                              disabled={busyId === item.id}
                              className="px-3 py-2 bg-[var(--card-bg-alt)] hover:bg-gray-200 font-bold"
                              onClick={() => {
                                const q = Math.max(1, Number(item.quantity) - 1);
                                if (q !== Number(item.quantity)) sendQty(item.id, q);
                              }}
                            >
                              -
                            </button>
                            <span className="w-16 text-center border-x border-[var(--card-border)] py-2 text-sm font-semibold">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              disabled={busyId === item.id}
                              className="px-3 py-2 bg-[var(--card-bg-alt)] hover:bg-gray-200 font-bold"
                              onClick={() => {
                                const q = Math.min(max, Number(item.quantity) + 1);
                                if (q !== Number(item.quantity)) sendQty(item.id, q);
                              }}
                            >
                              +
                            </button>
                          </div>

                          <button
                            type="button"
                            className="text-red-600 hover:text-red-700 font-semibold text-sm"
                            disabled={busyId === item.id}
                            onClick={() => remove(item.id)}
                          >
                            Remove
                          </button>
                        </div>

                        {Number(item.quantity) > max ? (
                          <p className="text-red-600 text-sm mt-2">⚠️ Only {max} items available</p>
                        ) : null}
                      </div>

                      <div className="text-right sm:text-left lg:text-right item-subtotal">
                        <p className="text-sm text-gray-500 mb-1">Subtotal</p>
                        <p className="text-xl font-bold text-[var(--brand-text)]">₹{lineSubtotal(item).toFixed(2)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4">
                <button type="button" className="text-red-600 hover:text-red-700 font-semibold" onClick={clearCart}>
                  Clear Cart
                </button>
              </div>
            </div>

            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow p-6 sticky top-20">
                <h2 className="text-xl font-bold mb-6 text-[var(--brand-text)]">Order Summary</h2>

                <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-gray-600">
                    <span>
                      Subtotal (<span id="order-items">{totals.total_items}</span> items)
                    </span>
                    <span id="order-subtotal" className="font-semibold">
                      ₹{Number(totals.subtotal).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Shipping</span>
                    {totals.subtotal >= 999 ? (
                      <span id="order-shipping" className="font-semibold text-green-600">
                        FREE
                      </span>
                    ) : (
                      <span id="order-shipping" className="font-semibold">
                        ₹{Number(totals.shipping).toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="border-t border-[var(--card-border)] pt-3">
                    <div className="flex justify-between text-lg font-bold text-[var(--brand-text)]">
                      <span>Total</span>
                      <span id="order-total">₹{Number(totals.total).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {totals.subtotal < 999 ? (
                  <p className="text-sm text-gray-600 bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                    Add ₹{freeShipGap.toFixed(2)} more for FREE shipping! 🚚
                  </p>
                ) : null}

                <Link
                  to="/checkout"
                  className="block w-full px-6 py-3 bg-[var(--brand-primary)] text-white rounded-lg text-center font-bold hover:bg-[var(--brand-primary-hover)] transition-colors mb-3"
                >
                  Proceed to Checkout
                </Link>

                <Link
                  to="/categories"
                  className="block w-full px-6 py-3 border border-[var(--card-border)] text-center rounded-lg hover:bg-[var(--card-bg-alt)] font-semibold transition-colors"
                >
                  Continue Shopping
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-6xl mb-4">🛒</div>
            <h2 className="text-2xl font-bold mb-2 text-[var(--brand-text)]">Your Cart is Empty</h2>
            <p className="text-gray-600 mb-6">Looks like you haven&apos;t added anything to your cart yet.</p>
            <Link
              to="/categories"
              className="inline-block px-6 py-3 bg-[var(--brand-primary)] text-white rounded-lg font-bold hover:bg-[var(--brand-primary-hover)]"
            >
              Start Shopping
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
