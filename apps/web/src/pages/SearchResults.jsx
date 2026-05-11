import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiJson } from "../api/client.js";
import { productImageUrl } from "../lib/images.js";
import { listingPriceDisplay } from "../lib/productPricing.js";

export default function SearchResults() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!q.trim()) {
      setData({ products: [], q: "" });
      return;
    }
    apiJson(`/api/search?q=${encodeURIComponent(q)}`)
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [q]);

  if (err) return <p className="text-center text-red-600 py-12">{err}</p>;
  if (!data) return <p className="text-center py-12 text-gray-600">Loading…</p>;

  const products = data.products ?? [];

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-2xl md:text-4xl font-black mb-2 uppercase tracking-wide">Search</h1>
      <p className="text-gray-600 mb-8">
        {q ? (
          <>
            Results for <span className="font-semibold text-black">&quot;{q}&quot;</span>
          </>
        ) : (
          "Enter a search query."
        )}
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {products.map((p) => {
          const lp = listingPriceDisplay(p);
          return (
            <Link
              key={p.id}
              to={`/product/${encodeURIComponent(p.slug)}`}
              className="product-card rounded-2xl border-2 border-gray-200 overflow-hidden bg-white shadow-lg hover:-translate-y-1 transition-transform"
            >
              <div className="h-52 bg-gray-50 flex items-center justify-center p-4">
                {productImageUrl(p.image_path) ? (
                  <img src={productImageUrl(p.image_path)} alt={p.name} className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-4xl">📦</span>
                )}
              </div>
              <div className="p-4">
                <h2 className="font-bold line-clamp-2">{p.name}</h2>
                <p className="mt-2 font-black text-lg flex flex-wrap items-center gap-1">
                  {lp.showFromPrefix ? (
                    <span className="text-xs font-semibold text-gray-500 uppercase">From</span>
                  ) : null}
                  {lp.mode === "single" && lp.sale != null ? (
                    <>
                      <span>₹{lp.current}</span>
                      <span className="text-sm text-gray-500 line-through font-normal">₹{lp.mrp}</span>
                    </>
                  ) : lp.showStrike && lp.strikeMrp != null ? (
                    <>
                      <span>₹{lp.current}</span>
                      <span className="text-sm text-gray-500 line-through font-normal">₹{lp.strikeMrp}</span>
                    </>
                  ) : (
                    <span>₹{lp.current}</span>
                  )}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
      {q && products.length === 0 ? <p className="text-center text-gray-600 mt-8">No products found.</p> : null}
    </div>
  );
}
