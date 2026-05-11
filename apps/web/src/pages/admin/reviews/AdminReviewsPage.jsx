import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../../../api/client.js";
import { useDeleteConfirm } from "../../../context/DeleteConfirmContext.jsx";

const STATUSES = ["pending", "approved", "rejected", "all"];

function fmt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

export default function AdminReviewsPage() {
  const askDelete = useDeleteConfirm();
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [counts, setCounts] = useState(null);
  const [err, setErr] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const loadCounts = useCallback(() => {
    apiJson("/api/admin/reviews/counts").then(setCounts).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setErr(null);
    const qs = new URLSearchParams({ status, page: String(page), limit: "25" });
    apiJson(`/api/admin/reviews?${qs}`)
      .then(setData)
      .catch((e) => setErr(e.body?.error || e.message));
  }, [status, page]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts, data]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [status]);

  const items = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;

  const toggle = (id) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((r) => r.id)));
  };

  const patchStatus = async (id, next) => {
    setBusy(true);
    try {
      await apiJson(`/api/admin/reviews/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      load();
      loadCounts();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r) => {
    const ok = await askDelete({
      title: "Delete this review?",
      description: `Remove review #${r.id} on “${String(r.product_name ?? "").trim() || "product"}”. The review text and rating will be permanently removed.\n\nThis cannot be undone.`,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiJson(`/api/admin/reviews/${r.id}`, { method: "DELETE", body: "{}" });
      load();
      loadCounts();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const bulk = async (action) => {
    const ids = [...selected];
    if (!ids.length) return;
    if (action === "delete") {
      const ok = await askDelete({
        title: `Delete ${ids.length} review(s)?`,
        description: "The selected reviews will be permanently removed.\n\nThis cannot be undone.",
        confirmLabel: "Delete all",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await apiJson("/api/admin/reviews/bulk", {
        method: "POST",
        body: JSON.stringify({ action, review_ids: ids }),
      });
      setSelected(new Set());
      load();
      loadCounts();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const countLabel = useMemo(() => {
    if (!counts) return null;
    return (
      <span className="text-gray-500 text-sm">
        All {counts.all} · Pending {counts.pending} · Approved {counts.approved} · Rejected {counts.rejected}
      </span>
    );
  }, [counts]);

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex flex-wrap justify-between gap-2 items-end">
        <div>
          <h1 className="text-2xl font-black">Reviews</h1>
          <p className="text-gray-600 text-sm mt-1">Moderate storefront reviews before they go live.</p>
          {countLabel}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold capitalize ${
              status === s ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {err ? <p className="text-red-600 text-sm">{err}</p> : null}

      <div className="flex flex-wrap gap-2 items-center">
        <label className="text-sm text-gray-600 flex items-center gap-2">
          <input type="checkbox" checked={items.length > 0 && selected.size === items.length} onChange={toggleAll} />
          Select page
        </label>
        <button
          type="button"
          disabled={busy || !selected.size}
          onClick={() => bulk("approve")}
          className="px-3 py-1.5 rounded-lg bg-green-700 text-white text-sm disabled:opacity-40"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={busy || !selected.size}
          onClick={() => bulk("reject")}
          className="px-3 py-1.5 rounded-lg bg-amber-700 text-white text-sm disabled:opacity-40"
        >
          Reject
        </button>
        <button
          type="button"
          disabled={busy || !selected.size}
          onClick={() => bulk("delete")}
          className="px-3 py-1.5 rounded-lg bg-red-700 text-white text-sm disabled:opacity-40"
        >
          Delete
        </button>
      </div>

      {!data ? (
        <p className="text-gray-600">Loading…</p>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap gap-3 justify-between">
                <div className="flex gap-2 items-start">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  <div>
                    <div className="font-bold">
                      {r.title}{" "}
                      <span className="text-amber-600 font-black">{"★".repeat(Math.min(5, Number(r.rating) || 0))}</span>
                    </div>
                    <div className="text-sm text-gray-600">
                      {r.user_name} · {r.user_email} · {fmt(r.created_at)}
                    </div>
                    <div className="text-sm mt-1">
                      Product:{" "}
                      <Link className="text-[var(--brand-accent)] underline" to={`/admin/products/${r.product_id}/edit`}>
                        {r.product_name}
                      </Link>{" "}
                      <span className="text-gray-400">({r.status})</span>
                      {r.is_verified_purchase ? (
                        <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">Verified purchase</span>
                      ) : null}
                    </div>
                    <p className="text-sm mt-2 text-gray-800 whitespace-pre-wrap">{r.comment}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => patchStatus(r.id, "approved")}
                    className="text-xs px-2 py-1 rounded border border-green-300 text-green-800 hover:bg-green-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => patchStatus(r.id, "rejected")}
                    className="text-xs px-2 py-1 rounded border border-amber-300 text-amber-900 hover:bg-amber-50"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => patchStatus(r.id, "pending")}
                    className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
                  >
                    Pending
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(r)}
                    className="text-xs px-2 py-1 rounded border border-red-300 text-red-800 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
          {items.length === 0 ? <p className="text-gray-600 text-sm">No reviews in this filter.</p> : null}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex gap-2 items-center text-sm">
          <button
            type="button"
            disabled={page <= 1 || busy}
            className="px-3 py-1 rounded border"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <span>
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || busy}
            className="px-3 py-1 rounded border"
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
