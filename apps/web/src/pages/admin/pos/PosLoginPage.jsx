import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiJson } from "../../../api/client.js";
import { P } from "../adminPermKeys.js";
import { useAdminPerm } from "../AdminPermContext.jsx";

export default function PosLoginPage() {
  const navigate = useNavigate();
  const { has } = useAdminPerm();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [stores, setStores] = useState([]);
  const [years, setYears] = useState([]);
  const [counters, setCounters] = useState([]);
  const [storeId, setStoreId] = useState("");
  const [counterId, setCounterId] = useState("");
  const [pin, setPin] = useState("");
  const [finYear, setFinYear] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resume, setResume] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiJson("/api/admin/pos/login-bootstrap")
      .then((data) => {
        if (cancelled) return;
        if (data.billing_active) {
          navigate("/admin/pos/billing", { replace: true });
          return;
        }
        setStores(data.stores ?? []);
        setYears(data.financial_years ?? []);
        if (data.financial_years?.[0]) setFinYear(data.financial_years[0]);
        setResume(data.resume && typeof data.resume.store_id === "number" ? data.resume : null);
      })
      .catch((e) => {
        if (!cancelled) setErr(e.body?.error === "pos_forbidden" ? "You do not have POS access." : e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    const sid = Number(storeId);
    if (!Number.isFinite(sid) || sid <= 0) {
      setCounters([]);
      setCounterId("");
      return;
    }
    let cancelled = false;
    apiJson(`/api/admin/stores/${sid}/counters`)
      .then((data) => {
        if (cancelled) return;
        setCounters(data.counters ?? []);
        setCounterId("");
      })
      .catch(() => {
        if (!cancelled) {
          setCounters([]);
          setCounterId("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  async function onResume() {
    setErr(null);
    setSubmitting(true);
    try {
      const res = await apiJson("/api/admin/pos/resume", { method: "POST", body: "{}" });
      navigate(res.redirect || "/admin/pos/billing");
    } catch (e) {
      setResume(null);
      setErr(
        e.body?.error === "resume_unavailable"
          ? "Saved counter is no longer available — sign in with PIN below."
          : e.body?.message || e.body?.error || e.message
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onDiscardResume() {
    setErr(null);
    try {
      await apiJson("/api/admin/pos/discard-resume", { method: "POST", body: "{}" });
      setResume(null);
    } catch (e) {
      setErr(e.body?.error || e.message);
    }
  }

  async function onStart(e) {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const res = await apiJson("/api/admin/pos/start", {
        method: "POST",
        body: JSON.stringify({
          store_id: Number(storeId),
          counter_id: Number(counterId),
          counter_pin: pin,
          financial_year: finYear,
        }),
      });
      if (res.redirect) navigate(res.redirect);
      else navigate("/admin/pos/billing");
    } catch (e) {
      const msg =
        e.body?.error === "invalid_pin"
          ? "Invalid counter PIN."
          : e.body?.message || e.body?.error || e.message;
      setErr(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="max-w-lg mx-auto py-12 text-center text-gray-600">Loading POS…</div>;
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900">POS billing</h1>
        <p className="text-sm text-gray-600 mt-1">
          Select shop, counter, and financial year — then enter the counter PIN (demo default after{" "}
          <code className="text-xs bg-gray-100 px-1 rounded">npm run migrations</code>: store{" "}
          <strong>MAIN</strong>, PIN <strong>1234</strong>).
        </p>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{err}</div>
      )}

      {resume ? (
        <div className="rounded-xl border border-gray-900 bg-gray-900 text-white p-5 space-y-3 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-100">Continue billing</h2>
          <p className="text-xs text-gray-400 leading-relaxed">
            Reopen the same store and counter without entering the PIN again (this browser login session; clears after 24h or
            if you choose another counter below).
          </p>
          <p className="text-sm font-mono text-gray-200">
            {resume.store_code} · counter {resume.counter_code} · FY {resume.financial_year}
          </p>
          <button
            type="button"
            disabled={submitting}
            onClick={onResume}
            className="w-full py-2.5 rounded-lg bg-white text-gray-900 font-semibold hover:bg-gray-100 disabled:opacity-50"
          >
            {submitting ? "Opening…" : "Open billing"}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={onDiscardResume}
            className="text-xs text-gray-400 underline w-full text-center hover:text-gray-200"
          >
            Use a different store or counter (forget saved counter)
          </button>
        </div>
      ) : null}

      <form onSubmit={onStart} className="space-y-4 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <label className="block text-sm font-medium text-gray-700">
          Store
          <select
            required
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
          >
            <option value="">Select store…</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-gray-700">
          Counter
          <select
            required
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            value={counterId}
            onChange={(e) => setCounterId(e.target.value)}
            disabled={!storeId || counters.length === 0}
          >
            <option value="">{storeId ? "Select counter…" : "Choose a store first"}</option>
            {counters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-gray-700">
          Financial year
          <select
            required
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            value={finYear}
            onChange={(e) => setFinYear(e.target.value)}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-gray-700">
          Counter PIN
          <input
            type="password"
            required
            autoComplete="off"
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 rounded-lg bg-gray-900 text-white font-semibold hover:bg-gray-800 disabled:opacity-50"
        >
          {submitting ? "Starting…" : "Open billing"}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 flex flex-wrap justify-center gap-x-4 gap-y-2">
        {has(P.FINANCE_POS_ORDERS) ? (
          <Link to="/admin/pos/orders" className="text-[var(--brand-accent)] underline">
            POS orders and reprint
          </Link>
        ) : null}
        <Link to="/admin" className="text-[var(--brand-accent)] underline">
          Admin dashboard
        </Link>
      </p>
    </div>
  );
}
