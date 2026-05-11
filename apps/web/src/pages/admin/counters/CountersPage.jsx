import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiJson } from "../../../api/client.js";

export default function CountersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const storeFilter = searchParams.get("store_id") || "";
  const [counters, setCounters] = useState([]);
  const [stores, setStores] = useState([]);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    const q = storeFilter && String(storeFilter).match(/^\d+$/) ? `?store_id=${encodeURIComponent(storeFilter)}` : "";
    apiJson(`/api/admin/counters${q}`)
      .then((d) => {
        setCounters(d.counters ?? []);
        setStores(d.stores ?? []);
      })
      .catch((e) => {
        setErr(e.message);
        setCounters([]);
        setStores([]);
      })
      .finally(() => setLoading(false));
  }, [storeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (value) => {
    const v = String(value);
    if (!v || v === "0") {
      const next = new URLSearchParams(searchParams);
      next.delete("store_id");
      setSearchParams(next, { replace: true });
    } else {
      setSearchParams({ store_id: v }, { replace: true });
    }
  };

  const toggleActive = async (id) => {
    setErr(null);
    try {
      await apiJson(`/api/admin/counters/${id}/toggle-active`, { method: "POST", body: "{}" });
      load();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-2xl font-black text-gray-900">Counters</h1>
        <Link
          to={storeFilter ? `/admin/counters/create?store_id=${encodeURIComponent(storeFilter)}` : "/admin/counters/create"}
          className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800"
        >
          Add counter
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          Store filter
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 font-normal"
            value={storeFilter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">All stores</option>
            {stores.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        </label>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{err}</div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : (
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left p-3">Store</th>
                <th className="text-left p-3">Code</th>
                <th className="text-left p-3">Name</th>
                <th className="text-center p-3">Active</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {counters.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">
                    No counters for this filter.
                  </td>
                </tr>
              ) : (
                counters.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-3">
                      <span className="text-gray-900">{c.store_name || "—"}</span>
                      {c.store_code ? (
                        <span className="text-gray-500 text-xs ml-1 font-mono">({c.store_code})</span>
                      ) : null}
                    </td>
                    <td className="p-3 font-mono font-medium">{c.code}</td>
                    <td className="p-3">{c.name}</td>
                    <td className="p-3 text-center">{c.is_active === 1 || c.is_active === true ? "Yes" : "No"}</td>
                    <td className="p-3 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        className="text-gray-700 underline text-xs"
                        onClick={() => toggleActive(c.id)}
                      >
                        Toggle active
                      </button>
                      <Link to={`/admin/counters/${c.id}/edit`} className="text-[var(--brand-accent)] underline text-xs">
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
