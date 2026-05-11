import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiJson } from "../../../api/client.js";
import { inp as defaultInp, lbl as defaultLbl } from "./catalogAdminUi.js";

function matchesQuery(row, q) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const hay = [row.name, row.slug].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(s);
}

/** Combobox-style picker with type-to-filter (Django admin–style UX). */
export function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = "Search…",
  emptyLabel = "—",
  disabled = false,
  className = "",
  inputClassName,
  listMaxHeightClass = "max-h-48",
  "aria-label": ariaLabel,
}) {
  const inpCls = inputClassName ?? defaultInp;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef(null);
  const listId = useRef(`ssel-${Math.random().toString(36).slice(2, 9)}`).current;

  const selected = useMemo(
    () => options.find((o) => String(o.id) === String(value ?? "")),
    [options, value]
  );

  const filtered = useMemo(() => options.filter((o) => matchesQuery(o, q)), [options, q]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const display = selected?.name?.trim() || emptyLabel;

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`${inpCls} flex w-full items-center justify-between gap-2 text-left ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        <span className="min-w-0 flex-1 truncate">{display}</span>
        <span className="shrink-0 text-slate-400 text-xs" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <div
          className="absolute left-0 right-0 z-50 mt-1 rounded-xl border border-slate-200 bg-white py-2 shadow-lg ring-1 ring-black/5"
          role="presentation"
        >
          <div className="px-2 pb-2">
            <input
              type="search"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
              className={`${inpCls} mt-0`}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setOpen(false);
                }
              }}
              aria-label={placeholder}
            />
          </div>
          <ul id={listId} role="listbox" className={`${listMaxHeightClass} overflow-auto px-1`}>
            <li role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={value === ""}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                {emptyLabel}
              </button>
            </li>
            {filtered.map((o) => (
              <li key={String(o.id)} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={String(o.id) === String(value)}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100"
                  onClick={() => {
                    onChange(String(o.id));
                    setOpen(false);
                  }}
                >
                  <span className="font-medium">{o.name}</span>
                  {o.slug ? <span className="ml-2 text-xs text-slate-400">{o.slug}</span> : null}
                </button>
              </li>
            ))}
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-center text-xs text-slate-500">No matches</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ModalShell({ title, children, onClose, busy }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  return createPortal(
    <div
      className="fixed inset-0 z-[240] flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="catalog-quickadd-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="catalog-quickadd-title" className="text-lg font-bold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
            onClick={onClose}
            disabled={busy}
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

function errMsg(e) {
  const b = e?.body;
  if (b?.error === "slug_taken") return "That slug is already in use. Change the name or add a unique slug.";
  if (b?.error === "csrf_failed") return "Security check failed. Reload the page and try again.";
  if (b?.error === "validation_failed" && b.field) return `Invalid ${b.field}.`;
  return b?.error || b?.message || e?.message || "Request failed";
}

/**
 * Django-style inline create: POST taxonomy then parent refreshes meta and selects the new row.
 * @param {object} p
 * @param {'category'|'brand'|'subcategory'|'model'|null} p.active
 * @param {() => void} p.onClose
 * @param {(args: { type: string, id: number, category_id?: number, brand_id?: number }) => void} p.onSuccess
 * @param {string} p.categoryIdPreset — product form category (for subcategory default)
 * @param {string} p.brandIdPreset — product form brand (for model default)
 * @param {Array<{id:number,name:string,slug?:string}>} p.categories
 * @param {Array<{id:number,name:string,slug?:string}>} p.brands
 */
export function CatalogQuickCreateModals({
  active,
  onClose,
  onSuccess,
  categoryIdPreset = "",
  brandIdPreset = "",
  categories = [],
  brands = [],
  inp = defaultInp,
  lbl = defaultLbl,
}) {
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState(null);

  const [catForm, setCatForm] = useState({ name: "", slug: "", is_active: true });
  const [brandForm, setBrandForm] = useState({ name: "", slug: "", is_active: true });
  const [subForm, setSubForm] = useState({
    category_id: "",
    name: "",
    slug: "",
    is_active: true,
  });
  const [modelForm, setModelForm] = useState({
    brand_id: "",
    name: "",
    slug: "",
    model_number: "",
    is_active: true,
  });

  useEffect(() => {
    if (!active) return;
    setLocalErr(null);
    setBusy(false);
    if (active === "category") setCatForm({ name: "", slug: "", is_active: true });
    if (active === "brand") setBrandForm({ name: "", slug: "", is_active: true });
    if (active === "subcategory")
      setSubForm({
        category_id: String(categoryIdPreset || ""),
        name: "",
        slug: "",
        is_active: true,
      });
    if (active === "model")
      setModelForm({
        brand_id: String(brandIdPreset || ""),
        name: "",
        slug: "",
        model_number: "",
        is_active: true,
      });
  }, [active, categoryIdPreset, brandIdPreset]);

  const catOpts = useMemo(
    () => (categories || []).map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
    [categories]
  );
  const brandOpts = useMemo(() => (brands || []).map((b) => ({ id: b.id, name: b.name, slug: b.slug })), [brands]);

  const submitCategory = useCallback(async () => {
    setLocalErr(null);
    const name = catForm.name.trim();
    if (!name) {
      setLocalErr("Name is required.");
      return;
    }
    setBusy(true);
    try {
      const r = await apiJson("/api/admin/categories", {
        method: "POST",
        body: JSON.stringify({
          name,
          slug: catForm.slug.trim() || undefined,
          is_active: !!catForm.is_active,
        }),
      });
      await Promise.resolve(onSuccess({ type: "category", id: Number(r.id) }));
      onClose();
    } catch (e) {
      setLocalErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [catForm, onClose, onSuccess]);

  const submitBrand = useCallback(async () => {
    setLocalErr(null);
    const name = brandForm.name.trim();
    if (!name) {
      setLocalErr("Name is required.");
      return;
    }
    setBusy(true);
    try {
      const r = await apiJson("/api/admin/brands", {
        method: "POST",
        body: JSON.stringify({
          name,
          slug: brandForm.slug.trim() || undefined,
          is_active: !!brandForm.is_active,
        }),
      });
      await Promise.resolve(onSuccess({ type: "brand", id: Number(r.id) }));
      onClose();
    } catch (e) {
      setLocalErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [brandForm, onClose, onSuccess]);

  const submitSub = useCallback(async () => {
    setLocalErr(null);
    const category_id = Number(subForm.category_id);
    const name = subForm.name.trim();
    if (!category_id) {
      setLocalErr("Choose a parent category.");
      return;
    }
    if (!name) {
      setLocalErr("Name is required.");
      return;
    }
    setBusy(true);
    try {
      const r = await apiJson("/api/admin/subcategories", {
        method: "POST",
        body: JSON.stringify({
          category_id,
          name,
          slug: subForm.slug.trim() || undefined,
          is_active: !!subForm.is_active,
        }),
      });
      await Promise.resolve(onSuccess({ type: "subcategory", id: Number(r.id), category_id }));
      onClose();
    } catch (e) {
      setLocalErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [subForm, onClose, onSuccess]);

  const submitModel = useCallback(async () => {
    setLocalErr(null);
    const brand_id = Number(modelForm.brand_id);
    const name = modelForm.name.trim();
    if (!brand_id) {
      setLocalErr("Choose a brand.");
      return;
    }
    if (!name) {
      setLocalErr("Name is required.");
      return;
    }
    setBusy(true);
    try {
      const r = await apiJson("/api/admin/models", {
        method: "POST",
        body: JSON.stringify({
          brand_id,
          name,
          slug: modelForm.slug.trim() || undefined,
          model_number: modelForm.model_number.trim() || null,
          is_active: !!modelForm.is_active,
        }),
      });
      await Promise.resolve(onSuccess({ type: "model", id: Number(r.id), brand_id }));
      onClose();
    } catch (e) {
      setLocalErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [modelForm, onClose, onSuccess]);

  if (!active) return null;

  const errBlock = localErr ? (
    <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{localErr}</div>
  ) : null;

  if (active === "category") {
    return (
      <ModalShell title="New category" onClose={onClose} busy={busy}>
        {errBlock}
        <div className="space-y-3">
          <label className="block">
            <span className={lbl}>Name *</span>
            <input
              className={inp}
              value={catForm.name}
              onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          </label>
          <label className="block">
            <span className={lbl}>Slug (optional)</span>
            <input
              className={inp}
              value={catForm.slug}
              onChange={(e) => setCatForm((f) => ({ ...f, slug: e.target.value }))}
              placeholder="Auto from name if empty"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={catForm.is_active}
              onChange={(e) => setCatForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            Active
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
              onClick={submitCategory}
              disabled={busy}
            >
              {busy ? "Saving…" : "Create & use"}
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

  if (active === "brand") {
    return (
      <ModalShell title="New brand" onClose={onClose} busy={busy}>
        {errBlock}
        <div className="space-y-3">
          <label className="block">
            <span className={lbl}>Name *</span>
            <input
              className={inp}
              value={brandForm.name}
              onChange={(e) => setBrandForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          </label>
          <label className="block">
            <span className={lbl}>Slug (optional)</span>
            <input className={inp} value={brandForm.slug} onChange={(e) => setBrandForm((f) => ({ ...f, slug: e.target.value }))} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={brandForm.is_active}
              onChange={(e) => setBrandForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            Active
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
              onClick={submitBrand}
              disabled={busy}
            >
              {busy ? "Saving…" : "Create & use"}
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

  if (active === "subcategory") {
    return (
      <ModalShell title="New subcategory" onClose={onClose} busy={busy}>
        {errBlock}
        <p className="mb-3 text-xs text-slate-500">Creates a subcategory under the selected category, then selects it on this product.</p>
        <div className="space-y-3">
          <label className="block">
            <span className={lbl}>Parent category *</span>
            <SearchableSelect
              value={subForm.category_id}
              onChange={(v) => setSubForm((f) => ({ ...f, category_id: v }))}
              options={catOpts}
              placeholder="Search categories…"
              emptyLabel="Choose category…"
              aria-label="Parent category"
            />
          </label>
          <label className="block">
            <span className={lbl}>Name *</span>
            <input className={inp} value={subForm.name} onChange={(e) => setSubForm((f) => ({ ...f, name: e.target.value }))} />
          </label>
          <label className="block">
            <span className={lbl}>Slug (optional)</span>
            <input className={inp} value={subForm.slug} onChange={(e) => setSubForm((f) => ({ ...f, slug: e.target.value }))} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={subForm.is_active}
              onChange={(e) => setSubForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            Active
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
              onClick={submitSub}
              disabled={busy}
            >
              {busy ? "Saving…" : "Create & use"}
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

  if (active === "model") {
    return (
      <ModalShell title="New model" onClose={onClose} busy={busy}>
        {errBlock}
        <p className="mb-3 text-xs text-slate-500">Pick the brand this device belongs to, then it appears in the model list.</p>
        <div className="space-y-3">
          <label className="block">
            <span className={lbl}>Brand *</span>
            <SearchableSelect
              value={modelForm.brand_id}
              onChange={(v) => setModelForm((f) => ({ ...f, brand_id: v }))}
              options={brandOpts}
              placeholder="Search brands…"
              emptyLabel="Choose brand…"
              aria-label="Brand for new model"
            />
          </label>
          <label className="block">
            <span className={lbl}>Model name *</span>
            <input className={inp} value={modelForm.name} onChange={(e) => setModelForm((f) => ({ ...f, name: e.target.value }))} />
          </label>
          <label className="block">
            <span className={lbl}>Model number (optional)</span>
            <input
              className={inp}
              value={modelForm.model_number}
              onChange={(e) => setModelForm((f) => ({ ...f, model_number: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className={lbl}>Slug (optional)</span>
            <input className={inp} value={modelForm.slug} onChange={(e) => setModelForm((f) => ({ ...f, slug: e.target.value }))} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={modelForm.is_active}
              onChange={(e) => setModelForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            Active
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
              onClick={submitModel}
              disabled={busy}
            >
              {busy ? "Saving…" : "Create & use"}
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

  return null;
}
