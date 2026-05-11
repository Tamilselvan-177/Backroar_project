import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiJson } from "../../../api/client.js";

export default function AdminReturnsPage() {
  const [searchParams] = useSearchParams();
  const [stores, setStores] = useState([]);
  const [bill, setBill] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [line, setLine] = useState(null);
  const [form, setForm] = useState({
    store_id: "",
    quantity: 1,
    refund_method: "cash",
    refund_amount: "",
    gst_adjustment: "",
    reason: "",
  });

  useEffect(() => {
    const pre = searchParams.get("bill") ?? searchParams.get("order_number") ?? "";
    if (pre) setBill(pre);
  }, [searchParams]);

  useEffect(() => {
    apiJson("/api/admin/stores/active-list")
      .then((d) => {
        const list = d.stores ?? [];
        setStores(list);
        if (list[0]) setForm((f) => ({ ...f, store_id: f.store_id || String(list[0].id) }));
      })
      .catch(() => {});
  }, []);

  const search = useCallback(async () => {
    setErr(null);
    setSearchResult(null);
    setLine(null);
    const q = bill.trim();
    if (!q) return;
    setLoading(true);
    try {
      const r = await apiJson(`/api/admin/returns/search?bill_number=${encodeURIComponent(q)}`);
      setSearchResult(r);
      if (!r.success) setErr(r.message || "Not found");
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [bill]);

  const selectLine = (item) => {
    setLine(item);
    const rem = Number(item.remaining_qty) || 0;
    const qty = Math.min(Number(item.quantity) || 1, rem);
    const refund =
      item.line_total != null && item.quantity
        ? String((Number(item.line_total) / Math.max(1, Number(item.quantity))) * qty)
        : "";
    const gst =
      item.gst_amount != null && item.quantity
        ? String((Number(item.gst_amount) / Math.max(1, Number(item.quantity))) * qty)
        : "";
    setForm((f) => ({
      ...f,
      quantity: qty > 0 ? qty : 1,
      refund_amount: refund,
      gst_adjustment: gst,
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!searchResult?.success || !line) return;
    setErr(null);
    setLoading(true);
    const body = {
      store_id: Number(form.store_id) || 0,
      product_id: Number(line.product_id),
      quantity: Number(form.quantity) || 1,
      refund_method: form.refund_method,
      refund_amount: form.refund_amount === "" ? 0 : Number(form.refund_amount),
      gst_adjustment: form.gst_adjustment === "" ? 0 : Number(form.gst_adjustment),
      reason: form.reason,
    };
    if (searchResult.type === "pos") {
      body.pos_order_id = searchResult.order.id;
      body.pos_order_item_id = line.id;
    } else {
      body.order_id = searchResult.order.id;
      body.order_line_index = line.order_line_index ?? line.id;
    }
    try {
      await apiJson("/api/admin/returns", { method: "POST", body: JSON.stringify(body) });
      setBill("");
      setSearchResult(null);
      setLine(null);
      alert("Return processed.");
    } catch (e) {
      setErr(e.body?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (searchResult?.success && searchResult.type === "pos" && searchResult.order?.store_id) {
      setForm((f) => ({ ...f, store_id: String(searchResult.order.store_id) }));
    }
  }, [searchResult]);

  const items = searchResult?.items ?? [];

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-black">Process return</h1>
        <p className="text-gray-600 text-sm mt-1">
          Search POS or web order by bill number, pick a line, confirm refund and store credit.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          className="border border-gray-300 rounded-lg px-3 py-2 min-w-[200px]"
          placeholder="Bill / order number"
          value={bill}
          onChange={(e) => setBill(e.target.value)}
        />
        <button
          type="button"
          disabled={loading}
          onClick={search}
          className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold"
        >
          Search
        </button>
      </div>

      {err ? <p className="text-red-600 text-sm">{err}</p> : null}

      {searchResult?.success ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm font-bold text-gray-800 mb-2">
            {searchResult.type === "pos" ? "POS order" : "Web order"} · {searchResult.order?.order_number}
          </p>
          <div className="space-y-2">
            {items.map((it) => (
              <button
                key={`${it.id}-${it.order_line_index ?? ""}`}
                type="button"
                disabled={(it.remaining_qty ?? 0) <= 0}
                onClick={() => selectLine(it)}
                className={`w-full text-left rounded-lg border p-3 text-sm ${
                  line?.id === it.id && (line?.order_line_index ?? null) === (it.order_line_index ?? null)
                    ? "border-gray-900 bg-gray-50"
                    : "border-gray-200 hover:border-gray-400"
                } ${(it.remaining_qty ?? 0) <= 0 ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <span className="font-semibold">{it.product_name}</span> · Qty {it.quantity} · Remaining{" "}
                {it.remaining_qty}
                {it.sku ? <span className="text-gray-500"> · SKU {it.sku}</span> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {line ? (
        <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 max-w-md">
          <h2 className="font-bold">Return details</h2>
          <label className="block text-sm">
            <span className="text-gray-600">Store (stock credit)</span>
            <select
              required
              className="mt-1 w-full border rounded-lg px-3 py-2"
              value={form.store_id}
              onChange={(e) => setForm({ ...form, store_id: e.target.value })}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Quantity</span>
            <input
              type="number"
              min={1}
              max={line.remaining_qty}
              className="mt-1 w-full border rounded-lg px-3 py-2"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Refund method</span>
            <select
              className="mt-1 w-full border rounded-lg px-3 py-2"
              value={form.refund_method}
              onChange={(e) => setForm({ ...form, refund_method: e.target.value })}
            >
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="upi">UPI</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Refund amount (₹)</span>
            <input
              type="number"
              step="0.01"
              className="mt-1 w-full border rounded-lg px-3 py-2"
              value={form.refund_amount}
              onChange={(e) => setForm({ ...form, refund_amount: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">GST adjustment (₹)</span>
            <input
              type="number"
              step="0.01"
              className="mt-1 w-full border rounded-lg px-3 py-2"
              value={form.gst_adjustment}
              onChange={(e) => setForm({ ...form, gst_adjustment: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Reason</span>
            <input
              className="mt-1 w-full border rounded-lg px-3 py-2"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg bg-gray-900 text-white font-semibold disabled:opacity-50"
          >
            Process return
          </button>
        </form>
      ) : null}
    </div>
  );
}
