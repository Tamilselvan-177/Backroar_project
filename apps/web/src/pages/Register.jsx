import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiJson, bootstrapCsrf } from "../api/client.js";
import { notifyAuthSessionChanged } from "../lib/authCrossTab.js";

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirm_password: "",
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  function setField(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await bootstrapCsrf();
      const res = await apiJson("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(form),
      });
      await bootstrapCsrf();
      notifyAuthSessionChanged();
      navigate(res.redirect || "/account");
    } catch (err) {
      const d = err.body?.details;
      setError(d ? JSON.stringify(d) : err.body?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-10 bg-gradient-to-b from-gray-50 to-gray-200">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-300 p-8">
        <h1 className="text-2xl font-black text-center mb-6 uppercase tracking-wide">Create account</h1>
        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}
        <form onSubmit={onSubmit} className="space-y-3">
          <input
            className="w-full rounded-xl border px-4 py-3"
            placeholder="Full name"
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            required
            minLength={3}
          />
          <input
            className="w-full rounded-xl border px-4 py-3"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setField("email", e.target.value)}
            required
          />
          <input
            className="w-full rounded-xl border px-4 py-3"
            placeholder="Phone (10 digits)"
            value={form.phone}
            onChange={(e) => setField("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
            required
          />
          <input
            className="w-full rounded-xl border px-4 py-3"
            type="password"
            placeholder="Password (min 6)"
            value={form.password}
            onChange={(e) => setField("password", e.target.value)}
            required
            minLength={6}
          />
          <input
            className="w-full rounded-xl border px-4 py-3"
            type="password"
            placeholder="Confirm password"
            value={form.confirm_password}
            onChange={(e) => setField("confirm_password", e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-black text-white font-bold py-3 uppercase tracking-wider"
          >
            {loading ? "Please wait…" : "Register"}
          </button>
        </form>
        <p className="text-center text-sm mt-4">
          <Link to="/login" className="font-bold underline">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
