import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson, legacyPublic } from "../api/client.js";
import { productImageUrl } from "../lib/images.js";

const categoryLinks = [
  { slug: "mobile-backcases", label: "Mobile Backcases", img: "/public/images/categories/backcase.png" },
  { slug: "mobile-phones", label: "Mobile Phones", img: "/public/images/categories/phone.png" },
  { slug: "tempered-glass", label: "Tempered Glass", img: "/public/images/categories/tempered.png" },
  { slug: "gadgets", label: "Gadgets", img: "/public/images/categories/gadgets.png" },
];

function groupFeaturedByCategory(products) {
  /** @type {Record<string, { name: string; slug: string | null; items: typeof products }>} */
  const map = {};
  for (const p of products) {
    const name = p.category_name || "Other";
    if (!map[name]) {
      map[name] = { name, slug: p.category_slug ?? null, items: [] };
    }
    if (!map[name].slug && p.category_slug) map[name].slug = p.category_slug;
    map[name].items.push(p);
  }
  return Object.values(map);
}

function StarRow() {
  return (
    <div className="flex items-center gap-0.5 text-[#FFA41C]" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 3.1l2.7 5.5 6 .9-4.4 4.3 1 6-5.3-2.8L6.8 19.8l1-6L3.4 9.5l6-.9L12 3.1z" />
        </svg>
      ))}
      <span className="text-[11px] text-[#007185] ml-1 font-normal">Featured</span>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    apiJson("/api/home")
      .then(setData)
      .catch((e) => setErr(e.message));
  }, []);

  const featured = data?.featured_products ?? [];
  const grouped = useMemo(() => groupFeaturedByCategory(featured), [featured]);

  const heroSrc = legacyPublic("/public/images/hero-banner.png");
  const apiCategories = data?.categories ?? [];

  const departmentTiles = apiCategories.length
    ? apiCategories
    : categoryLinks.map((x) => ({ slug: x.slug, name: x.label, image_path: null, _img: x.img }));

  const quickStrip = [
    { label: "Today's picks", href: "#featured-shop" },
    { label: "All categories", href: "/categories" },
    { label: "Shop all", href: "/products" },
    { label: "Customer service", href: "/contact" },
  ];

  return (
    <div className="home-amazon bg-[#EAEDED] text-[#0F1111]">
      <section className="relative hero-section">
        <div className="relative bg-[#131921]">
          {heroSrc ? (
            <div className="relative mx-auto max-w-[1500px]">
              <img
                src={heroSrc}
                alt="Featured promotions and seasonal picks"
                className="w-full h-[220px] sm:h-[280px] md:h-[340px] lg:h-[380px] object-cover object-center"
              />
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#EAEDED] to-transparent"
                aria-hidden="true"
              />
            </div>
          ) : (
            <div className="mx-auto max-w-[1500px] h-[200px] md:h-[260px] flex items-center justify-center bg-gradient-to-br from-[#232F3E] to-[#131921] text-white/90 text-sm px-6 text-center">
              Set VITE_LEGACY_APP_URL to your static asset base URL to show hero/category images from /public
            </div>
          )}
        </div>

        <nav
          className="bg-[#232F3E] text-white text-[13px] border-t border-white/10 shadow-inner"
          aria-label="Quick shortcuts"
        >
          <div className="max-w-[1500px] mx-auto px-3 py-2 flex items-center gap-1 overflow-x-auto scrollbar-hide whitespace-nowrap">
            {quickStrip.map(({ label, href }) =>
              href.startsWith("#") ? (
                <a
                  key={label}
                  href={href}
                  className="inline-flex items-center px-3 py-1 rounded hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                >
                  {label}
                </a>
              ) : (
                <Link
                  key={label}
                  to={href}
                  className="inline-flex items-center px-3 py-1 rounded hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                >
                  {label}
                </Link>
              ),
            )}
          </div>
        </nav>
      </section>

      <div className="max-w-[1500px] mx-auto px-3 sm:px-4 pb-10 pt-3 space-y-4">
        <section className="bg-white shadow-[0_2px_5px_rgba(15,17,17,0.15)] p-4 md:p-5 rounded-sm">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg md:text-xl font-semibold text-[#0F1111] tracking-tight">Shop by department</h2>
              <p className="text-xs text-[#565959] mt-0.5">Browse popular categories</p>
            </div>
            <Link to="/categories" className="text-[13px] font-medium text-[#007185] hover:text-[#C7511F] hover:underline">
              See all
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
            {departmentTiles.slice(0, 8).map((c) => {
              const slug = c.slug;
              const label = c.name ?? c.label;
              const img = c.image_path
                ? c.image_path.startsWith("http")
                  ? c.image_path
                  : legacyPublic(c.image_path.startsWith("/") ? c.image_path : `/${c.image_path}`)
                : legacyPublic(c._img || "");
              return (
                <Link
                  key={slug}
                  to={`/category/${encodeURIComponent(slug)}`}
                  className="group flex flex-col rounded-sm border border-[#DDD] bg-[#F8F9FA] hover:bg-white hover:border-[#C7511F]/40 overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFD814]"
                >
                  <div className="aspect-square bg-white flex items-center justify-center p-3 border-b border-[#EEE]">
                    {img ? (
                      <img src={img} alt="" className="max-h-full max-w-full object-contain group-hover:scale-[1.03] transition-transform duration-200" loading="lazy" />
                    ) : (
                      <span className="text-[11px] text-[#565959] text-center px-2">{label}</span>
                    )}
                  </div>
                  <span className="text-[12px] md:text-[13px] font-medium text-[#0F1111] px-2 py-2 leading-snug line-clamp-2 min-h-[2.75rem]">
                    {label}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section id="featured-shop" className="scroll-mt-24">
          {err && <p className="text-red-700 text-center text-sm bg-white py-4 rounded-sm shadow-sm">{err}</p>}
          {!data && !err && (
            <div className="bg-white py-16 text-center text-[#565959] text-sm rounded-sm shadow-[0_2px_5px_rgba(15,17,17,0.15)]">
              Loading storefront…
            </div>
          )}
          {data && grouped.length === 0 && (
            <div className="bg-white py-14 text-center text-[#565959] rounded-sm shadow-[0_2px_5px_rgba(15,17,17,0.15)]">
              No featured products available.{" "}
              <Link to="/products" className="text-[#007185] hover:underline">
                Browse the catalog
              </Link>
            </div>
          )}

          {grouped.map(({ name: cat, slug: catSlug, items }) => (
            <div
              key={cat}
              className="bg-white shadow-[0_2px_5px_rgba(15,17,17,0.15)] p-4 md:p-5 rounded-sm mb-4 last:mb-0"
            >
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <h2 className="text-lg md:text-xl font-semibold text-[#0F1111]">{cat}</h2>
                <Link
                  to={catSlug ? `/category/${encodeURIComponent(catSlug)}` : "/products"}
                  className="text-[13px] font-medium text-[#007185] hover:text-[#C7511F] hover:underline whitespace-nowrap"
                >
                  See more
                </Link>
              </div>
              <div
                className="flex gap-3 overflow-x-auto pb-2 px-0.5 -mx-0.5 snap-x snap-mandatory scrollbar-hide"
                style={{ scrollBehavior: "smooth" }}
              >
                {items.map((product) => (
                  <Link
                    key={product.id}
                    to={`/product/${encodeURIComponent(product.slug)}`}
                    className="home-amazon-product snap-start flex-shrink-0 w-[168px] sm:w-[188px] border border-transparent hover:border-[#DDD] rounded-sm p-2 hover:bg-[#F7FAFA] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFD814]"
                  >
                    <div className="relative bg-white h-[140px] flex items-center justify-center mb-2">
                      {product.image_path ? (
                        <img
                          src={productImageUrl(product.image_path)}
                          alt=""
                          className="max-h-[124px] max-w-full object-contain mix-blend-multiply"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-4xl opacity-40" aria-hidden="true">
                          📦
                        </span>
                      )}
                      {Number(product.is_featured) === 1 && (
                        <span className="absolute top-1 left-1 px-1.5 py-0.5 bg-[#CC0C39] text-white text-[10px] font-bold uppercase rounded-sm">
                          Bestseller
                        </span>
                      )}
                    </div>
                    <h3 className="text-[13px] leading-snug text-[#0F1111] line-clamp-2 min-h-[2.5rem] mb-1">{product.name}</h3>
                    <StarRow />
                    <div className="mt-2 flex items-baseline gap-1 flex-wrap">
                      <span className="text-[11px] text-[#565959]">₹</span>
                      <span className="text-lg font-medium text-[#0F1111]">{product.price}</span>
                    </div>
                    <span className="sr-only">View {product.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="bg-white shadow-[0_2px_5px_rgba(15,17,17,0.15)] p-4 md:p-6 rounded-sm">
          <h2 className="text-lg font-semibold text-[#0F1111] mb-4">Why shop with us</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-[13px]">
            {[
              ["Fast delivery", "Quick dispatch on in-stock items."],
              ["Easy returns", "7-day return window on eligible orders."],
              ["Secure checkout", "Your payment details stay protected."],
              ["Quality assured", "Curated products from trusted suppliers."],
            ].map(([title, sub]) => (
              <div key={title} className="flex gap-3 border border-[#EEE] rounded-sm p-3 bg-[#FAFAFA]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#232F3E] text-white text-xs font-bold">
                  ✓
                </span>
                <div>
                  <h4 className="font-semibold text-[#0F1111]">{title}</h4>
                  <p className="text-[#565959] mt-0.5 leading-snug">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <style>{`
        .home-amazon .scrollbar-hide::-webkit-scrollbar { display: none; }
        .home-amazon .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
