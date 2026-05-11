import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../api/client.js";

const emptyAddress = {
  full_name: "",
  phone: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  pincode: "",
};

function addressSummary(addr) {
  return [addr.address_line1, addr.address_line2, addr.city, addr.state, addr.pincode].filter(Boolean).join(", ");
}

export default function Account() {
  const [me, setMe] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyAddress);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    Promise.all([apiJson("/api/auth/me"), apiJson("/api/me/addresses").catch(() => ({ addresses: [] }))])
      .then(([meData, addressData]) => {
        setMe(meData);
        setAddresses(Array.isArray(addressData.addresses) ? addressData.addresses : []);
      })
      .catch(() => setErr("Not signed in"))
      .finally(() => setLoading(false));
  }, []);

  const user = me?.user ?? null;
  const isSignedOut = !!err || (me && !user);
  const heading = useMemo(() => (editingId ? "Update saved address" : "Add a saved address"), [editingId]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startEdit(address) {
    setEditingId(address.id);
    setMsg(null);
    setErr(null);
    setForm({
      full_name: address.full_name ?? "",
      phone: address.phone ?? "",
      address_line1: address.address_line1 ?? "",
      address_line2: address.address_line2 ?? "",
      city: address.city ?? "",
      state: address.state ?? "",
      pincode: address.pincode ?? "",
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyAddress);
  }

  async function submitAddress(e) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const payload = { ...form };
      const res = editingId
        ? await apiJson(`/api/me/addresses/${encodeURIComponent(editingId)}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await apiJson("/api/me/addresses", {
            method: "POST",
            body: JSON.stringify(payload),
          });
      const saved = res.address;
      setAddresses((prev) => {
        if (editingId) {
          return prev.map((row) => (row.id === saved.id ? saved : row));
        }
        return [...prev, saved].sort((a, b) => Number(a.id) - Number(b.id));
      });
      setMsg(editingId ? "Address updated." : "Address saved for future checkout.");
      resetForm();
    } catch (e2) {
      setErr(e2.body?.error || e2.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeAddress(addressId) {
    const address = addresses.find((row) => row.id === addressId);
    const ok = window.confirm(`Delete saved address for ${address?.full_name || "this contact"}?`);
    if (!ok) return;
    setDeletingId(addressId);
    setErr(null);
    setMsg(null);
    try {
      await apiJson(`/api/me/addresses/${encodeURIComponent(addressId)}`, { method: "DELETE" });
      setAddresses((prev) => prev.filter((row) => row.id !== addressId));
      if (editingId === addressId) resetForm();
      setMsg("Address removed.");
    } catch (e2) {
      setErr(e2.body?.error || e2.message);
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return <p className="py-20 text-center text-slate-600">Loading account…</p>;
  }

  if (isSignedOut) {
    return (
      <section className="bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] py-16">
        <div className="mx-auto max-w-xl px-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">Account</p>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">Sign in to manage your account</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Save delivery addresses, track orders, and keep your wishlist ready for the next purchase.
            </p>
            <Link
              to="/login"
              className="mt-8 inline-flex rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-black"
            >
              Login
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_55%,#ffffff_100%)] py-10 md:py-14">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_1.55fr]">
          <aside className="space-y-6">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-900 text-white shadow-[0_28px_90px_rgba(15,23,42,0.28)]">
              <div className="bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,0.45),transparent_38%),linear-gradient(135deg,#0f172a,#111827_55%,#1e293b)] p-7">
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-300">My Account</p>
                <h1 className="mt-3 text-3xl font-black tracking-tight">{user.name}</h1>
                <p className="mt-2 text-sm text-slate-300">{user.email}</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-100">
                    {user.role || "customer"}
                  </span>
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
                    {addresses.length} saved {addresses.length === 1 ? "address" : "addresses"}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Quick Actions</p>
              <div className="mt-4 grid gap-3">
                <Link
                  to="/orders"
                  className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <span>My orders</span>
                  <span aria-hidden="true">→</span>
                </Link>
                <Link
                  to="/wishlist"
                  className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <span>Wishlist</span>
                  <span aria-hidden="true">→</span>
                </Link>
                {user.isStaffPanel || user.role === "admin" || user.role === "staff" ? (
                  <Link
                    to="/admin"
                    className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <span>Admin dashboard</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                ) : null}
              </div>
            </div>
          </aside>

          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] md:p-7">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Address Book</p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">Saved delivery addresses</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Add an address once and pick it quickly at checkout whenever you place a future order.
                  </p>
                </div>
                <Link
                  to="/checkout"
                  className="inline-flex rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Go to checkout
                </Link>
              </div>

              {msg ? (
                <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{msg}</div>
              ) : null}
              {err ? (
                <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
              ) : null}

              <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.95fr]">
                <div className="grid gap-4 sm:grid-cols-2">
                  {addresses.length === 0 ? (
                    <div className="sm:col-span-2 rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                      <p className="text-sm font-semibold text-slate-700">No saved addresses yet.</p>
                      <p className="mt-2 text-sm text-slate-500">Add one from the form and it will be available in checkout.</p>
                    </div>
                  ) : null}
                  {addresses.map((address) => {
                    const isEditing = editingId === address.id;
                    return (
                      <article
                        key={address.id}
                        className={`rounded-3xl border p-5 shadow-sm transition ${
                          isEditing ? "border-sky-300 bg-sky-50/70 shadow-sky-100" : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-base font-bold text-slate-900">{address.full_name}</h3>
                            <p className="mt-1 text-sm text-slate-500">{address.phone}</p>
                          </div>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            #{address.id}
                          </span>
                        </div>
                        <p className="mt-4 text-sm leading-6 text-slate-700">{addressSummary(address)}</p>
                        <div className="mt-5 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={() => startEdit(address)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                            disabled={deletingId === address.id}
                            onClick={() => removeAddress(address.id)}
                          >
                            {deletingId === address.id ? "Removing…" : "Delete"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5 shadow-inner shadow-slate-200/50">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{heading}</p>
                  <form onSubmit={submitAddress} className="mt-4 space-y-3">
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">Full name</span>
                      <input
                        required
                        className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none ring-0 transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5"
                        value={form.full_name}
                        onChange={(e) => setField("full_name", e.target.value)}
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-sm font-semibold text-slate-700">Phone</span>
                        <input
                          required
                          className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5"
                          value={form.phone}
                          onChange={(e) => setField("phone", e.target.value)}
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-semibold text-slate-700">Pincode</span>
                        <input
                          required
                          className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5"
                          value={form.pincode}
                          onChange={(e) => setField("pincode", e.target.value)}
                        />
                      </label>
                    </div>
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">Address line 1</span>
                      <input
                        required
                        className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5"
                        value={form.address_line1}
                        onChange={(e) => setField("address_line1", e.target.value)}
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">Address line 2</span>
                      <input
                        className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5"
                        value={form.address_line2}
                        onChange={(e) => setField("address_line2", e.target.value)}
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-sm font-semibold text-slate-700">City</span>
                        <input
                          required
                          className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5"
                          value={form.city}
                          onChange={(e) => setField("city", e.target.value)}
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-semibold text-slate-700">State</span>
                        <input
                          required
                          className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5"
                          value={form.state}
                          onChange={(e) => setField("state", e.target.value)}
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={saving}
                        className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-black disabled:opacity-60"
                      >
                        {saving ? "Saving…" : editingId ? "Update address" : "Save address"}
                      </button>
                      {editingId ? (
                        <button
                          type="button"
                          className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-white"
                          onClick={resetForm}
                        >
                          Cancel edit
                        </button>
                      ) : null}
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
