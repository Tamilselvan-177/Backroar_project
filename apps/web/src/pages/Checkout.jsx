import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiJson } from "../api/client.js";
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

const emptyShipping = {
  full_name: "",
  phone: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  pincode: "",
};

function formatSavedAddress(addr) {
  return [addr.address_line1, addr.address_line2, addr.city, addr.state, addr.pincode].filter(Boolean).join(", ");
}

export default function Checkout() {
  const navigate = useNavigate();
  const [cart, setCart] = useState(null);
  const [shipping, setShipping] = useState(emptyShipping);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedSavedId, setSelectedSavedId] = useState(null);
  const [saveAddressForLater, setSaveAddressForLater] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponPreview, setCouponPreview] = useState(null);
  const [couponErr, setCouponErr] = useState(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const reload = useCallback(async () => {
    const d = await apiJson("/api/cart");
    setCart(d);
  }, []);

  useEffect(() => {
    reload().catch((e) => setErr(e.body?.error || e.message));
  }, [reload]);

  useEffect(() => {
    apiJson("/api/me/addresses")
      .then((d) => setSavedAddresses(Array.isArray(d.addresses) ? d.addresses : []))
      .catch(() => setSavedAddresses([]));
  }, []);

  const totals = cart?.totals ?? { subtotal: 0, total_items: 0, shipping: 0, total: 0 };
  const items = cart?.items ?? [];
  const summaryTotals = couponPreview?.totals ?? { ...totals, discount: 0, total: totals.total };

  const freeShipGap = useMemo(() => {
    const need = 999 - Number(totals.subtotal ?? 0);
    return need > 0 ? need : 0;
  }, [totals.subtotal]);

  function onShipChange(field, value) {
    setShipping((s) => ({ ...s, [field]: value }));
  }

  function applySavedAddress(addr) {
    if (!addr) return;
    setSelectedSavedId(addr.id ?? null);
    setShipping({
      full_name: addr.full_name ?? "",
      phone: addr.phone ?? "",
      address_line1: addr.address_line1 ?? "",
      address_line2: addr.address_line2 ?? "",
      city: addr.city ?? "",
      state: addr.state ?? "",
      pincode: addr.pincode ?? "",
    });
  }

  async function applyCoupon() {
    const code = couponCode.trim().toUpperCase();
    if (!code) {
      setCouponPreview(null);
      setCouponErr("Enter a coupon code.");
      return;
    }
    setCouponBusy(true);
    setCouponErr(null);
    try {
      const res = await apiJson("/api/checkout/coupon-preview", {
        method: "POST",
        body: JSON.stringify({ couponCode: code }),
      });
      setCouponCode(res?.coupon?.code ?? code);
      setCouponPreview(res);
    } catch (e) {
      const b = e.body;
      setCouponPreview(null);
      setCouponErr(b?.message || b?.error || e.message);
    } finally {
      setCouponBusy(false);
    }
  }

  function clearCoupon() {
    setCouponCode("");
    setCouponPreview(null);
    setCouponErr(null);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null);
    setValidationErrors([]);
    setSubmitting(true);
    try {
      if (saveAddressForLater) {
        await apiJson("/api/me/addresses", {
          method: "POST",
          body: JSON.stringify({
            full_name: shipping.full_name,
            phone: shipping.phone,
            address_line1: shipping.address_line1,
            address_line2: shipping.address_line2 || "",
            city: shipping.city,
            state: shipping.state,
            pincode: shipping.pincode,
          }),
        }).catch(() => {
          /* non-blocking: checkout still proceeds */
        });
      }
      const body = {
        shipping: {
          full_name: shipping.full_name,
          phone: shipping.phone,
          address_line1: shipping.address_line1,
          address_line2: shipping.address_line2 || "",
          city: shipping.city,
          state: shipping.state,
          pincode: shipping.pincode,
        },
      };
      if (couponCode.trim()) {
        body.couponCode = couponCode.trim().toUpperCase();
      }
      const r = await apiJson("/api/checkout", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (r.order_number) {
        navigate(`/checkout/success/${encodeURIComponent(r.order_number)}`);
      }
    } catch (e) {
      const b = e.body;
      if (b?.error === "validation_failed" && b.details?.fieldErrors) {
        const fe = b.details.fieldErrors;
        const flat = Object.entries(fe).flatMap(([k, v]) => (Array.isArray(v) ? v.map((m) => `${k}: ${m}`) : [`${k}: ${v}`]));
        setValidationErrors(flat);
      } else if (String(b?.error || "").startsWith("coupon_")) {
        setCouponErr(b?.message || b?.error || e.message);
      } else if (Array.isArray(b?.errors)) {
        setValidationErrors(b.errors);
      } else {
        setErr(b?.message || b?.error || e.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (err === "auth_required") {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="mb-4 text-gray-700">Please log in to checkout.</p>
        <Link to="/login" className="text-[var(--brand-accent)] font-bold underline">
          Login
        </Link>
      </div>
    );
  }
  if (err) {
    return (
      <div className="container mx-auto px-4 py-16 text-center max-w-lg">
        <p className="text-red-600 mb-4">{err}</p>
        <Link to="/cart" className="text-[var(--brand-accent)] underline">
          ← Back to cart
        </Link>
      </div>
    );
  }
  if (!cart) return <p className="text-center py-12 text-gray-600">Loading…</p>;

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center max-w-lg">
        <h1 className="text-2xl font-black mb-4 uppercase tracking-wide">Checkout</h1>
        <p className="text-gray-600 mb-6">Your cart is empty.</p>
        <Link to="/cart" className="text-[var(--brand-accent)] font-semibold underline">
          View cart
        </Link>
      </div>
    );
  }

  return (
    <section className="py-10 bg-[var(--body-bg)]">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl md:text-4xl font-bold mb-8 text-[var(--brand-heading)]">Checkout</h1>

        {validationErrors.length > 0 ? (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <ul className="list-disc pl-5 space-y-1">
              {validationErrors.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4 text-[var(--brand-text)]">Shipping address</h2>
              {savedAddresses.length > 0 ? (
                <div className="mb-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-gray-700">Choose a saved address</span>
                    <Link to="/account" className="text-sm font-semibold text-[var(--brand-accent)] underline">
                      Manage in account
                    </Link>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {savedAddresses.map((a) => {
                      const active = String(selectedSavedId) === String(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => applySavedAddress(a)}
                          className={`rounded-xl border p-4 text-left transition ${
                            active
                              ? "border-slate-900 bg-slate-900 text-white shadow-lg"
                              : "border-[var(--card-border)] bg-white hover:border-slate-400"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold">{a.full_name}</p>
                              <p className={`mt-1 text-sm ${active ? "text-slate-200" : "text-gray-600"}`}>{a.phone}</p>
                            </div>
                            <span className={`text-[11px] font-bold uppercase tracking-wide ${active ? "text-slate-200" : "text-gray-400"}`}>
                              {active ? "Selected" : `#${a.id}`}
                            </span>
                          </div>
                          <p className={`mt-3 text-sm leading-6 ${active ? "text-slate-100" : "text-gray-700"}`}>{formatSavedAddress(a)}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="sm:col-span-2 block">
                  <span className="text-sm font-semibold text-gray-700">Full name</span>
                  <input
                    required
                    className="mt-1 w-full border border-[var(--card-border)] rounded-lg px-3 py-2"
                    value={shipping.full_name}
                    onChange={(e) => onShipChange("full_name", e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">Phone</span>
                  <input
                    required
                    className="mt-1 w-full border border-[var(--card-border)] rounded-lg px-3 py-2"
                    value={shipping.phone}
                    onChange={(e) => onShipChange("phone", e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">PIN / ZIP</span>
                  <input
                    required
                    className="mt-1 w-full border border-[var(--card-border)] rounded-lg px-3 py-2"
                    value={shipping.pincode}
                    onChange={(e) => onShipChange("pincode", e.target.value)}
                  />
                </label>
                <label className="sm:col-span-2 block">
                  <span className="text-sm font-semibold text-gray-700">Address line 1</span>
                  <input
                    required
                    className="mt-1 w-full border border-[var(--card-border)] rounded-lg px-3 py-2"
                    value={shipping.address_line1}
                    onChange={(e) => onShipChange("address_line1", e.target.value)}
                  />
                </label>
                <label className="sm:col-span-2 block">
                  <span className="text-sm font-semibold text-gray-700">Address line 2 (optional)</span>
                  <input
                    className="mt-1 w-full border border-[var(--card-border)] rounded-lg px-3 py-2"
                    value={shipping.address_line2}
                    onChange={(e) => onShipChange("address_line2", e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">City</span>
                  <input
                    required
                    className="mt-1 w-full border border-[var(--card-border)] rounded-lg px-3 py-2"
                    value={shipping.city}
                    onChange={(e) => onShipChange("city", e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">State</span>
                  <input
                    required
                    className="mt-1 w-full border border-[var(--card-border)] rounded-lg px-3 py-2"
                    value={shipping.state}
                    onChange={(e) => onShipChange("state", e.target.value)}
                  />
                </label>
              </div>
              <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="mt-1 rounded border-[var(--card-border)]"
                  checked={saveAddressForLater}
                  onChange={(e) => setSaveAddressForLater(e.target.checked)}
                />
                <span>
                  Save this address for next time <span className="text-gray-500">(reuse at checkout)</span>
                </span>
              </label>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
              <h2 className="text-xl font-bold p-4 border-b border-[var(--card-border)] text-[var(--brand-text)]">
                Items
              </h2>
              {items.map((item) => {
                const img = cartLineImageUrl(item);
                return (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row gap-4 p-4 border-b border-[var(--card-border)] last:border-b-0"
                  >
                    <div className="w-full sm:w-24 h-24 bg-[var(--card-bg-alt)] rounded-lg overflow-hidden flex-shrink-0">
                      {img ? (
                        <img src={img} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl">📦</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[var(--brand-text)]">
                        {item.product_name}
                        {item.variant_name ? (
                          <span className="text-sm font-normal text-gray-600"> ({item.variant_name})</span>
                        ) : null}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        Qty {item.quantity} × ₹{unitPrice(item).toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Line</p>
                      <p className="font-bold text-[var(--brand-text)]">₹{lineSubtotal(item).toFixed(2)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6 sticky top-20">
              <h2 className="text-xl font-bold mb-6 text-[var(--brand-text)]">Order summary</h2>
              <div className="mb-6 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg-alt)] p-4">
                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">Coupon code</span>
                  <div className="mt-2 flex gap-2">
                    <input
                      className="w-full rounded-lg border border-[var(--card-border)] px-3 py-2 uppercase"
                      placeholder="Enter coupon code"
                      value={couponCode}
                      onChange={(e) => {
                        setCouponCode(e.target.value.toUpperCase());
                        setCouponPreview(null);
                        setCouponErr(null);
                      }}
                    />
                    <button
                      type="button"
                      onClick={applyCoupon}
                      disabled={couponBusy}
                      className="rounded-lg border border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-60"
                    >
                      {couponBusy ? "Applying…" : "Apply"}
                    </button>
                  </div>
                </label>
                {couponPreview?.coupon ? (
                  <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                    <p className="font-semibold">
                      Applied: {couponPreview.coupon.code} (-₹{Number(couponPreview.totals?.discount || 0).toFixed(2)})
                    </p>
                    {couponPreview.coupon.description ? <p className="mt-1 text-xs">{couponPreview.coupon.description}</p> : null}
                    <button type="button" onClick={clearCoupon} className="mt-2 text-xs font-semibold underline">
                      Remove coupon
                    </button>
                  </div>
                ) : null}
                {couponErr ? <p className="mt-3 text-sm text-red-600">{couponErr}</p> : null}
              </div>
              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal ({totals.total_items} items)</span>
                  <span className="font-semibold">₹{Number(summaryTotals.subtotal).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Shipping</span>
                  {summaryTotals.subtotal >= 999 ? (
                    <span className="font-semibold text-green-600">FREE</span>
                  ) : (
                    <span className="font-semibold">₹{Number(summaryTotals.shipping).toFixed(2)}</span>
                  )}
                </div>
                {Number(summaryTotals.discount || 0) > 0 ? (
                  <div className="flex justify-between text-green-700">
                    <span>Coupon discount</span>
                    <span className="font-semibold">-₹{Number(summaryTotals.discount).toFixed(2)}</span>
                  </div>
                ) : null}
                {summaryTotals.subtotal < 999 ? (
                  <p className="text-sm text-gray-600 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    Add ₹{freeShipGap.toFixed(2)} more for FREE shipping.
                  </p>
                ) : null}
                <div className="border-t border-[var(--card-border)] pt-3">
                  <div className="flex justify-between text-lg font-bold text-[var(--brand-text)]">
                    <span>Total</span>
                    <span>₹{Number(summaryTotals.total).toFixed(2)}</span>
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-4">Payment: Cash on delivery (COD), pending confirmation.</p>
              <button
                type="submit"
                disabled={submitting}
                className="w-full px-6 py-3 bg-[var(--brand-primary)] text-white rounded-lg font-bold hover:bg-[var(--brand-primary-hover)] disabled:opacity-60 transition-colors mb-3"
              >
                {submitting ? "Placing order…" : "Place order"}
              </button>
              <Link
                to="/cart"
                className="block w-full px-6 py-3 border border-[var(--card-border)] text-center rounded-lg hover:bg-[var(--card-bg-alt)] font-semibold transition-colors"
              >
                ← Back to cart
              </Link>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
