import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson } from "../../../api/client.js";

function toDatetimeLocalValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function CouponEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isCreate = !id;
  const [form, setForm] = useState({
    code: "",
    discount_type: "PERCENT",
    discount_value: "",
    min_purchase: "0",
    max_discount: "0",
    usage_limit: "0",
    per_user_limit: "0",
    valid_from: "",
    valid_to: "",
    is_active: true,
    description: "",
  });
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (isCreate) return;
    apiJson(`/api/admin/coupons/${id}`)
      .then((d) => {
        const c = d.coupon;
        setForm({
          code: c.code ?? "",
          discount_type: c.discount_type === "FIXED" ? "FIXED" : "PERCENT",
          discount_value: String(c.discount_value ?? ""),
          min_purchase: String(c.min_purchase ?? 0),
          max_discount: String(c.max_discount ?? 0),
          usage_limit: String(c.usage_limit ?? 0),
          per_user_limit: String(c.per_user_limit ?? 0),
          valid_from: toDatetimeLocalValue(c.valid_from),
          valid_to: toDatetimeLocalValue(c.valid_to),
          is_active: !!(c.is_active === 1 || c.is_active === true),
          description: c.description ?? "",
        });
      })
      .catch((e) => setErr(e.message));
  }, [id, isCreate]);

  const save = async (e) => {
    e.preventDefault();
    setErr(null);
    const payload = {
      code: form.code,
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value),
      min_purchase: Number(form.min_purchase),
      max_discount: form.discount_type === "FIXED" ? 0 : Number(form.max_discount),
      usage_limit: Number(form.usage_limit),
      per_user_limit: Number(form.per_user_limit),
      valid_from: form.valid_from,
      valid_to: form.valid_to,
      is_active: form.is_active,
      description: form.description,
    };
    try {
      if (isCreate) {
        await apiJson("/api/admin/coupons", { method: "POST", body: JSON.stringify(payload) });
      } else {
        await apiJson(`/api/admin/coupons/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      navigate("/admin/coupons");
    } catch (e) {
      const b = e.body;
      if (b?.error === "code_taken") setErr("That coupon code is already in use.");
      else if (b?.error === "dates_required") setErr("Valid from and valid to are required.");
      else if (b?.error === "valid_to_before_from") setErr("End must be after start.");
      else if (b?.error === "discount_value_invalid") setErr("Discount value must be greater than zero.");
      else if (b?.error === "percent_too_high") setErr("Percentage cannot exceed 100.");
      else if (b?.error === "code_invalid") setErr("Code must be 3–50 characters.");
      else setErr(e.message);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="mb-4">
        <Link to="/admin/coupons" className="text-sm text-[var(--brand-accent)] underline">
          ← Coupons
        </Link>
      </div>
      <h1 className="text-2xl font-black mb-4">{isCreate ? "Add coupon" : "Edit coupon"}</h1>
      {err ? <p className="text-red-600 mb-4">{err}</p> : null}

      <form onSubmit={save} className="space-y-4 bg-white border border-gray-200 rounded-xl p-6">
        <label className="block">
          <span className="text-sm font-semibold">Code</span>
          <input
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 uppercase"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            required
            minLength={3}
            maxLength={50}
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Discount type</span>
          <select
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            value={form.discount_type}
            onChange={(e) => setForm((f) => ({ ...f, discount_type: e.target.value }))}
          >
            <option value="PERCENT">Percent</option>
            <option value="FIXED">Fixed amount (₹)</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">{form.discount_type === "PERCENT" ? "Percent off" : "Amount off (₹)"}</span>
          <input
            type="number"
            step="any"
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            value={form.discount_value}
            onChange={(e) => setForm((f) => ({ ...f, discount_value: e.target.value }))}
            required
            min={0.01}
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Minimum purchase (₹)</span>
          <input
            type="number"
            step="any"
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            value={form.min_purchase}
            onChange={(e) => setForm((f) => ({ ...f, min_purchase: e.target.value }))}
            min={0}
          />
        </label>
        {form.discount_type === "PERCENT" ? (
          <label className="block">
            <span className="text-sm font-semibold">Max discount cap (₹, 0 = none)</span>
            <input
              type="number"
              step="any"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
              value={form.max_discount}
              onChange={(e) => setForm((f) => ({ ...f, max_discount: e.target.value }))}
              min={0}
            />
          </label>
        ) : null}
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-semibold">Global usage limit (0 = unlimited)</span>
            <input
              type="number"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
              value={form.usage_limit}
              onChange={(e) => setForm((f) => ({ ...f, usage_limit: e.target.value }))}
              min={0}
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Per-user limit (0 = unlimited)</span>
            <input
              type="number"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
              value={form.per_user_limit}
              onChange={(e) => setForm((f) => ({ ...f, per_user_limit: e.target.value }))}
              min={0}
            />
          </label>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-semibold">Valid from</span>
            <input
              type="datetime-local"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
              value={form.valid_from}
              onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))}
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Valid to</span>
            <input
              type="datetime-local"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
              value={form.valid_to}
              onChange={(e) => setForm((f) => ({ ...f, valid_to: e.target.value }))}
              required
            />
          </label>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
          />
          <span className="text-sm font-semibold">Active</span>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Description</span>
          <textarea
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[64px]"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </label>
        <div className="flex gap-3 pt-2">
          <button type="submit" className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold">
            Save
          </button>
          <Link to="/admin/coupons" className="px-4 py-2 rounded-lg border border-gray-300 text-sm">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
