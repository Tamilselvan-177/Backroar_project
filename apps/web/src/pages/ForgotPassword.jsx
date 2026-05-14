import { useState } from "react";
import { Link } from "react-router-dom";
import { apiJson, bootstrapCsrf } from "../api/client.js";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [devLink, setDevLink] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    setDevLink(null);
    try {
      await bootstrapCsrf();
      const res = await apiJson("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(res.message || "If this email exists, reset instructions have been sent.");
      if (res.reset_link) setDevLink(res.reset_link);
    } catch (err) {
      setError(err.body?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-10 bg-gradient-to-b from-gray-50 to-gray-200">
      <div className="w-full max-w-md rounded-2xl border border-gray-300 bg-white p-8 shadow-2xl">
        <h1 className="text-2xl font-black tracking-wide uppercase">Forgot password</h1>
        <p className="mt-2 text-sm text-gray-600">
          Enter your account email. If it exists, we will generate a secure reset link.
        </p>
        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}
        {message ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </div>
        ) : null}
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <input
            className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3"
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-black py-3 font-bold uppercase tracking-wider text-white disabled:opacity-60"
          >
            {loading ? "Please wait…" : "Send reset link"}
          </button>
        </form>
        {devLink ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p className="font-semibold uppercase tracking-wider">Development reset link</p>
            <a className="mt-1 block break-all underline" href={devLink}>
              {devLink}
            </a>
          </div>
        ) : null}
        <p className="mt-5 text-sm">
          <Link to="/login" className="font-semibold underline">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
