import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { apiJson } from "../api/client.js";
import { productImageUrl } from "../lib/images.js";
import { listingPriceDisplay } from "../lib/productPricing.js";
import "../styles/category-view.css";

const SORT_OPTIONS = [
  { value: "p.created_at DESC", label: "✨ Newest First" },
  { value: "p.price ASC", label: "💰 Price: Low to High" },
  { value: "p.price DESC", label: "💎 Price: High to Low" },
  { value: "p.name ASC", label: "📝 Name: A to Z" },
];

function filtersToQueryString(filters, { page } = {}) {
  const p = new URLSearchParams();
  if (page != null && page > 1) p.set("page", String(page));
  if (!filters) return p.toString();
  if (filters.subcategory_id) p.set("subcategory", String(filters.subcategory_id));
  if (filters.brand_id) p.set("brand", String(filters.brand_id));
  if (filters.model_id) p.set("model", String(filters.model_id));
  if (filters.min_price) p.set("min_price", String(filters.min_price));
  if (filters.max_price) p.set("max_price", String(filters.max_price));
  if (filters.sort) p.set("sort", filters.sort);
  return p.toString();
}

export default function CategoryView() {
  const { slug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const qs = searchParams.toString();

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setErr(null);
    const path = `/api/category/${encodeURIComponent(slug)}${qs ? `?${qs}` : ""}`;
    apiJson(path)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setErr(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, qs]);

  const toggleMobileFilters = () => setMobileFiltersOpen((o) => !o);

  if (err) return <p className="text-center text-red-600 py-12">{err}</p>;
  if (!data) return <p className="text-center py-12 text-gray-600">Loading…</p>;

  const products = data.products ?? [];
  const category = data.category;
  const filters = data.filters ?? {};
  const pagination = data.pagination ?? {};
  const totalPages = pagination.total_pages ?? 1;
  const currentPage = pagination.current_page ?? 1;
  const total = pagination.total ?? 0;
  const subcategories = data.subcategories ?? [];
  const brands = data.brands ?? [];
  const models = data.models ?? [];

  const categoryPath = `/category/${encodeURIComponent(slug)}`;
  const queryWithPage = (page) => {
    const q = filtersToQueryString(filters, { page });
    return q ? `${categoryPath}?${q}` : categoryPath;
  };

  const setSort = (sort) => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set("sort", sort);
        n.delete("page");
        return n;
      },
      { replace: true }
    );
  };

  const setSubcategory = (id) => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (id) n.set("subcategory", id);
        else n.delete("subcategory");
        n.delete("page");
        return n;
      },
      { replace: true }
    );
  };

  const setBrand = (id) => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (id) n.set("brand", id);
        else n.delete("brand");
        n.delete("model");
        n.delete("page");
        return n;
      },
      { replace: true }
    );
  };

  const setModel = (id) => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (id) n.set("model", id);
        else n.delete("model");
        n.delete("page");
        return n;
      },
      { replace: true }
    );
  };

  const onApplyPrice = (e) => {
    e.preventDefault();
    const min = e.target.min_price.value.trim();
    const max = e.target.max_price.value.trim();
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (min) n.set("min_price", min);
        else n.delete("min_price");
        if (max) n.set("max_price", max);
        else n.delete("max_price");
        n.delete("page");
        return n;
      },
      { replace: true }
    );
  };

  return (
    <section className="py-14 bg-gradient-to-b from-white to-gray-50">
      <div className="container mx-auto px-4">
        <div className="mb-6 text-sm animate-fade-in">
          <Link to="/" className="breadcrumb-link font-medium">
            Home
          </Link>
          <span className="mx-3 text-gray-400">/</span>
          <Link to="/categories" className="breadcrumb-link font-medium">
            Categories
          </Link>
          <span className="mx-3 text-gray-400">/</span>
          <strong className="category-title text-2xl font-black">{category?.name}</strong>
        </div>

        <h1 className="text-4xl md:text-6xl font-black mb-12 category-title animate-fade-in-up text-center md:text-left">
          {category?.name}
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
          <aside className="lg:col-span-1 animate-fade-in-up stagger-1">
            <div className="lg:hidden mb-6">
              <button
                type="button"
                onClick={toggleMobileFilters}
                className="mobile-filter-btn w-full px-6 py-4 text-white font-black rounded-2xl shadow-2xl text-lg"
              >
                <span className="flex items-center justify-center gap-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                    />
                  </svg>
                  Filters & Sort
                </span>
              </button>
            </div>

            <div
              id="mobileFilters"
              className={`${mobileFiltersOpen ? "" : "hidden"} lg:block animate-slide-down`}
            >
              <div className="filter-card p-8 rounded-3xl shadow-2xl">
                <h3 className="text-xl font-black mb-8 category-title flex items-center gap-3">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                    />
                  </svg>
                  Advanced Filters
                </h3>

                <form id="filterForm" className="space-y-8" onSubmit={onApplyPrice}>
                  {subcategories.length > 0 ? (
                    <div>
                      <label className="block text-sm font-black mb-4 category-title" htmlFor="subcategory-select">
                        Product Type
                      </label>
                      <select
                        id="subcategory-select"
                        className="w-full px-4 py-3 rounded-2xl text-lg"
                        value={filters.subcategory_id != null ? String(filters.subcategory_id) : ""}
                        onChange={(e) => setSubcategory(e.target.value)}
                      >
                        <option value="">All Types</option>
                        {subcategories.map((sub) => (
                          <option key={sub.id} value={String(sub.id)}>
                            {sub.name} ({sub.product_count})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {brands.length > 0 ? (
                    <div>
                      <label className="block text-sm font-black mb-4 category-title" htmlFor="brand-select">
                        Brand
                      </label>
                      <select
                        id="brand-select"
                        className="w-full px-4 py-3 rounded-2xl text-lg"
                        value={filters.brand_id != null ? String(filters.brand_id) : ""}
                        onChange={(e) => setBrand(e.target.value)}
                      >
                        <option value="">All Brands</option>
                        {brands.map((brand) => (
                          <option key={brand.id} value={String(brand.id)}>
                            {brand.name} ({brand.product_count})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {models.length > 0 ? (
                    <div>
                      <label className="block text-sm font-black mb-4 category-title" htmlFor="model-select">
                        Model
                      </label>
                      <select
                        id="model-select"
                        className="w-full px-4 py-3 rounded-2xl text-lg"
                        value={filters.model_id != null ? String(filters.model_id) : ""}
                        onChange={(e) => setModel(e.target.value)}
                      >
                        <option value="">All Models</option>
                        {models.map((model) => (
                          <option key={model.id} value={String(model.id)}>
                            {model.name}
                            {model.product_count != null ? ` (${model.product_count})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <div className="border-t border-gray-200 pt-8">
                    <label className="block text-sm font-black mb-5 category-title">Price Range</label>
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <input
                        type="number"
                        name="min_price"
                        placeholder="Min ₹"
                        defaultValue={filters.min_price ?? ""}
                        key={`min-${qs}`}
                        className="w-full px-4 py-3 rounded-2xl text-lg font-semibold"
                      />
                      <input
                        type="number"
                        name="max_price"
                        placeholder="Max ₹"
                        defaultValue={filters.max_price ?? ""}
                        key={`max-${qs}`}
                        className="w-full px-4 py-3 rounded-2xl text-lg font-semibold"
                      />
                    </div>
                    <button
                      type="submit"
                      className="btn-primary w-full px-6 py-4 text-lg font-black rounded-2xl shadow-2xl"
                    >
                      🔍 Apply Filters
                    </button>
                  </div>

                  <Link
                    to={categoryPath}
                    className="block w-full px-6 py-4 border-2 border-gray-300 rounded-2xl text-center font-black text-lg text-gray-700 hover:border-black hover:text-black transition-all duration-300 hover:shadow-xl"
                  >
                    🧹 Clear All Filters
                  </Link>
                </form>
              </div>
            </div>
          </aside>

          <main className="lg:col-span-3 animate-fade-in-up stagger-2">
            <div className="sort-bar p-6 rounded-3xl shadow-xl mb-10">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <p className="text-lg font-semibold text-gray-700">
                  Showing <span className="category-title font-black">{products.length}</span> of{" "}
                  <span className="category-title font-black">{total}</span> products
                </p>

                <div className="w-full md:w-auto">
                  <select
                    className="w-full md:w-72 px-5 py-3 border-2 border-gray-300 rounded-2xl bg-white text-lg font-semibold shadow-md"
                    value={filters.sort ?? "p.created_at DESC"}
                    onChange={(e) => setSort(e.target.value)}
                    aria-label="Sort products"
                  >
                    {SORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {products.length > 0 ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-8 mb-12">
                  {products.map((p) => {
                    const img = productImageUrl(p.image_path);
                    const lp = listingPriceDisplay(p);
                    return (
                      <Link
                        key={p.id}
                        to={`/product/${encodeURIComponent(p.slug)}`}
                        className="cat-plp-card group overflow-hidden rounded-3xl shadow-2xl h-full no-underline text-inherit"
                      >
                        <div className="product-image-wrapper aspect-square relative">
                          {lp.mode === "single" && lp.sale != null ? (
                            <div className="sale-badge">🔥 SALE</div>
                          ) : null}
                          {img ? (
                            <img src={img} alt={p.name} className="product-grid-img" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                              <div className="text-5xl animate-pulse">📦</div>
                            </div>
                          )}
                        </div>
                        <div className="p-6 bg-white relative z-[2]">
                          {p.brand_name ? (
                            <p className="text-xs font-black uppercase tracking-wider mb-3 text-gray-600">{p.brand_name}</p>
                          ) : null}
                          <h3 className="product-title mb-4">{p.name}</h3>
                          <div className="price-row flex flex-wrap items-center gap-2">
                            {lp.showFromPrefix ? (
                              <span className="text-xs font-black uppercase text-gray-500">From</span>
                            ) : null}
                            {lp.mode === "single" && lp.sale != null ? (
                              <>
                                <span className="text-2xl font-black price-highlight">₹{lp.current}</span>
                                <span className="text-sm font-medium price-strikethrough line-through">₹{lp.mrp}</span>
                              </>
                            ) : lp.showStrike && lp.strikeMrp != null ? (
                              <>
                                <span className="text-2xl font-black price-highlight">₹{lp.current}</span>
                                <span className="text-sm font-medium price-strikethrough line-through">₹{lp.strikeMrp}</span>
                              </>
                            ) : (
                              <span className="text-2xl font-black price-highlight">₹{lp.current}</span>
                            )}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {totalPages > 1 ? (
                  <div className="flex justify-center gap-2 mb-4 flex-wrap">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) =>
                      page === currentPage ? (
                        <span
                          key={page}
                          className="px-4 py-2 bg-[var(--brand-navbar)] text-white rounded-xl text-sm font-semibold"
                        >
                          {page}
                        </span>
                      ) : (
                        <Link
                          key={page}
                          to={queryWithPage(page)}
                          className="px-4 py-2 border border-[var(--card-border)] rounded-xl text-sm hover:bg-[var(--card-bg-alt)] transition"
                        >
                          {page}
                        </Link>
                      )
                    )}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="empty-state p-20 rounded-3xl shadow-2xl text-center mx-auto max-w-2xl">
                <div className="text-8xl mb-8 animate-float">🔍</div>
                <h3 className="text-4xl font-black mb-6 category-title">No Products Found</h3>
                <p className="text-xl text-gray-600 mb-10 font-medium leading-relaxed">
                  Try adjusting your filters or check back later for new arrivals
                </p>
                <Link
                  to={categoryPath}
                  className="inline-block px-10 py-5 btn-primary text-xl font-black rounded-3xl shadow-2xl"
                >
                  ✨ Clear All Filters
                </Link>
              </div>
            )}
          </main>
        </div>
      </div>
    </section>
  );
}
