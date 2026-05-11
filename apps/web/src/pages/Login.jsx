import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { apiJson, bootstrapCsrf } from "../api/client.js";
import { notifyAuthSessionChanged } from "../lib/authCrossTab.js";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await bootstrapCsrf();
      const res = await apiJson("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await bootstrapCsrf();
      notifyAuthSessionChanged();
      const next = searchParams.get("next");
      const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
      navigate(safeNext || res.redirect || "/account");
    } catch (err) {
      setError(err.body?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 login-shell bg-gradient-to-b from-gray-50 to-gray-200">
      <div className="w-full max-w-md login-card bg-white rounded-2xl shadow-2xl border border-gray-300 p-8">
        <div className="text-center mb-6">
          <span className="inline-block text-xs font-bold tracking-widest uppercase bg-black text-white px-3 py-1 rounded-full">
            Secure login
          </span>
          <h1 className="text-2xl font-black mt-4 tracking-wide uppercase">Login</h1>
        </div>
        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Email</label>
            <input
              className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 outline-none focus:border-black focus:ring-2 focus:ring-black/10"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Password</label>
            <input
              className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 outline-none focus:border-black focus:ring-2 focus:ring-black/10"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-black text-white font-bold py-3 uppercase tracking-wider hover:bg-gray-900 disabled:opacity-60"
          >
            {loading ? "Please wait…" : "Sign in"}
          </button>
        </form>
        <p className="text-center text-sm text-gray-600 mt-6">
          No account? <Link to="/register" className="font-bold text-black underline">Register</Link>
        </p>
      </div>
    </div>
  );
}
