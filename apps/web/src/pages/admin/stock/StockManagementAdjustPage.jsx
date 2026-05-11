import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiJson } from "../../../api/client.js";

const REASONS = [
  ["PURCHASE", "Purchase / receipt"],
  ["ADJUST", "Manual adjustment"],
  ["DAMAGE", "Damage"],
  ["LOSS", "Loss / theft"],
  ["WASTAGE", "Wastage"],
  ["CORRECTION", "Correction"],
  ["RETURN", "Return"],
];

export default function StockManagementAdjustPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const variantId = searchParams.get("variant_id") || "";
  const storeId = searchParams.get("store_id") || "";

  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("add");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("ADJUST");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    if (!variantId || !storeId) {
      setErr("variant_id and store_id are required.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    apiJson(
      `/api/admin/stock-management/adjust-form?variant_id=${encodeURIComponent(variantId)}&store_id=${encodeURIComponent(storeId)}`,
    )
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [variantId, storeId]);

  useEffect(() => {
    load();
  }, [load]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      await apiJson("/api/admin/stock-management/adjust", {
        method: "POST",
        body: JSON.stringify({
          variant_id: Number(variantId),
          store_id: Number(storeId),
          action,
          quantity: Math.max(1, Math.floor(Number(quantity) || 1)),
          reason,
          notes,
        }),
      });
      navigate(`/admin/stock-management/product/${data.product.id}?store_id=${encodeURIComponent(storeId)}`);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (!variantId || !storeId) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">Open this page from a product’s Adjust link (needs variant and store).</p>
        <Link to="/admin/stock-management" className="text-blue-600 font-semibold">
          Inventory
        </Link>
      </div>
    );
  }
  if (err && !data) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">{err}</p>
        <Link to="/admin/stock-management" className="text-blue-600 font-semibold">
          Inventory
        </Link>
      </div>
    );
  }
  if (loading && !data) return <p className="text-gray-600">Loading…</p>;
  if (!data?.product) return null;

  const storeName = (data.stores || []).find((s) => String(s.id) === String(storeId))?.name ?? "";

  return (
    <div className="space-y-6 max-w-xl">
      <Link
        to={`/admin/stock-management/product/${data.product.id}?store_id=${encodeURIComponent(storeId)}`}
        className="text-blue-600 font-semibold text-sm hover:underline"
      >
        ← Back to product
      </Link>
      <h1 className="text-2xl font-black text-gray-900">Adjust stock</h1>
      <p className="text-gray-600">
        {data.product.name} — <span className="font-semibold">{data.variant.variant_name}</span>
      </p>

      <div className="p-4 rounded-xl border border-blue-200 bg-blue-50 flex justify-between gap-4">
        <div>
          <p className="text-sm text-blue-800">Current stock</p>
          <p className="text-2xl font-bold text-blue-950">{data.current_stock}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-blue-800">Store</p>
          <p className="font-semibold text-blue-950">{storeName}</p>
        </div>
      </div>

      {err ? <p className="text-red-600 text-sm">{err}</p> : null}

      <form onSubmit={onSubmit} className="space-y-5 p-6 bg-white border border-gray-200 rounded-xl">
        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2">Action</p>
          <div className="grid grid-cols-2 gap-3">
            <label
              className={`flex flex-col p-3 border-2 rounded-lg cursor-pointer ${action === "add" ? "border-green-500 bg-green-50" : "border-gray-200"}`}
            >
              <input type="radio" name="action" value="add" checked={action === "add"} onChange={() => setAction("add")} className="sr-only" />
              <span className="font-semibold text-green-800">Add</span>
              <span className="text-xs text-gray-500">Increase qty</span>
            </label>
            <label
              className={`flex flex-col p-3 border-2 rounded-lg cursor-pointer ${action === "remove" ? "border-red-500 bg-red-50" : "border-gray-200"}`}
            >
              <input
                type="radio"
                name="action"
                value="remove"
                checked={action === "remove"}
                onChange={() => setAction("remove")}
                className="sr-only"
              />
              <span className="font-semibold text-red-800">Remove</span>
              <span className="text-xs text-gray-500">Decrease qty</span>
            </label>
          </div>
        </div>
        <label className="block text-sm font-semibold text-gray-800">
          Quantity
          <input
            type="number"
            min={1}
            required
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label className="block text-sm font-semibold text-gray-800">
          Reason
          <select
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            {REASONS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold text-gray-800">
          Notes (optional)
          <textarea
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-lg bg-gray-900 text-white font-semibold hover:bg-gray-800 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Apply adjustment"}
        </button>
      </form>
    </div>
  );
}
