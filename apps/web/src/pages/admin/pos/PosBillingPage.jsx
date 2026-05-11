import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiJson } from "../../../api/client.js";
import { P } from "../adminPermKeys.js";
import { useAdminPerm } from "../AdminPermContext.jsx";

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function computeTotals(cart, serviceCharge) {
  let subtotal = 0;
  let discountTotal = 0;
  let gstTotal = 0;
  for (const item of Object.values(cart || {})) {
    const basePrice = Number(item.price) || 0;
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const dp = Number(item.discount_percent) || 0;
    const effectiveUnit =
      item.effective_price > 0 ? Number(item.effective_price) : basePrice * (1 - dp / 100);
    const lineSub = basePrice * qty;
    const lineAfterDisc = effectiveUnit * qty;
    discountTotal += lineSub - lineAfterDisc;
    gstTotal += lineAfterDisc * ((Number(item.gst_percent) || 0) / 100);
    subtotal += lineSub;
  }
  const svc = Math.max(0, round2(serviceCharge));
  const grand = subtotal - discountTotal + gstTotal + svc;
  return { subtotal, discountTotal, gstTotal, serviceCharge: svc, grand };
}

export default function PosBillingPage() {
  const { has } = useAdminPerm();
  const navigate = useNavigate();
  const barcodeRef = useRef(null);
  const cashRef = useRef(null);
  const customerPhoneRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [state, setState] = useState(null);
  const [barcode, setBarcode] = useState("");
  const [addQty, setAddQty] = useState(1);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [staffId, setStaffId] = useState("");
  const [cash, setCash] = useState("");
  const [card, setCard] = useState("");
  const [upi, setUpi] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  const loadState = useCallback(() => {
    return apiJson("/api/admin/pos/state").then((s) => {
      setState(s);
      if (s.active) {
        setServiceCharge(Number(s.service_charge) || 0);
        const t = s.temp || {};
        setCustomerName(String(t.customer_name ?? ""));
        setCustomerPhone(String(t.customer_phone ?? ""));
        setStaffId(t.staff_id != null && t.staff_id !== "" ? String(t.staff_id) : "");
        setCash(String(t.cash_amount ?? ""));
        setCard(String(t.card_amount ?? ""));
        setUpi(String(t.upi_amount ?? ""));
      }
      return s;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadState()
      .then((s) => {
        if (cancelled) return;
        if (!s.active) navigate("/admin/pos", { replace: true });
      })
      .catch(() => {
        if (!cancelled) navigate("/admin/pos", { replace: true });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadState, navigate]);

  useEffect(() => {
    if (!searchOpen) return;
    const q = searchQ.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      apiJson(`/api/admin/pos/search-products?q=${encodeURIComponent(q)}`)
        .then(setSearchResults)
        .catch(() => setSearchResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [searchQ, searchOpen]);

  async function persistFormExtras(nextSvc) {
    await apiJson("/api/admin/pos/service-charge", {
      method: "POST",
      body: JSON.stringify({
        service_charge: nextSvc ?? serviceCharge,
        staff_id: staffId,
        customer_name: customerName,
        customer_phone: customerPhone,
        cash_amount: cash,
        card_amount: card,
        upi_amount: upi,
      }),
    });
    await loadState();
  }

  const fillExactCash = useCallback(async () => {
    const g = computeTotals(state?.cart || {}, serviceCharge).grand;
    const nextCash = g.toFixed(2);
    setCash(nextCash);
    await apiJson("/api/admin/pos/service-charge", {
      method: "POST",
      body: JSON.stringify({
        service_charge: serviceCharge,
        staff_id: staffId,
        customer_name: customerName,
        customer_phone: customerPhone,
        cash_amount: nextCash,
        card_amount: card,
        upi_amount: upi,
      }),
    });
    await loadState();
  }, [state?.cart, serviceCharge, staffId, customerName, customerPhone, card, upi, loadState]);

  const clearPaymentFields = useCallback(async () => {
    setCash("");
    setCard("");
    setUpi("");
    await apiJson("/api/admin/pos/service-charge", {
      method: "POST",
      body: JSON.stringify({
        service_charge: serviceCharge,
        staff_id: staffId,
        customer_name: customerName,
        customer_phone: customerPhone,
        cash_amount: "",
        card_amount: "",
        upi_amount: "",
      }),
    });
    await loadState();
  }, [serviceCharge, staffId, customerName, customerPhone, loadState]);

  useEffect(() => {
    function onKey(e) {
      const key = e.key;
      const active = document.activeElement;
      const tag = active?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
        if (active?.classList?.contains?.("pos-discount-input") || active?.name === "line_qty") {
          if (key === "Enter") {
            e.preventDefault();
            active.blur();
          }
          return;
        }
      }
      if (key === "F1") {
        e.preventDefault();
        barcodeRef.current?.focus();
      }
      if (key === "F2") {
        e.preventDefault();
        apiJson("/api/admin/pos/cart/clear", { method: "POST", body: "{}" })
          .then(() => loadState())
          .catch(() => {});
      }
      if (key === "F3") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (key === "F6") {
        e.preventDefault();
        customerPhoneRef.current?.focus();
        customerPhoneRef.current?.select?.();
      }
      if (key === "F7") {
        e.preventDefault();
        cashRef.current?.focus();
        cashRef.current?.select?.();
      }
      if (key === "F9") {
        e.preventDefault();
        fillExactCash().catch(() => {});
      }
      if (key === "Escape" && searchOpen) {
        e.preventDefault();
        setSearchOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [loadState, searchOpen, fillExactCash]);

  async function dismissHold(holdId) {
    if (!window.confirm("Remove this held bill from the list?")) return;
    setErr(null);
    try {
      await apiJson(`/api/admin/pos/holds/${holdId}/delete`, { method: "POST", body: "{}" });
      await loadState();
    } catch (e2) {
      setErr(e2.body?.message || e2.message);
    }
  }

  async function addLine(e) {
    e?.preventDefault?.();
    if (!barcode.trim()) return;
    setErr(null);
    try {
      await apiJson("/api/admin/pos/cart/add", {
        method: "POST",
        body: JSON.stringify({ barcode: barcode.trim(), quantity: addQty }),
      });
      setBarcode("");
      setAddQty(1);
      await loadState();
      barcodeRef.current?.focus();
    } catch (e2) {
      setErr(e2.body?.message || e2.message);
    }
  }

  async function addProductFromSearch(row) {
    const productId = row.product_id ?? row.id;
    setErr(null);
    try {
      const body = { product_id: productId, quantity: 1 };
      if (row.variant_id != null && row.variant_id !== "") {
        body.variant_id = row.variant_id;
      }
      await apiJson("/api/admin/pos/cart/add", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSearchOpen(false);
      setSearchQ("");
      await loadState();
      barcodeRef.current?.focus();
    } catch (e2) {
      setErr(e2.body?.message || e2.message);
    }
  }

  async function updateQty(cartKey, productId, quantity) {
    await apiJson("/api/admin/pos/cart/update-qty", {
      method: "POST",
      body: JSON.stringify({ cart_key: cartKey, product_id: productId, quantity }),
    });
    await loadState();
  }

  async function updateDisc(cartKey, productId, discount_percent, discount_amount) {
    await apiJson("/api/admin/pos/cart/update-discount", {
      method: "POST",
      body: JSON.stringify({
        cart_key: cartKey,
        product_id: productId,
        discount_percent,
        discount_amount,
      }),
    });
    await loadState();
  }

  async function removeLine(cartKey, productId) {
    await apiJson("/api/admin/pos/cart/remove", {
      method: "POST",
      body: JSON.stringify({ cart_key: cartKey, product_id: productId }),
    });
    await loadState();
  }

  async function doHold() {
    await apiJson("/api/admin/pos/hold", {
      method: "POST",
      body: JSON.stringify({ customer_name: customerName, customer_phone: customerPhone }),
    });
    await loadState();
  }

  async function recall(id) {
    await apiJson(`/api/admin/pos/recall/${id}`, { method: "POST", body: "{}" });
    await loadState();
  }

  async function doCheckout() {
    setCheckoutBusy(true);
    setErr(null);
    try {
      await persistFormExtras(serviceCharge);
      const res = await apiJson("/api/admin/pos/checkout", {
        method: "POST",
        body: JSON.stringify({
          cash_amount: Number(cash) || 0,
          card_amount: Number(card) || 0,
          upi_amount: Number(upi) || 0,
          service_charge: serviceCharge,
          customer_name: customerName,
          customer_phone: customerPhone,
          staff_id: staffId ? Number(staffId) : 0,
          sale_type: "Shop",
          credit_sale: false,
        }),
      });
      await loadState();
      setCash("");
      setCard("");
      setUpi("");
      alert(`Bill saved: ${res.order_number} (#${res.order_id})`);
    } catch (e2) {
      setErr(e2.body?.error === "payment_short" ? "Payment is less than total." : e2.message);
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function endPos() {
    await apiJson("/api/admin/pos/end", { method: "POST", body: "{}" });
    navigate("/admin/pos");
  }

  if (loading || !state?.active) {
    return <div className="py-12 text-center text-gray-600">Opening POS…</div>;
  }

  const cart = state.cart || {};
  const lines = Object.entries(cart);
  const totals = computeTotals(cart, serviceCharge);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-2 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">POS billing</h1>
          <p className="text-sm text-gray-600 mt-1 font-mono">
            {state.store_code} · {state.counter_code} · FY {state.financial_year}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            <kbd className="px-1 rounded bg-gray-100 border border-gray-200">F1</kbd> barcode ·{" "}
            <kbd className="px-1 rounded bg-gray-100 border border-gray-200">F2</kbd> new bill ·{" "}
            <kbd className="px-1 rounded bg-gray-100 border border-gray-200">F3</kbd> search ·{" "}
            <kbd className="px-1 rounded bg-gray-100 border border-gray-200">F6</kbd> phone ·{" "}
            <kbd className="px-1 rounded bg-gray-100 border border-gray-200">F7</kbd> cash ·{" "}
            <kbd className="px-1 rounded bg-gray-100 border border-gray-200">F9</kbd> cash = grand
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={endPos}
            className="text-sm px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-800"
            title="Clears the cart; you can reopen this counter without PIN while signed into admin."
          >
            End session
          </button>
          <Link
            to="/admin"
            className="text-sm px-3 py-2 rounded-lg border border-gray-900 bg-gray-900 text-white hover:bg-black"
          >
            Admin
          </Link>
        </div>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{err}</div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <form onSubmit={addLine} className="flex flex-wrap gap-2 items-end bg-white border border-gray-200 rounded-xl p-4">
            <label className="flex-1 min-w-[12rem] text-sm font-medium text-gray-700">
              Barcode / SKU
              <input
                ref={barcodeRef}
                name="barcode"
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scan or type…"
              />
            </label>
            <label className="w-24 text-sm font-medium text-gray-700">
              Qty
              <input
                type="number"
                min={1}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                value={addQty}
                onChange={(e) => setAddQty(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
            <button type="submit" className="px-4 py-2 rounded-lg bg-gray-900 text-white font-semibold">
              Add
            </button>
          </form>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table key={lines.map(([k]) => k).join("|")} className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left p-3">Item</th>
                  <th className="text-right p-3">Price</th>
                  <th className="text-right p-3 w-24">Qty</th>
                  <th className="text-right p-3 w-28">Disc %</th>
                  <th className="p-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">
                      Cart is empty — scan a barcode (F1) or search (F3).
                    </td>
                  </tr>
                ) : (
                  lines.map(([key, item]) => {
                    const maxPct = item.max_discount_percent != null ? Number(item.max_discount_percent) : 100;
                    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
                    return (
                      <tr key={key} className="border-b border-gray-100">
                        <td className="p-3 font-medium text-gray-900">{item.name}</td>
                        <td className="p-3 text-right">₹{Number(item.price).toFixed(2)}</td>
                        <td className="p-3 text-right">
                          <input
                            name="line_qty"
                            type="number"
                            min={1}
                            className="w-20 border border-gray-300 rounded px-2 py-1 text-right"
                            defaultValue={qty}
                            onBlur={(e) =>
                              updateQty(key, item.product_id, Math.max(1, Number(e.target.value) || 1))
                            }
                          />
                        </td>
                        <td className="p-3 text-right">
                          <input
                            className="pos-discount-input w-20 border border-gray-300 rounded px-2 py-1 text-right"
                            type="number"
                            min={0}
                            max={maxPct}
                            step={0.01}
                            defaultValue={Number(item.discount_percent || 0).toFixed(2)}
                            onBlur={(e) =>
                              updateDisc(key, item.product_id, Number(e.target.value) || 0, 0)
                            }
                          />
                        </td>
                        <td className="p-3">
                          <button
                            type="button"
                            className="text-gray-600 text-xs hover:text-red-700 underline"
                            onClick={() => removeLine(key, item.product_id)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="font-bold text-gray-900 mb-2">Held bills</h3>
              <ul className="text-sm space-y-2 max-h-48 overflow-auto">
                {(state.holds || []).map((h) => (
                  <li key={h.id} className="flex flex-wrap items-start gap-x-2 gap-y-1 justify-between border-b border-gray-100 pb-2 last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="text-gray-700 truncate">
                        {h.customer_name || "Hold"} · {h.customer_phone || "—"}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {Number(h.lines_count ?? 0)} lines · ₹{Number(h.hold_total ?? 0).toFixed(2)}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0 items-center">
                      <button
                        type="button"
                        className="text-[var(--brand-accent)] underline text-xs"
                        onClick={() => recall(h.id)}
                      >
                        Recall
                      </button>
                      <button
                        type="button"
                        className="text-xs text-red-700 underline"
                        onClick={() => dismissHold(h.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
                {!(state.holds || []).length && <li className="text-gray-500">No holds</li>}
              </ul>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-gray-900">Recent POS bills</h3>
                {has(P.FINANCE_POS_ORDERS) ? (
                  <Link to="/admin/pos/orders" className="text-xs text-[var(--brand-accent)] underline">
                    View all
                  </Link>
                ) : null}
              </div>
              <ul className="text-sm space-y-1 max-h-40 overflow-auto text-gray-700">
                {(state.recent_orders || []).map((o) => (
                  <li key={o.id}>
                    {has(P.FINANCE_POS_ORDERS) ? (
                      <Link to={`/admin/pos/orders/${o.id}`} className="text-[var(--brand-accent)] underline">
                        {o.order_number}
                      </Link>
                    ) : (
                      <span className="font-mono text-gray-800">{o.order_number}</span>
                    )}
                    {" — "}₹{Number(o.grand_total).toFixed(2)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-gray-900 text-white rounded-xl p-5 space-y-2 shadow-sm">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>₹{totals.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Discount</span>
              <span>−₹{totals.discountTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>GST</span>
              <span>₹{totals.gstTotal.toFixed(2)}</span>
            </div>
            <label className="block text-xs text-gray-300 mt-2">
              Service charge
              <input
                type="number"
                min={0}
                step={0.01}
                className="mt-1 w-full border border-gray-600 rounded px-2 py-1 text-black"
                value={serviceCharge}
                onChange={(e) => setServiceCharge(Math.max(0, Number(e.target.value) || 0))}
                onBlur={() => persistFormExtras(serviceCharge)}
              />
            </label>
            <div className="flex justify-between text-lg font-black pt-2 border-t border-gray-700">
              <span>Grand</span>
              <span>₹{totals.grand.toFixed(2)}</span>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 text-sm">
            <label className="block font-medium text-gray-700">
              Staff (sale attribution)
              <select
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                onBlur={() => persistFormExtras()}
              >
                <option value="">— Current user —</option>
                {(state.staff || []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block font-medium text-gray-700">
              Customer name
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                onBlur={() => persistFormExtras()}
              />
            </label>
            <label className="block font-medium text-gray-700">
              Customer phone (F6)
              <input
                ref={customerPhoneRef}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                onBlur={() => persistFormExtras()}
              />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs text-gray-600">
                Cash (F7)
                <input
                  ref={cashRef}
                  type="number"
                  min={0}
                  step={0.01}
                  className="mt-1 w-full border border-gray-300 rounded px-2 py-1"
                  value={cash}
                  onChange={(e) => setCash(e.target.value)}
                  onBlur={() => persistFormExtras()}
                />
              </label>
              <label className="text-xs text-gray-600">
                Card
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="mt-1 w-full border border-gray-300 rounded px-2 py-1"
                  value={card}
                  onChange={(e) => setCard(e.target.value)}
                  onBlur={() => persistFormExtras()}
                />
              </label>
              <label className="text-xs text-gray-600">
                UPI
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="mt-1 w-full border border-gray-300 rounded px-2 py-1"
                  value={upi}
                  onChange={(e) => setUpi(e.target.value)}
                  onBlur={() => persistFormExtras()}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={lines.length === 0}
                title="Set cash tender to match grand total (keyboard F9)"
                onClick={() => fillExactCash().catch(() => {})}
                className="text-xs px-2 py-1 rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-40"
              >
                Cash = Grand
              </button>
              <button
                type="button"
                title="Clear cash, card, and UPI amounts"
                onClick={() => clearPaymentFields().catch(() => {})}
                className="text-xs px-2 py-1 rounded border border-gray-300 bg-gray-50 hover:bg-gray-100"
              >
                Clear tenders
              </button>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={doHold}
                className="flex-1 py-2 rounded-lg border border-gray-300 font-medium hover:bg-gray-50"
              >
                Hold bill
              </button>
              <button
                type="button"
                disabled={checkoutBusy || lines.length === 0}
                onClick={doCheckout}
                className="flex-1 py-2 rounded-lg bg-gray-900 text-white font-semibold disabled:opacity-40"
              >
                {checkoutBusy ? "Saving…" : "Checkout"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {searchOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-16 px-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Search products</h3>
              <button type="button" className="text-sm underline" onClick={() => setSearchOpen(false)}>
                Close (Esc)
              </button>
            </div>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4"
              placeholder="Type at least 2 characters…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              autoFocus
            />
            <div className="overflow-y-auto flex-1 space-y-2">
              {searchResults.map((p) => (
                <div
                  key={`${p.product_id ?? p.id}-${p.variant_id ?? "base"}`}
                  className="flex items-center justify-between border border-gray-100 rounded-lg p-3 gap-3"
                >
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-gray-600">
                      ₹{Number(p.price).toFixed(2)} · GST {Number(p.gst_percent).toFixed(0)}% · Stock{" "}
                      {p.available ?? 0}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-sm"
                    onClick={() => addProductFromSearch(p)}
                  >
                    Add
                  </button>
                </div>
              ))}
              {searchQ.trim().length >= 2 && searchResults.length === 0 && (
                <p className="text-center text-gray-500 py-8">No products</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
