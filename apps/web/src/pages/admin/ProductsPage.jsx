import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiJson } from "../../api/client.js";
import { productImageUrl } from "../../lib/images.js";
import { useAdminPerm } from "./AdminPermContext.jsx";
import { P } from "./adminPermKeys.js";

const inp =
  "border border-gray-300 rounded px-2 py-1.5 text-sm bg-white disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed";

export default function ProductsPage() {
  const { has, catalogScope } = useAdminPerm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [meta, setMeta] = useState({
    categories: [],
    subcategories: [],
    brands: [],
    models: [],
    stores: [],
  });
  const [metaErr, setMetaErr] = useState(null);

  const canFilterAllShops = !!catalogScope?.can_filter_all_shops;
  const catalogShopIds = Array.isArray(catalogScope?.catalog_shop_ids) ? catalogScope.catalog_shop_ids : null;
  const staffShopName = catalogScope?.shop_name ?? null;
  const staffShopId = catalogScope?.staff_shop_id ?? null;

  const restrictedCatalog = !canFilterAllShops && catalogShopIds != null && catalogShopIds.length > 0;
  const singleShopLocked = restrictedCatalog && catalogShopIds.length === 1;
  const limitedShopPicker = restrictedCatalog && catalogShopIds.length > 1;

  const limitedStores = useMemo(() => {
    if (!limitedShopPicker || !catalogShopIds?.length) return [];
    const allow = new Set(catalogShopIds.map(Number));
    return meta.stores.filter((s) => allow.has(Number(s.id)));
  }, [limitedShopPicker, catalogShopIds, meta.stores]);

  const qs = searchParams.toString();

  const [qDraft, setQDraft] = useState(() => searchParams.get("q") ?? "");
  useEffect(() => {
    setQDraft(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    if (canFilterAllShops || !singleShopLocked) return;
    const sp = new URLSearchParams(qs);
    if (!sp.has("shop_id") && !sp.has("shop_unassigned")) return;
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      n.delete("shop_id");
      n.delete("shop_unassigned");
      return n;
    }, { replace: true });
  }, [canFilterAllShops, singleShopLocked, qs, setSearchParams]);

  useEffect(() => {
    if (!limitedShopPicker || !catalogShopIds?.length) return;
    const pick = searchParams.get("shop_id");
    if (!pick) return;
    const n = Number(pick);
    if (Number.isFinite(n) && catalogShopIds.includes(n)) return;
    setSearchParams((prev) => {
      const nx = new URLSearchParams(prev);
      nx.delete("shop_id");
      nx.delete("page");
      return nx;
    }, { replace: true });
  }, [limitedShopPicker, catalogShopIds, searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    const cats = apiJson("/api/admin/categories");
    const subs = apiJson("/api/admin/subcategories?limit=200&page=1");
    const brands = apiJson("/api/admin/brands");
    const models = apiJson("/api/admin/models");
    const storesReq =
      canFilterAllShops || limitedShopPicker ? apiJson("/api/admin/stores/active-list") : Promise.resolve({ stores: [] });

    Promise.all([cats, subs, brands, models, storesReq])
      .then(([c, s, b, m, st]) => {
        if (cancelled) return;
        setMeta({
          categories: c.categories ?? [],
          subcategories: s.subcategories ?? [],
          brands: b.brands ?? [],
          models: m.models ?? [],
          stores: st.stores ?? [],
        });
        setMetaErr(null);
      })
      .catch((e) => {
        if (!cancelled) setMetaErr(e.body?.error || e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [canFilterAllShops, limitedShopPicker]);

  useEffect(() => {
    setErr(null);
    apiJson(`/api/admin/products${qs ? `?${qs}` : ""}`)
      .then(setData)
      .catch((e) =>
        setErr(e.body?.message || e.body?.error || e.message)
      );
  }, [qs]);

  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const subsForCategory = useMemo(() => {
    const cid = Number(searchParams.get("category_id"));
    if (!Number.isFinite(cid)) return [];
    return meta.subcategories.filter((s) => Number(s.category_id) === cid);
  }, [meta.subcategories, searchParams]);

  const modelsForBrand = useMemo(() => {
    const bid = Number(searchParams.get("brand_id"));
    if (!Number.isFinite(bid)) return [];
    return meta.models.filter((m) => Number(m.brand_id) === bid);
  }, [meta.models, searchParams]);

  function commitSearchQuery() {
    const v = qDraft.trim();
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      if (v) n.set("q", v);
      else n.delete("q");
      n.delete("page");
      return n;
    });
  }

  function setFilter(key, value, options = {}) {
    const { resetSubsIfCategory = false, resetModelsIfBrand = false } = options;
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      n.delete("page");
      if (value === "" || value === undefined || value === null) {
        n.delete(key);
      } else {
        n.set(key, String(value));
      }
      if (resetSubsIfCategory) {
        n.delete("subcategory_id");
      }
      if (resetModelsIfBrand) {
        n.delete("model_id");
      }
      if (key === "shop_id" && value) {
        n.delete("shop_unassigned");
      }
      return n;
    });
  }

  function clearFilters() {
    setSearchParams(() => new URLSearchParams(), { replace: true });
    setQDraft("");
  }

  const shopUnassigned = searchParams.get("shop_unassigned") === "1" || searchParams.get("shop_unassigned") === "true";

  if (err) return <p className="text-red-600">{err}</p>;
  if (!data) return <p className="text-gray-600">Loading…</p>;

  const rows = data.products ?? [];

  return (
    <div>
      <h1 className="text-2xl font-black mb-2">Products</h1>
      {restrictedCatalog ? (
        limitedShopPicker ? (
          <p className="text-gray-600 text-sm mb-4">
            Create, edit, variants, and stock in Mongo. Your admin assigned more than one shop for catalog — use the shop
            filter below only among those stores (plus shared catalog rows with no shop link). Other roles may grant{" "}
            <span className="font-semibold">Products — all shops (catalog)</span> for every store.
          </p>
        ) : (
          <p className="text-gray-600 text-sm mb-4">
            Create, edit, variants, and stock in Mongo. Catalog is limited to your assigned shop (and shared products not
            linked to a specific shop). Category, brand, stock, and status filters still apply.
          </p>
        )
      ) : (
        <p className="text-gray-600 text-sm mb-4">
          Create, edit, variants, and stock in Mongo. Use filters below; open the shop filter when your account may manage
          products across stores.
        </p>
      )}

      {singleShopLocked ? (
        <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <span className="font-semibold">Catalog locked to your assigned shop.</span> Primary store:{" "}
          <span className="font-semibold">{staffShopName || `Shop #${staffShopId}`}</span>. There is no shop picker. You see
          products linked to this shop and shared rows with no shop on the product — other stores stay hidden unless an
          admin enables extra shops on your staff profile or grants{" "}
          <span className="font-semibold">Products — all shops (catalog)</span> on your role.
        </div>
      ) : null}

      {limitedShopPicker ? (
        <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950">
          <span className="font-semibold">Limited multi-shop catalog.</span> You may filter among the shops your admin
          selected on your staff profile (assigned shop plus extras). Other stores are not available here.
        </div>
      ) : null}

      {metaErr ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950">
          Could not load filter lists (categories, brands, …): {metaErr}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {has(P.CATALOG_PRODUCTS_CREATE) ? (
          <Link
            to="/admin/products/create"
            className="inline-block px-4 py-2 rounded bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800"
          >
            Add product
          </Link>
        ) : null}
        <button
          type="button"
          className={`inline-block px-4 py-2 rounded border border-gray-300 text-sm font-semibold text-gray-800 hover:bg-gray-50`}
          onClick={clearFilters}
        >
          Clear filters
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 mb-4 space-y-3 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="block md:col-span-2">
            <span className="text-xs font-semibold text-gray-600 block mb-1">Search (name / slug / SKU)</span>
            <input
              className={`${inp} w-full`}
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              onBlur={commitSearchQuery}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitSearchQuery();
                }
              }}
              placeholder="Type and blur or press Enter"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-gray-600 block mb-1">Category</span>
            <select
              className={`${inp} w-full`}
              value={searchParams.get("category_id") ?? ""}
              onChange={(e) => setFilter("category_id", e.target.value, { resetSubsIfCategory: true })}
            >
              <option value="">All</option>
              {meta.categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-gray-600 block mb-1">Subcategory</span>
            <select
              className={`${inp} w-full`}
              value={searchParams.get("subcategory_id") ?? ""}
              onChange={(e) => setFilter("subcategory_id", e.target.value)}
              disabled={!searchParams.get("category_id")}
            >
              <option value="">All</option>
              {subsForCategory.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-gray-600 block mb-1">Brand</span>
            <select
              className={`${inp} w-full`}
              value={searchParams.get("brand_id") ?? ""}
              onChange={(e) => setFilter("brand_id", e.target.value, { resetModelsIfBrand: true })}
            >
              <option value="">All</option>
              {meta.brands.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-gray-600 block mb-1">Model</span>
            <select
              className={`${inp} w-full`}
              value={searchParams.get("model_id") ?? ""}
              onChange={(e) => setFilter("model_id", e.target.value)}
              disabled={!searchParams.get("brand_id")}
            >
              <option value="">All</option>
              {modelsForBrand.map((m) => (
                <option key={m.id} value={String(m.id)}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-gray-600 block mb-1">Active</span>
            <select
              className={`${inp} w-full`}
              value={searchParams.get("is_active") ?? ""}
              onChange={(e) => setFilter("is_active", e.target.value)}
            >
              <option value="">All</option>
              <option value="1">Active</option>
              <option value="0">Inactive</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-gray-600 block mb-1">Featured</span>
            <select
              className={`${inp} w-full`}
              value={searchParams.get("is_featured") ?? ""}
              onChange={(e) => setFilter("is_featured", e.target.value)}
            >
              <option value="">All</option>
              <option value="1">Yes</option>
              <option value="0">No</option>
            </select>
          </label>

          {canFilterAllShops ? (
            <label className="block">
              <span className="text-xs font-semibold text-gray-600 block mb-1">Shop</span>
              <select
                className={`${inp} w-full`}
                value={shopUnassigned ? "" : searchParams.get("shop_id") ?? ""}
                onChange={(e) => setFilter("shop_id", e.target.value)}
                disabled={shopUnassigned}
              >
                <option value="">All shops</option>
                {meta.stores.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                    {s.code ? ` (${s.code})` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : limitedShopPicker ? (
            <label className="block">
              <span className="text-xs font-semibold text-gray-600 block mb-1">Shop</span>
              <select
                className={`${inp} w-full`}
                value={searchParams.get("shop_id") ?? ""}
                onChange={(e) => setFilter("shop_id", e.target.value)}
              >
                <option value="">All allowed shops</option>
                {limitedStores.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                    {s.code ? ` (${s.code})` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {canFilterAllShops ? (
            <label className="flex items-end gap-2 pb-1 md:col-span-2">
              <input
                type="checkbox"
                id="shop_unassigned"
                checked={shopUnassigned}
                onChange={(e) => {
                  const on = e.target.checked;
                  setSearchParams((prev) => {
                    const n = new URLSearchParams(prev);
                    n.delete("page");
                    if (on) {
                      n.set("shop_unassigned", "1");
                      n.delete("shop_id");
                    } else {
                      n.delete("shop_unassigned");
                    }
                    return n;
                  });
                }}
                className="rounded border-gray-400"
              />
              <span className="text-xs font-semibold text-gray-700">
                Only products with no shop linked (admin cleanup)
              </span>
            </label>
          ) : null}

          <label className="block">
            <span className="text-xs font-semibold text-gray-600 block mb-1">Stock min</span>
            <input
              type="number"
              min={0}
              className={`${inp} w-full`}
              defaultValue={searchParams.get("stock_min") ?? ""}
              key={`stock_min-${searchParams.get("stock_min") ?? ""}`}
              onBlur={(e) => setFilter("stock_min", e.target.value.trim())}
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-gray-600 block mb-1">Stock max</span>
            <input
              type="number"
              min={0}
              className={`${inp} w-full`}
              defaultValue={searchParams.get("stock_max") ?? ""}
              key={`stock_max-${searchParams.get("stock_max") ?? ""}`}
              onBlur={(e) => setFilter("stock_max", e.target.value.trim())}
            />
          </label>
        </div>
      </div>

      <div className="overflow-x-auto border rounded-lg bg-white text-sm">
        <table className="min-w-full">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="p-2">Img</th>
              <th className="p-2">ID</th>
              <th className="p-2">Name</th>
              <th className="p-2">Category</th>
              <th className="p-2">Shop</th>
              <th className="p-2">Slug</th>
              <th className="p-2">Price</th>
              <th className="p-2">Stock</th>
              <th className="p-2">Active</th>
              <th className="p-2">Featured</th>
              {has(P.CATALOG_PRODUCTS_UPDATE) ? <th className="p-2" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const img = productImageUrl(p.image_path);
              return (
                <tr key={p.id} className="border-t">
                  <td className="p-2 w-14">
                    {img ? <img src={img} alt="" className="h-10 w-10 object-contain" /> : "—"}
                  </td>
                  <td className="p-2">{p.id}</td>
                  <td className="p-2 font-medium">
                    <Link to={`/product/${encodeURIComponent(p.slug)}`} className="text-blue-600 underline" target="_blank" rel="noreferrer">
                      {p.name}
                    </Link>
                  </td>
                  <td className="p-2 text-gray-600">{p.category_name ?? "—"}</td>
                  <td className="p-2 text-gray-600">{p.shop_name ?? (p.shop_id != null ? `#${p.shop_id}` : "—")}</td>
                  <td className="p-2 text-gray-600">{p.slug}</td>
                  <td className="p-2">₹{p.price}</td>
                  <td className="p-2">{p.stock_quantity}</td>
                  <td className="p-2">{p.is_active ? "Yes" : "No"}</td>
                  <td className="p-2">{p.is_featured ? "Yes" : "No"}</td>
                  {has(P.CATALOG_PRODUCTS_UPDATE) ? (
                    <td className="p-2 text-right">
                      <Link to={`/admin/products/${p.id}/edit`} className="text-blue-600 font-semibold hover:underline">
                        Edit
                      </Link>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data.total_pages > 1 ? (
        <div className="flex gap-2 mt-4 flex-wrap">
          {Array.from({ length: data.total_pages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              className={`px-3 py-1 rounded border ${p === page ? "bg-gray-900 text-white" : ""}`}
              onClick={() =>
                setSearchParams((prev) => {
                  const n = new URLSearchParams(prev);
                  n.set("page", String(p));
                  return n;
                })
              }
            >
              {p}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
