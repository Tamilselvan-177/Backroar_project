import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson, bootstrapCsrf } from "../api/client.js";
import { productImageUrl } from "../lib/images.js";

export default function Wishlist() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(() => {
    apiJson("/api/wishlist")
      .then(setData)
      .catch((e) => setErr(e.body?.error || e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (productId) => {
    setRemoving(productId);
    try {
      await bootstrapCsrf();
      await apiJson("/api/wishlist/remove", {
        method: "POST",
        body: JSON.stringify({ productId }),
      });
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setRemoving(null);
    }
  };

  if (err) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="mb-4">{err === "auth_required" ? "Please log in to view your wishlist." : err}</p>
        <Link to="/login" className="text-[var(--brand-accent)] font-bold underline">
          Login
        </Link>
      </div>
    );
  }
  if (!data) return <p className="text-center py-12">Loading…</p>;

  const items = data.items ?? [];

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-3xl font-black mb-2 uppercase tracking-wide">My wishlist</h1>
      <p className="text-gray-600 text-sm mb-8">Products you have saved to buy later.</p>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-600">
          Your wishlist is empty.{" "}
          <Link to="/products" className="font-semibold text-black underline">
            Browse products
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((row) => {
            const img = productImageUrl(row.image_path);
            const disabled = row.missing || !row.slug;
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="h-20 w-20 shrink-0 rounded-lg bg-gray-50 flex items-center justify-center overflow-hidden">
                  {img ? <img src={img} alt="" className="max-h-full max-w-full object-contain" /> : <span>📦</span>}
                </div>
                <div className="flex-1 min-w-[200px]">
                  {disabled ? (
                    <span className="font-semibold text-gray-500">{row.name}</span>
                  ) : (
                    <Link to={`/product/${encodeURIComponent(row.slug)}`} className="font-bold text-lg hover:underline">
                      {row.name}
                    </Link>
                  )}
                  <div className="text-sm text-gray-600 mt-1">
                    {row.sale_price && Number(row.sale_price) > 0 ? (
                      <>
                        <span className="font-bold text-black">₹{row.sale_price}</span>
                        <span className="line-through ml-2">₹{row.price}</span>
                      </>
                    ) : (
                      <span className="font-bold">₹{row.price}</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={removing === row.product_id}
                  className="text-sm font-semibold text-red-600 hover:underline disabled:opacity-50"
                  onClick={() => remove(row.product_id)}
                >
                  {removing === row.product_id ? "Removing…" : "Remove"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
