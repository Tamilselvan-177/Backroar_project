import { useEffect, useMemo, useState } from "react";
import { apiJson } from "../../../api/client.js";
import { connectJspm, getInstalledPrinters, sendTsplToInstalledPrinter } from "../../../lib/jspmClient.js";

function makeLineFromProduct(p) {
  const variants = Array.isArray(p?.variants) ? p.variants : [];
  const named = variants.filter((v) => String(v?.variant_name ?? "").trim());
  const first = named[0] ?? null;
  return {
    id: `${p.id}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
    product_id: Number(p.id),
    product_name: String(p.name ?? `#${p.id}`),
    variants: named.map((v) => ({ id: Number(v.id), name: String(v.variant_name ?? `#${v.id}`) })),
    variant_id: first ? Number(first.id) : null,
    quantity: 1,
    layout: "single_35x25",
    odd_slot: "left",
  };
}

export default function BulkLabelPrintPage() {
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState({
    shop_id: "",
    category_id: "",
    subcategory_id: "",
    brand_id: "",
    model_id: "",
  });
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [meta, setMeta] = useState({ stores: [], categories: [], subcategories: [], brands: [], models: [] });
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(null);
  const [printerName, setPrinterName] = useState("");
  const [printers, setPrinters] = useState([]);
  const [jspmReady, setJspmReady] = useState(false);

  useEffect(() => {
    Promise.all([
      apiJson("/api/admin/categories").catch(() => ({ categories: [] })),
      apiJson("/api/admin/subcategories?limit=200&page=1").catch(() => ({ subcategories: [] })),
      apiJson("/api/admin/brands").catch(() => ({ brands: [] })),
      apiJson("/api/admin/models").catch(() => ({ models: [] })),
      apiJson("/api/admin/stores/active-list").catch(() => ({ stores: [] })),
    ])
      .then(([c, s, b, m, st]) => {
        setMeta({
          stores: st.stores ?? [],
          categories: c.categories ?? [],
          subcategories: s.subcategories ?? [],
          brands: b.brands ?? [],
          models: m.models ?? [],
        });
      })
      .catch(() => {});
  }, []);

  const subcategoriesForCategory = useMemo(() => {
    const cid = Number(filters.category_id);
    if (!Number.isFinite(cid) || cid <= 0) return meta.subcategories;
    return meta.subcategories.filter((s) => Number(s.category_id) === cid);
  }, [filters.category_id, meta.subcategories]);

  const modelsForBrand = useMemo(() => {
    const bid = Number(filters.brand_id);
    if (!Number.isFinite(bid) || bid <= 0) return meta.models;
    return meta.models.filter((m) => Number(m.brand_id) === bid);
  }, [filters.brand_id, meta.models]);

  const totalLabels = useMemo(
    () => lines.reduce((s, ln) => s + Math.max(1, Number(ln.quantity) || 1), 0),
    [lines]
  );
  const brandMap = useMemo(
    () => new Map(meta.brands.map((b) => [Number(b.id), b.name])),
    [meta.brands]
  );
  const modelMap = useMemo(
    () => new Map(meta.models.map((m) => [Number(m.id), m.name])),
    [meta.models]
  );
  const subMap = useMemo(
    () => new Map(meta.subcategories.map((s) => [Number(s.id), s.name])),
    [meta.subcategories]
  );

  async function doSearch(e) {
    e?.preventDefault?.();
    setErr(null);
    const term = q.trim();
    const hasFilter =
      term.length >= 2 ||
      filters.shop_id ||
      filters.category_id ||
      filters.subcategory_id ||
      filters.brand_id ||
      filters.model_id;
    if (!hasFilter) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "40");
      if (term.length >= 2) params.set("q", term);
      if (filters.shop_id) params.set("shop_id", filters.shop_id);
      if (filters.category_id) params.set("category_id", filters.category_id);
      if (filters.subcategory_id) params.set("subcategory_id", filters.subcategory_id);
      if (filters.brand_id) params.set("brand_id", filters.brand_id);
      if (filters.model_id) params.set("model_id", filters.model_id);
      const d = await apiJson(`/api/admin/products?${params.toString()}`);
      setResults(d.products ?? []);
    } catch (e2) {
      setErr(e2.body?.error || e2.message);
    } finally {
      setSearching(false);
    }
  }

  async function addProduct(pid) {
    setErr(null);
    try {
      const d = await apiJson(`/api/admin/products/${encodeURIComponent(pid)}`);
      setLines((prev) => [...prev, makeLineFromProduct(d.product)]);
      setOk("Product added to print list.");
    } catch (e2) {
      setErr(e2.body?.error || e2.message);
    }
  }

  function setLine(id, patch) {
    setLines((prev) => prev.map((ln) => (ln.id === id ? { ...ln, ...patch } : ln)));
  }

  function removeLine(id) {
    setLines((prev) => prev.filter((ln) => ln.id !== id));
  }

  async function buildBatchTspl() {
    const chunks = [];
    for (const ln of lines) {
      const qty = Math.max(1, Math.min(999, Number(ln.quantity) || 1));
      let path = `/api/admin/print/tspl?productId=${encodeURIComponent(ln.product_id)}&quantity=${qty}&layout=${encodeURIComponent(ln.layout)}`;
      if (ln.variant_id != null) path += `&variantId=${encodeURIComponent(ln.variant_id)}`;
      if (ln.layout === "two_up_72x25" && qty % 2 === 1) {
        path += `&remainder_side=${encodeURIComponent(ln.odd_slot === "right" ? "right" : "left")}`;
      }
      const d = await apiJson(path);
      chunks.push(String(d.tspl || "").trim());
    }
    return `${chunks.filter(Boolean).join("\n\n")}\n`;
  }

  async function downloadBatchTspl() {
    if (!lines.length) return;
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const tspl = await buildBatchTspl();
      const blob = new Blob([tspl], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `bulk-labels-${Date.now()}.tspl`;
      a.click();
      URL.revokeObjectURL(a.href);
      setOk("TSPL downloaded.");
    } catch (e2) {
      setErr(e2.body?.message || e2.body?.error || e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function refreshPrinters() {
    setErr(null);
    try {
      await connectJspm();
      setJspmReady(true);
      const list = await getInstalledPrinters();
      setPrinters(list);
      if (!printerName && list[0]) setPrinterName(list[0]);
    } catch (e2) {
      setJspmReady(false);
      setPrinters([]);
      setErr(e2.message);
    }
  }

  async function printBatchJspm() {
    if (!lines.length) return;
    if (!printerName.trim()) {
      setErr("Select a printer first.");
      return;
    }
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const tspl = await buildBatchTspl();
      await sendTsplToInstalledPrinter(printerName.trim(), tspl);
      setOk(`Sent ${totalLabels} labels to ${printerName}.`);
    } catch (e2) {
      setErr(e2.body?.message || e2.body?.error || e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5 max-w-6xl">
      <header className="rounded-xl border border-slate-200 bg-white p-4">
        <h1 className="text-xl font-black text-slate-900">Bulk barcode label print</h1>
        <p className="text-sm text-slate-600 mt-1">
          Add multiple products/variants, set quantity per variant, then print/download one combined TSPL job.
          Use <strong>Single label</strong> layout to avoid waste.
        </p>
      </header>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div> : null}
      {ok ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ok}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <form onSubmit={doSearch} className="grid grid-cols-1 md:grid-cols-8 gap-2">
          <input
            className="md:col-span-3 border border-slate-300 rounded-lg px-3 py-2"
            placeholder="Search by name / slug / SKU"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="border border-slate-300 rounded-lg px-2 py-2 text-sm"
            value={filters.shop_id}
            onChange={(e) => setFilters((f) => ({ ...f, shop_id: e.target.value }))}
          >
            <option value="">All shops</option>
            {meta.stores.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            className="border border-slate-300 rounded-lg px-2 py-2 text-sm"
            value={filters.brand_id}
            onChange={(e) =>
              setFilters((f) => ({ ...f, brand_id: e.target.value, model_id: "" }))
            }
          >
            <option value="">All brands</option>
            {meta.brands.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            className="border border-slate-300 rounded-lg px-2 py-2 text-sm"
            value={filters.model_id}
            onChange={(e) => setFilters((f) => ({ ...f, model_id: e.target.value }))}
          >
            <option value="">All models</option>
            {modelsForBrand.map((m) => (
              <option key={m.id} value={String(m.id)}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            className="border border-slate-300 rounded-lg px-2 py-2 text-sm"
            value={filters.category_id}
            onChange={(e) =>
              setFilters((f) => ({ ...f, category_id: e.target.value, subcategory_id: "" }))
            }
          >
            <option value="">All categories</option>
            {meta.categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="border border-slate-300 rounded-lg px-2 py-2 text-sm"
            value={filters.subcategory_id}
            onChange={(e) => setFilters((f) => ({ ...f, subcategory_id: e.target.value }))}
          >
            <option value="">All types</option>
            {subcategoriesForCategory.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="submit" className="md:col-span-1 px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold">
            {searching ? "Searching..." : "Filter"}
          </button>
        </form>
        <div className="max-h-52 overflow-auto space-y-1">
          {results.map((p) => (
            <div key={p.id} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
              <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-900">{p.name}</div>
                  <div className="text-xs text-slate-500">
                    #{p.id}
                    {p.brand_id ? ` · ${brandMap.get(Number(p.brand_id)) || `Brand #${p.brand_id}`}` : ""}
                    {p.shop_name ? ` · ${p.shop_name}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => addProduct(p.id)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-50"
                >
                  Add
                </button>
              </div>
              <div className="mt-2 text-xs text-slate-600">
                Model: {p.model_id ? modelMap.get(Number(p.model_id)) || `#${p.model_id}` : "—"} · Type:{" "}
                {p.subcategory_id ? subMap.get(Number(p.subcategory_id)) || `#${p.subcategory_id}` : "—"}
              </div>
            </div>
          ))}
          {!searching && results.length === 0 ? (
            <p className="text-sm text-slate-500 py-2">No products found.</p>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Print list ({lines.length} lines)</h2>
          <div className="text-sm font-semibold text-slate-700">Total labels: {totalLabels}</div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-2">Product</th>
                <th className="text-left p-2">Variant</th>
                <th className="text-left p-2">Qty</th>
                <th className="text-left p-2">Layout</th>
                <th className="text-left p-2">Odd slot</th>
                <th className="text-left p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((ln) => (
                <tr key={ln.id} className="border-t border-slate-100">
                  <td className="p-2">{ln.product_name}</td>
                  <td className="p-2">
                    {ln.variants.length > 0 ? (
                      <select
                        className="border border-slate-300 rounded px-2 py-1"
                        value={ln.variant_id ?? ""}
                        onChange={(e) => setLine(ln.id, { variant_id: e.target.value ? Number(e.target.value) : null })}
                      >
                        {ln.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-slate-500">No variant</span>
                    )}
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      min={1}
                      max={999}
                      className="w-20 border border-slate-300 rounded px-2 py-1"
                      value={ln.quantity}
                      onChange={(e) => setLine(ln.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </td>
                  <td className="p-2">
                    <select
                      className="border border-slate-300 rounded px-2 py-1"
                      value={ln.layout}
                      onChange={(e) => setLine(ln.id, { layout: e.target.value })}
                    >
                      <option value="single_35x25">Single label (no waste)</option>
                      <option value="two_up_72x25">2-up strip</option>
                    </select>
                  </td>
                  <td className="p-2">
                    {ln.layout === "two_up_72x25" && Number(ln.quantity) % 2 === 1 ? (
                      <select
                        className="border border-slate-300 rounded px-2 py-1"
                        value={ln.odd_slot}
                        onChange={(e) => setLine(ln.id, { odd_slot: e.target.value === "right" ? "right" : "left" })}
                      >
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                      </select>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => removeLine(ln.id)}
                      className="text-xs text-red-700 underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {!lines.length ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-500">
                    Add products from search to build the print list.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Print output</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Printer (JSPrintManager)</label>
            <select
              className="border border-slate-300 rounded px-2 py-2 min-w-[14rem]"
              value={printerName}
              onChange={(e) => setPrinterName(e.target.value)}
            >
              <option value="">{jspmReady ? "Select printer" : "Not connected"}</option>
              {printers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={refreshPrinters} className="px-3 py-2 rounded border border-slate-300 text-sm">
            Refresh printers
          </button>
          <button
            type="button"
            disabled={busy || lines.length === 0}
            onClick={downloadBatchTspl}
            className="px-4 py-2 rounded bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Working..." : "Download combined TSPL"}
          </button>
          <button
            type="button"
            disabled={busy || lines.length === 0}
            onClick={printBatchJspm}
            className="px-4 py-2 rounded border border-slate-900 text-slate-900 text-sm font-semibold disabled:opacity-50"
          >
            Print all via JSPrintManager
          </button>
        </div>
      </div>
    </section>
  );
}

