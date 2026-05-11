import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiJson } from "../api/client.js";
import { productImageUrl } from "../lib/images.js";
import { listingPriceDisplay } from "../lib/productPricing.js";

const SORT_OPTIONS = [
  { value: "p.created_at DESC", label: "Newest first" },
  { value: "p.price ASC", label: "Price: Low to High" },
  { value: "p.price DESC", label: "Price: High to Low" },
  { value: "p.name ASC", label: "Name: A to Z" },
];

function buildListQuery(searchParams) {
  const q = searchParams.toString();
  return q ? `?${q}` : "";
}

export default function ProductList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const qs = searchParams.toString();

  useEffect(() => {
    let cancelled = false;
    setErr(null);
    apiJson(`/api/products${buildListQuery(searchParams)}`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setErr(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [qs]);

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

  if (err) return <p className="text-center text-red-600 py-12">{err}</p>;
  if (!data) return <p className="text-center py-12 text-gray-600">Loading…</p>;

  const products = data.products ?? [];
  const pagination = data.pagination ?? {};
  const sort = pagination.sort ?? data.filters?.sort ?? "p.created_at DESC";
  const totalPages = pagination.total_pages ?? 1;
  const currentPage = pagination.current_page ?? 1;

  const pageHref = (page) => {
    const p = new URLSearchParams(searchParams);
    if (page > 1) p.set("page", String(page));
    else p.delete("page");
    const s = p.toString();
    return s ? `/products?${s}` : "/products";
  };

  return (
    <section className="py-10 bg-[var(--body-bg)]">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <p className="text-xs md:text-sm uppercase text-gray-500 tracking-[0.2em]">All products</p>
            <h1 className="text-3xl md:text-4xl font-black text-[var(--brand-heading)] tracking-wide">Browse collection</h1>
            <p className="text-gray-500 text-sm mt-2">
              Latest arrivals, best sellers and everyday essentials from Backroar.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <label className="text-xs md:text-sm text-gray-500 uppercase tracking-wide" htmlFor="shop-sort">
              Sort by
            </label>
            <select
              id="shop-sort"
              name="sort"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="px-4 py-2 border border-[var(--card-border)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--brand-primary)] outline-none bg-white min-w-[200px]"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {products.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {products.map((p) => {
              const img = productImageUrl(p.image_path);
              const lp = listingPriceDisplay(p);
              return (
                <Link
                  key={p.id}
                  to={`/product/${encodeURIComponent(p.slug)}`}
                  className="group bg-white rounded-2xl shadow-sm hover:shadow-2xl transition-all duration-300 overflow-hidden border border-[var(--card-border)] flex flex-col no-underline text-inherit"
                >
                  <div className="relative aspect-[4/5] bg-[var(--card-bg-alt)] flex items-center justify-center overflow-hidden">
                    {img ? (
                      <img
                        src={img}
                        alt={p.name}
                        className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="text-4xl">📦</span>
                    )}
                    {lp.mode === "single" && lp.sale != null ? (
                      <span className="absolute left-3 top-3 bg-red-600 text-white text-[10px] uppercase tracking-[0.16em] px-2 py-1 rounded-full">
                        Sale
                      </span>
                    ) : null}
                  </div>
                  <div className="p-4 flex-1 flex flex-col gap-2">
                    {p.brand_name ? (
                      <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">{p.brand_name}</p>
                    ) : null}
                    <h3 className="font-semibold text-[var(--brand-text)] text-sm md:text-base line-clamp-2 group-hover:text-[var(--brand-primary)]">
                      {p.name}
                    </h3>
                    <div className="mt-1 flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        {lp.showFromPrefix ? (
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">From</span>
                        ) : null}
                        {lp.mode === "single" && lp.sale != null ? (
                          <>
                            <span className="text-lg font-bold text-black">₹{lp.current}</span>
                            <span className="text-xs text-gray-500 line-through">₹{lp.mrp}</span>
                          </>
                        ) : lp.showStrike && lp.strikeMrp != null ? (
                          <>
                            <span className="text-lg font-bold text-[var(--brand-text)]">₹{lp.current}</span>
                            <span className="text-xs text-gray-500 line-through">₹{lp.strikeMrp}</span>
                          </>
                        ) : (
                          <span className="text-lg font-bold text-[var(--brand-text)]">₹{lp.current}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow p-10 text-center max-w-xl mx-auto">
            <div className="text-6xl mb-4">🛍️</div>
            <h2 className="text-2xl font-bold mb-2 text-[var(--brand-text)]">No products found</h2>
            <p className="text-gray-600 mb-6">Try a different sort option or explore categories.</p>
            <Link
              to="/categories"
              className="inline-block px-6 py-3 bg-[var(--brand-primary)] text-white rounded-lg font-semibold hover:bg-[var(--brand-primary-hover)]"
            >
              Browse categories
            </Link>
          </div>
        )}

        {totalPages > 1 ? (
          <div className="flex justify-center gap-2 mt-10 flex-wrap">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) =>
              page === currentPage ? (
                <span
                  key={page}
                  className="px-4 py-2 bg-[var(--brand-navbar)] text-white rounded-lg font-semibold text-sm"
                >
                  {page}
                </span>
              ) : (
                <Link
                  key={page}
                  to={pageHref(page)}
                  className="px-4 py-2 border border-[var(--card-border)] rounded-lg text-sm hover:bg-[var(--card-bg-alt)] transition"
                >
                  {page}
                </Link>
              )
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
