import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiJson } from "../../../api/client.js";

function buildQuery(sp) {
  const p = new URLSearchParams();
  const sid = sp.get("source_id");
  const did = sp.get("dest_id");
  const bc = sp.get("barcode");
  const q = sp.get("q");
  if (sid) p.set("source_id", sid);
  if (did) p.set("dest_id", did);
  if (bc) p.set("barcode", bc);
  if (q) p.set("q", q);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export default function StockTransferPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [payload, setPayload] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [barcode, setBarcode] = useState("");
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    const qs = buildQuery(searchParams);
    apiJson(`/api/admin/stock-transfer/state${qs}`)
      .then((d) => {
        setPayload(d);
        setBarcode("");
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [searchParams, refreshKey]);

  useEffect(() => {
    load();
  }, [load]);

  const setStore = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "0") next.delete(key);
    else next.set(key, String(value));
    if (key === "source_id") {
      const dest = next.get("dest_id");
      if (dest && value && dest === String(value)) {
        next.delete("dest_id");
      }
    }
    next.delete("barcode");
    next.delete("q");
    setSearchParams(next, { replace: true });
  };

  const runBarcodeSearch = (e) => {
    e.preventDefault();
    const next = new URLSearchParams(searchParams);
    const b = String(barcode).trim();
    if (b) next.set("barcode", b);
    else next.delete("barcode");
    next.delete("q");
    setSearchParams(next, { replace: true });
  };

  const runTextSearch = (e) => {
    e.preventDefault();
    const next = new URLSearchParams(searchParams);
    const q = String(search).trim();
    if (q.length >= 2) next.set("q", q);
    else next.delete("q");
    next.delete("barcode");
    setSearchParams(next, { replace: true });
  };

  const addToCart = async (row, q) => {
    const sid = Number(payload?.source_store_id || 0);
    if (!sid) {
      setErr("Select a source store first.");
      return;
    }
    setErr(null);
    try {
      await apiJson("/api/admin/stock-transfer/cart/add", {
        method: "POST",
        body: JSON.stringify({
          source_store_id: sid,
          product_id: row.product_id,
          variant_id: row.variant_id,
          quantity: Math.max(1, Math.floor(Number(q) || 1)),
        }),
      });
      const next = new URLSearchParams(searchParams);
      next.delete("barcode");
      next.delete("q");
      setSearchParams(next, { replace: true });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setErr(e.body?.error === "insufficient_stock" ? "Not enough stock at source." : e.message);
    }
  };

  const addSelected = async (e) => {
    e.preventDefault();
    if (!payload?.selected) return;
    await addToCart(payload.selected, qty);
    setQty(1);
  };

  const removeLine = async (lineKey) => {
    setErr(null);
    try {
      await apiJson("/api/admin/stock-transfer/cart/remove", {
        method: "POST",
        body: JSON.stringify({ line_key: lineKey }),
      });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setErr(e.message);
    }
  };

  const clearCart = async () => {
    if (!window.confirm("Clear the transfer list?")) return;
    setErr(null);
    try {
      await apiJson("/api/admin/stock-transfer/cart/clear", { method: "POST", body: "{}" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setErr(e.message);
    }
  };

  const commit = async () => {
    const dest = Number(payload?.dest_store_id || 0);
    const source = Number(payload?.source_store_id || 0);
    if (!dest || !source || dest === source) {
      setErr("Choose a destination store different from the source.");
      return;
    }
    if (!window.confirm("Complete this transfer? Quantities will move between stores.")) return;
    setErr(null);
    try {
      const r = await apiJson("/api/admin/stock-transfer/commit", {
        method: "POST",
        body: JSON.stringify({ dest_store_id: dest }),
      });
      alert(`Transfer completed: ${r.transfer_number}`);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setErr(e.body?.error === "transfer_failed" ? "Transfer failed (check stock)." : e.message);
    }
  };

  const stores = payload?.stores ?? [];
  const sourceIdNum = Number(payload?.source_store_id || 0);
  const destStoreOptions = stores.filter((s) => Number(s.id) !== sourceIdNum);
  const cart = payload?.cart ?? [];

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Stock transfer</h1>
        <p className="text-sm text-gray-600 mt-2 leading-relaxed max-w-3xl">
          Move inventory between stores. With multiple stores, quantities follow per-store rows; with one active store the
          API falls back to embedded product or variant stock.
        </p>
        <p className="mt-2">
          <Link to="/admin/stock-transfer/history" className="text-sm text-[var(--brand-accent)] underline">
            View transfer history
          </Link>
        </p>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{err}</div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="font-semibold">Source store</span>
            <select
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
              value={String(payload?.source_store_id || "")}
              onChange={(e) => setStore("source_id", e.target.value)}
            >
              <option value="">Select…</option>
              {stores.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-semibold">Destination store</span>
            <select
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
              value={String(payload?.dest_store_id || "")}
              onChange={(e) => setStore("dest_id", e.target.value)}
              disabled={!sourceIdNum}
            >
              <option value="">{sourceIdNum ? "Select…" : "Choose source first"}</option>
              {destStoreOptions.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {Number(payload?.source_store_id) > 0 ? (
          <>
            <form onSubmit={runBarcodeSearch} className="flex flex-wrap gap-2 items-end">
              <label className="flex-1 min-w-[200px] text-sm">
                <span className="font-semibold">Barcode / SKU</span>
                <input
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Scan or type"
                />
              </label>
              <button type="submit" className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold">
                Look up
              </button>
            </form>

            <form onSubmit={runTextSearch} className="flex flex-wrap gap-2 items-end">
              <label className="flex-1 min-w-[200px] text-sm">
                <span className="font-semibold">Search name (min 2 chars)</span>
                <input
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <button type="submit" className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold">
                Search
              </button>
            </form>

            {payload?.error_detail ? (
              <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {payload.error_detail}
              </div>
            ) : null}

            {payload?.selected ? (
              <form onSubmit={addSelected} className="border border-gray-100 rounded-lg p-3 space-y-2">
                <div className="font-semibold text-gray-900">{payload.selected.name}</div>
                <div className="text-xs text-gray-500">
                  Available at source: <strong>{payload.selected.available}</strong>
                </div>
                <div className="flex gap-2 items-center">
                  <label className="text-sm">
                    Qty
                    <input
                      type="number"
                      min={1}
                      max={payload.selected.available}
                      className="ml-2 w-20 border border-gray-300 rounded px-2 py-1"
                      value={qty}
                      onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                    />
                  </label>
                  <button type="submit" className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-sm">
                    Add to list
                  </button>
                </div>
              </form>
            ) : null}

            {(payload?.results ?? []).length > 0 ? (
              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg max-h-56 overflow-y-auto">
                {payload.results.map((r) => (
                  <li key={`${r.product_id}-${r.variant_id ?? "p"}`} className="p-2 flex justify-between gap-2 text-sm">
                    <span>
                      {r.name} <span className="text-gray-500">({r.available})</span>
                    </span>
                    <button
                      type="button"
                      className="text-[var(--brand-accent)] underline shrink-0"
                      onClick={() => addToCart(r, 1)}
                    >
                      Add 1
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-gray-500">Select a source store to scan or search products.</p>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-bold text-gray-900">Transfer list</h2>
          {cart.length > 0 ? (
            <button type="button" className="text-sm text-red-600 underline" onClick={clearCart}>
              Clear
            </button>
          ) : null}
        </div>
        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : cart.length === 0 ? (
          <p className="text-sm text-gray-500">No lines yet.</p>
        ) : (
          <ul className="space-y-2">
            {cart.map((c) => (
              <li key={c.line_key} className="flex justify-between text-sm border-b border-gray-50 pb-2">
                <span>
                  {c.name} × <strong>{c.qty}</strong>
                </span>
                <button type="button" className="text-red-600 underline text-xs" onClick={() => removeLine(c.line_key)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          disabled={!cart.length}
          onClick={commit}
          className="mt-4 w-full sm:w-auto px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-40"
        >
          Complete transfer
        </button>
      </div>

      <p className="text-xs text-gray-500">
        <Link to="/admin" className="text-[var(--brand-accent)] underline">
          Dashboard
        </Link>
      </p>
    </div>
  );
}
