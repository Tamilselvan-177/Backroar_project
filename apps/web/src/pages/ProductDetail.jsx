import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson, bootstrapCsrf } from "../api/client.js";
import { productImageUrl } from "../lib/images.js";
import { variantMrp, variantSalePrice } from "../lib/productPricing.js";
import "../styles/product-detail.css";

function variantThumbUrl(v, fallbackPath) {
  const path = v?.image_path || fallbackPath;
  return productImageUrl(path);
}

function ReviewStars({ avgRounded }) {
  const v = Math.min(5, Math.max(0, Number(avgRounded) || 0));
  return (
    <>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ color: i <= v ? "#fbbf24" : "#d1d5db" }}>
          ★
        </span>
      ))}
    </>
  );
}

function variantStock(v, product) {
  const q = v?.quantity ?? v?.stock_quantity;
  if (q != null && q !== "") return Number(q);
  return Number(product?.stock_quantity ?? 0);
}

export default function ProductDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [me, setMe] = useState(null);
  const [adding, setAdding] = useState(false);
  const [buying, setBuying] = useState(false);
  const [activeThumb, setActiveThumb] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [mainOverride, setMainOverride] = useState(null);
  const [inWishlist, setInWishlist] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewFeedback, setReviewFeedback] = useState(null);

  const loadProduct = useCallback(() => {
    if (!slug) return;
    apiJson(`/api/product/${encodeURIComponent(slug)}`)
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [slug]);

  useEffect(() => {
    apiJson("/api/auth/me").then(setMe).catch(() => setMe({ user: null }));
  }, []);

  useEffect(() => {
    loadProduct();
  }, [loadProduct, me?.user?.id]);

  useEffect(() => {
    if (data?.in_wishlist != null) setInWishlist(!!data.in_wishlist);
  }, [data?.in_wishlist]);

  const p = data?.product;
  const imgs = data?.images?.length ? data.images : [];
  const variants = Array.isArray(p?.variants) ? p.variants : [];
  const related = data?.related_products ?? [];
  const ratingStats = data?.rating_stats ?? { avg_rating: null, total: 0 };
  const reviewRows = data?.reviews ?? [];
  const userHasReview = !!data?.user_has_review;

  const galleryUrls = useMemo(() => {
    const urls = imgs.map((im) => productImageUrl(im.image_path)).filter(Boolean);
    if (urls.length === 0 && p) {
      const u = productImageUrl(p.image_path);
      if (u) return [u];
    }
    return urls;
  }, [imgs, p]);

  const selectedVariant = useMemo(() => {
    if (!variants.length) return null;
    const id = selectedVariantId ?? variants[0]?.id;
    return variants.find((v) => Number(v.id) === Number(id)) ?? variants[0];
  }, [variants, selectedVariantId]);

  const priceDisplay = useMemo(() => {
    if (!p) return { hasSale: false, current: 0, mrp: 0, discountPct: 0 };
    const v =
      selectedVariant && String(selectedVariant.variant_name ?? "").trim()
        ? selectedVariant
        : variants.length === 1 && String(variants[0]?.variant_name ?? "").trim()
          ? variants[0]
          : {};
    const mrp = variantMrp(v, p);
    const sale = variantSalePrice(v, p);
    const hasSale = sale != null;
    const current = hasSale ? sale : mrp;
    const discountPct =
      hasSale && mrp > 0 ? Math.round(((mrp - sale) / mrp) * 100) : 0;
    return { hasSale, current, mrp, discountPct };
  }, [p, selectedVariant, variants]);

  useEffect(() => {
    if (!p) return;
    document.title = `${p.name} — Backroar`;
  }, [p]);

  const variantStockSig = useMemo(() => {
    const vars = Array.isArray(p?.variants) ? p.variants : [];
    if (!vars.length || !p) return "";
    return vars.map((v) => `${Number(v.id)}:${variantStock(v, p)}`).join("|");
  }, [p]);

  useEffect(() => {
    const vars = Array.isArray(p?.variants) ? p.variants : [];
    if (vars.length) {
      const firstAvail = vars.find((v) => variantStock(v, p) > 0);
      setSelectedVariantId((firstAvail ?? vars[0]).id);
    } else {
      setSelectedVariantId(null);
    }
    setActiveThumb(0);
    setQuantity(1);
    setMainOverride(null);
  }, [slug, p?.id, variantStockSig]);

  const maxStock = useMemo(() => {
    if (!p) return 0;
    if (selectedVariant) return variantStock(selectedVariant, p);
    return Number(p.stock_quantity ?? 0);
  }, [p, selectedVariant]);

  const mainSrc = useMemo(() => {
    if (mainOverride) return mainOverride;
    if (selectedVariant?.image_path) {
      const u = productImageUrl(selectedVariant.image_path);
      if (u) return u;
    }
    if (galleryUrls[activeThumb]) return galleryUrls[activeThumb];
    return productImageUrl(p?.image_path);
  }, [mainOverride, selectedVariant, galleryUrls, activeThumb, p]);

  const previewVariant = selectedVariant ?? variants[0];
  const previewImg = previewVariant ? variantThumbUrl(previewVariant, imgs[0]?.image_path) : null;
  const compatibilityByBrand = useMemo(() => {
    const rows = Array.isArray(p?.compatible_models) ? p.compatible_models : [];
    const groups = new Map();
    for (const row of rows) {
      const brand = String(row?.brand_name ?? "Other").trim() || "Other";
      const modelName = String(row?.name ?? "").trim();
      if (!modelName) continue;
      if (!groups.has(brand)) groups.set(brand, []);
      groups.get(brand).push(modelName);
    }
    return [...groups.entries()].map(([brand, models]) => ({ brand, models }));
  }, [p?.compatible_models]);

  async function addToCart() {
    if (!me?.user || !p) return;
    setAdding(true);
    try {
      const vid = variants.length ? selectedVariant?.id ?? variants[0]?.id : null;
      await apiJson("/api/cart/add", {
        method: "POST",
        body: JSON.stringify({
          productId: p.id,
          quantity,
          variantId: vid != null ? vid : null,
        }),
      });
      navigate("/cart");
    } catch {
      /* ignore */
    } finally {
      setAdding(false);
    }
  }

  async function submitReview(e) {
    e.preventDefault();
    if (!p || !me?.user) return;
    setReviewFeedback(null);
    setReviewSubmitting(true);
    try {
      await bootstrapCsrf();
      await apiJson("/api/reviews", {
        method: "POST",
        body: JSON.stringify({
          productId: p.id,
          rating: reviewRating,
          title: reviewTitle.trim(),
          comment: reviewComment.trim(),
        }),
      });
      setReviewTitle("");
      setReviewComment("");
      setReviewRating(5);
      setReviewFeedback({
        type: "ok",
        text: "Thanks — your review was submitted and is pending approval.",
      });
      loadProduct();
    } catch (err) {
      let msg = err.message;
      if (err.body?.error === "already_reviewed") msg = "You already reviewed this product.";
      else if (err.body?.details?.fieldErrors) msg = Object.values(err.body.details.fieldErrors).flat().join(" ");
      setReviewFeedback({ type: "err", text: msg });
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function toggleWishlist() {
    if (!me?.user || !p) {
      navigate("/login");
      return;
    }
    setWishlistBusy(true);
    try {
      await bootstrapCsrf();
      if (inWishlist) {
        await apiJson("/api/wishlist/remove", {
          method: "POST",
          body: JSON.stringify({ productId: p.id }),
        });
        setInWishlist(false);
      } else {
        await apiJson("/api/wishlist/add", {
          method: "POST",
          body: JSON.stringify({ productId: p.id }),
        });
        setInWishlist(true);
      }
    } catch {
      /* ignore */
    } finally {
      setWishlistBusy(false);
    }
  }

  async function buyNow() {
    if (!me?.user || !p) {
      navigate("/login");
      return;
    }
    setBuying(true);
    try {
      const vid = variants.length ? selectedVariant?.id ?? variants[0]?.id : null;
      await apiJson("/api/cart/buy-now", {
        method: "POST",
        body: JSON.stringify({
          productId: p.id,
          quantity,
          variantId: vid != null ? vid : null,
        }),
      });
      navigate("/checkout");
    } catch {
      /* ignore */
    } finally {
      setBuying(false);
    }
  }

  if (err) return <p className="text-center text-red-600 py-12">{err}</p>;
  if (!data || !p) return <p className="text-center py-12 text-gray-600">Loading…</p>;

  return (
    <>
      <div className="product-container">
        <nav className="breadcrumb-nav">
          <Link to="/">Home</Link>
          <span>/</span>
          <Link to="/categories">Categories</Link>
          <span>/</span>
          {p.category_slug ? (
            <>
              <Link to={`/category/${encodeURIComponent(p.category_slug)}`}>{p.category_name}</Link>
              <span>/</span>
            </>
          ) : null}
          <strong>{p.name}</strong>
        </nav>

        <div className="product-grid">
          <div className="image-gallery">
            <div className="main-image relative">
              <button
                type="button"
                className={`wishlist-fab${inWishlist ? " wishlist-fab--active" : ""}`}
                onClick={() => toggleWishlist()}
                disabled={wishlistBusy}
                aria-label={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
              >
                <span className="icon">{inWishlist ? "❤️" : "🤍"}</span>
                <span className="label">{inWishlist ? "Saved" : "Save"}</span>
              </button>
              {mainSrc ? (
                <img src={mainSrc} alt={p.name} id="mainProductImage" />
              ) : (
                <div className="emoji-placeholder" id="mainImageFallback">
                  📱
                </div>
              )}
            </div>

            {galleryUrls.length > 1 ? (
              <div className="thumbnail-grid">
                {galleryUrls.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    className={`thumbnail ${i === activeThumb ? "active" : ""}`}
                    data-image={url}
                    onClick={() => {
                      setActiveThumb(i);
                      setMainOverride(url);
                    }}
                  >
                    <img src={url} alt="" />
                  </button>
                ))}
              </div>
            ) : null}

            {variants.length > 0 && previewVariant ? (
              <div className="variant-preview-card" id="variantPreviewCard">
                <div className="variant-preview-thumb">
                  {previewImg ? (
                    <img id="variantPreviewImage" src={previewImg} alt={previewVariant.variant_name || p.name} />
                  ) : (
                    <div className="variant-preview-fallback" id="variantPreviewFallback">
                      🎨
                    </div>
                  )}
                </div>
                <div>
                  <p className="variant-preview-label">Selected Variant</p>
                  <p className="variant-preview-name" id="variantPreviewName">
                    {previewVariant.variant_name || "—"}
                  </p>
                  <p className="variant-preview-stock" id="variantPreviewStock">
                    {variantStock(previewVariant, p)} in stock
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="product-info">
            {p.brand_name ? <span className="brand-badge">{p.brand_name}</span> : null}

            <h1 className="product-title">{p.name}</h1>

            {p.model_name ? (
              <div className="compatibility-tag">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                  <line x1="12" y1="18" x2="12.01" y2="18" />
                </svg>
                Compatible with: <strong>{p.model_name}</strong>
              </div>
            ) : null}
            {compatibilityByBrand.length > 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white p-3 mb-3">
                <p className="text-xs font-semibold text-gray-700 mb-2">Compatible devices</p>
                <div className="space-y-1.5">
                  {compatibilityByBrand.map((g) => (
                    <p key={g.brand} className="text-xs text-gray-600">
                      <span className="font-semibold text-gray-800">{g.brand}:</span> {g.models.join(", ")}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="price-section">
              {priceDisplay.hasSale ? (
                <>
                  <span className="current-price">₹{priceDisplay.current}</span>
                  <span className="original-price">₹{priceDisplay.mrp}</span>
                  <span className="discount-badge">{priceDisplay.discountPct}% OFF</span>
                </>
              ) : (
                <span className="current-price">₹{priceDisplay.current}</span>
              )}
            </div>

            {maxStock > 0 ? (
              <div className="stock-status in-stock">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                In Stock ({maxStock} available)
              </div>
            ) : (
              <div className="stock-status out-of-stock">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                Out of Stock
              </div>
            )}

            {p.description ? (
              <div className="description-section">
                <h3>Product Description</h3>
                <p>{p.description}</p>
              </div>
            ) : null}

            {variants.length > 0 ? (
              <div className="bg-white rounded-lg shadow-md overflow-hidden p-6 mb-4">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Select variant</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {variants.map((v) => {
                    const thumb = variantThumbUrl(v, imgs[0]?.image_path);
                    const sel = selectedVariantId ?? variants[0]?.id;
                    const checked = Number(sel) === Number(v.id);
                    const vmrp = variantMrp(v, p);
                    const vsale = variantSalePrice(v, p);
                    const vShowSale = vsale != null;
                    return (
                      <label
                        key={v.id}
                        className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition variant-label ${
                          checked ? "border-blue-500 bg-blue-50" : "border-gray-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="variant_id"
                          className="variant-radio"
                          checked={checked}
                          onChange={() => {
                            setSelectedVariantId(v.id);
                            setQuantity(1);
                            const u = productImageUrl(v.image_path);
                            setMainOverride(u || null);
                          }}
                        />
                        <div className="variant-chip-thumb">
                          {thumb ? (
                            <img src={thumb} alt={v.variant_name} />
                          ) : (
                            <div className="variant-chip-fallback">
                              {String(v.variant_name || "?").slice(0, 1).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-gray-800">{v.variant_name}</div>
                          <div className="text-xs font-semibold text-gray-800 mt-0.5">
                            {vShowSale ? (
                              <>
                                <span>₹{vsale}</span>
                                <span className="text-gray-400 line-through ml-1 font-normal">₹{vmrp}</span>
                              </>
                            ) : (
                              <span>₹{vmrp}</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">{variantStock(v, p)} in stock</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {maxStock > 0 ? (
              <>
                <div className="add-to-cart-section mobile-cart">
                  <div className="quantity-selector qty-mobile">
                    <button
                      type="button"
                      className="qty-btn"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      readOnly
                      className="qty-input"
                      value={quantity}
                      min={1}
                      max={maxStock}
                      data-max-stock={maxStock}
                    />
                    <button
                      type="button"
                      className="qty-btn"
                      onClick={() => setQuantity((q) => Math.min(maxStock, q + 1))}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    className="add-to-cart-btn cart-mobile-btn"
                    disabled={adding}
                    onClick={addToCart}
                  >
                    {adding ? "Adding…" : "🛒 Add to Cart"}
                  </button>
                </div>

                <button
                  type="button"
                  data-buy-now
                  className="buy-now-btn"
                  disabled={buying}
                  onClick={buyNow}
                >
                  {buying ? "…" : "Buy Now"}
                </button>
              </>
            ) : variants.length > 1 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm px-4 py-3">
                This variant is out of stock. Select another variant above to purchase.
              </div>
            ) : (
              <div className="stock-status out-of-stock">
                <span>✕</span>
                <span>Out of Stock</span>
              </div>
            )}

            <div className="product-details">
              {p.sku ? (
                <div className="detail-row">
                  <span className="detail-label">SKU:</span>
                  <span className="detail-value">{p.sku}</span>
                </div>
              ) : null}
              <div className="detail-row">
                <span className="detail-label">Category:</span>
                <span className="detail-value">{p.category_name}</span>
              </div>
              {p.subcategory_name ? (
                <div className="detail-row">
                  <span className="detail-label">Type:</span>
                  <span className="detail-value">{p.subcategory_name}</span>
                </div>
              ) : null}
              {p.brand_name ? (
                <div className="detail-row">
                  <span className="detail-label">Brand:</span>
                  <span className="detail-value">{p.brand_name}</span>
                </div>
              ) : null}
              {p.store_name ? (
                <div className="detail-row">
                  <span className="detail-label">Shop Name:</span>
                  <span className="detail-value">{p.store_name}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="product-container reviews-section">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="rating-summary">
            <span className="text-sm uppercase text-gray-500 tracking-wide font-bold">Overall Rating</span>
            <div className="rating-value">
              {ratingStats.avg_rating != null ? Number(ratingStats.avg_rating).toFixed(1) : "—"}
            </div>
            <div className="rating-stars" id="ratingSummaryStars">
              <ReviewStars
                avgRounded={
                  ratingStats.avg_rating != null ? Math.round(Number(ratingStats.avg_rating)) : 0
                }
              />
            </div>
            <p className="text-sm text-gray-500 font-medium">
              {ratingStats.total > 0
                ? `Based on ${ratingStats.total} approved review${ratingStats.total === 1 ? "" : "s"}`
                : "No approved reviews yet"}
            </p>
          </div>
          <div className="md:col-span-2">
            {me?.user ? (
              userHasReview ? (
                <div className="review-form rounded-xl border border-gray-200 bg-gray-50 p-6">
                  <h3 className="font-bold text-xl mb-2">Reviews</h3>
                  <p className="text-sm text-gray-600">
                    You already submitted a review for this product. Only one review per customer is allowed.
                  </p>
                </div>
              ) : (
                <form className="review-form space-y-4 rounded-xl border border-gray-200 bg-white p-6" onSubmit={submitReview}>
                  <h3 className="font-bold text-xl">Leave a review</h3>
                  {reviewFeedback ? (
                    <div
                      className={`text-sm rounded-lg px-3 py-2 ${
                        reviewFeedback.type === "ok"
                          ? "bg-green-50 text-green-800 border border-green-200"
                          : "bg-red-50 text-red-800 border border-red-200"
                      }`}
                    >
                      {reviewFeedback.text}
                    </div>
                  ) : null}
                  <label className="block text-sm font-semibold">
                    Rating
                    <select
                      className="mt-1 w-full max-w-xs border rounded-lg px-3 py-2"
                      value={reviewRating}
                      onChange={(e) => setReviewRating(Number(e.target.value))}
                    >
                      {[5, 4, 3, 2, 1].map((n) => (
                        <option key={n} value={n}>
                          {n} stars
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-semibold">
                    Title
                    <input
                      className="mt-1 w-full border rounded-lg px-3 py-2"
                      value={reviewTitle}
                      onChange={(e) => setReviewTitle(e.target.value)}
                      maxLength={200}
                      required
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    Comment (10–2000 characters)
                    <textarea
                      className="mt-1 w-full border rounded-lg px-3 py-2 min-h-[120px]"
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      maxLength={2000}
                      required
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={reviewSubmitting}
                    className="rounded-lg bg-black text-white font-bold px-6 py-2 disabled:opacity-60"
                  >
                    {reviewSubmitting ? "Submitting…" : "Submit review"}
                  </button>
                  <p className="text-xs text-gray-500">
                    Submissions are <strong>pending approval</strong> before they appear publicly.
                  </p>
                </form>
              )
            ) : (
              <div className="review-form rounded-xl border border-gray-200 p-6">
                <p className="text-sm text-gray-600 font-medium">
                  Please{" "}
                  <Link to="/login" className="text-[var(--primary-color)] font-bold underline">
                    login
                  </Link>{" "}
                  to write a review.
                </p>
              </div>
            )}
          </div>
        </div>

        {reviewRows.length > 0 ? (
          <div className="mt-12 space-y-4">
            <h3 className="font-bold text-xl">Approved reviews</h3>
            <ul className="space-y-4">
              {reviewRows.map((r) => (
                <li key={r.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap justify-between gap-2 mb-2">
                    <span className="font-bold">{r.user_name}</span>
                    <span className="text-sm text-gray-500">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}
                    </span>
                  </div>
                  <div className="mb-1">
                    <ReviewStars avgRounded={r.rating} />
                  </div>
                  <p className="font-semibold text-gray-900">{r.title}</p>
                  <p className="text-gray-700 text-sm mt-2 whitespace-pre-wrap">{r.comment}</p>
                  {r.is_verified_purchase ? (
                    <p className="text-xs text-green-700 font-semibold mt-2">Verified purchase</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {related.length > 0 ? (
        <div className="related-section">
          <div className="product-container">
            <h2 className="section-title">You May Also Like</h2>
            <div className="related-grid">
              {related.map((rel, idx) => (
                <div key={rel.id} className={`pd-related-card stagger-${(idx % 4) + 1} animate-fade-in-up`}>
                  <Link to={`/product/${encodeURIComponent(rel.slug)}`}>
                    <div className="pd-related-card-image">
                      {productImageUrl(rel.image_path) ? (
                        <img src={productImageUrl(rel.image_path)} alt={rel.name} />
                      ) : (
                        <span className="pd-related-card-placeholder" aria-hidden />
                      )}
                    </div>
                    <div className="pd-related-card-info">
                      <h3 className="pd-related-card-title">{rel.name}</h3>
                      <span className="pd-related-card-price">
                        ₹{rel.sale_price && Number(rel.sale_price) < Number(rel.price) ? rel.sale_price : rel.price}
                      </span>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
