/** Image URL: absolute http(s), or relative to static asset base (VITE_LEGACY_APP_URL when set). */
export function productImageUrl(path) {
  if (!path) return null;
  const s = String(path);
  if (s.startsWith("http")) return s;
  const base = (import.meta.env.VITE_LEGACY_APP_URL || "").replace(/\/$/, "");
  if (!base) return null;
  return `${base}/${s.replace(/^\//, "")}`;
}

export function legacyPublic(path) {
  const base = (import.meta.env.VITE_LEGACY_APP_URL || "").replace(/\/$/, "");
  if (!base) return "";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Cart row: variant image first, then product primary image. */
export function cartLineImageUrl(row) {
  const path = row.variant_image_path || row.image_path;
  return productImageUrl(path);
}
