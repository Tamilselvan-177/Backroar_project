import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiJson, bootstrapCsrf } from "../api/client.js";

export default function ResetPassword() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const token = sp.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (!token) {
      setError("Missing reset token.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await bootstrapCsrf();
      await apiJson("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token,
          password,
          confirm_password: confirmPassword,
        }),
      });
      setOk(true);
      setTimeout(() => navigate("/login"), 900);
    } catch (err) {
      setError(err.body?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-10 bg-gradient-to-b from-gray-50 to-gray-200">
      <div className="w-full max-w-md rounded-2xl border border-gray-300 bg-white p-8 shadow-2xl">
        <h1 className="text-2xl font-black tracking-wide uppercase">Reset password</h1>
        {!token ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Invalid reset link. Please request a new one.
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}
        {ok ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Password updated successfully. Redirecting to login…
          </div>
        ) : null}
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <input
            className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3"
            type="password"
            required
            minLength={6}
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={!token || loading || ok}
          />
          <input
            className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3"
            type="password"
            required
            minLength={6}
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={!token || loading || ok}
          />
          <button
            type="submit"
            disabled={!token || loading || ok}
            className="w-full rounded-xl bg-black py-3 font-bold uppercase tracking-wider text-white disabled:opacity-60"
          >
            {loading ? "Please wait…" : "Update password"}
          </button>
        </form>
        <p className="mt-5 text-sm">
          <Link to="/login" className="font-semibold underline">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
