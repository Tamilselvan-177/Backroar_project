/** @type {string | null} */
let csrfToken = null;

export function getCsrf() {
  return csrfToken;
}

export async function bootstrapCsrf() {
  const r = await fetch("/api/auth/csrf", { credentials: "include" });
  if (!r.ok) {
    csrfToken = null;
    return;
  }
  const j = await r.json();
  csrfToken = j.csrfToken ?? null;
}

/**
 * Admin multipart upload → Cloudinary queue (`POST /api/admin/products/:id/images/upload`).
 * @param {number} productId
 * @param {FileList | File[]} files
 * @param {{ variantId?: number | null }} [opts]
 */
export async function apiUploadCategoryImage(categoryId, file) {
  if (!file) throw new Error("no_file");
  await bootstrapCsrf();
  if (!csrfToken) {
    const err = new Error("Could not refresh security token. Reload the page and try again.");
    err.status = 0;
    err.body = { error: "csrf_bootstrap_failed" };
    throw err;
  }
  const form = new FormData();
  form.append("file", file);
  const headers = {
    "X-CSRF-Token": csrfToken,
  };
  const r = await fetch(`/api/admin/categories/${encodeURIComponent(categoryId)}/image`, {
    method: "POST",
    credentials: "include",
    headers,
    body: form,
  });
  const text = await r.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!r.ok) {
    const err = new Error(body?.error || body?.message || r.statusText);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return body;
}

export async function apiUploadProductImages(productId, files, opts = {}) {
  const list =
    typeof FileList !== "undefined" && files instanceof FileList
      ? Array.from(files)
      : Array.isArray(files)
        ? files
        : [];
  if (!list.length) throw new Error("no_files");
  await bootstrapCsrf();
  if (!csrfToken) {
    const err = new Error("Could not refresh security token. Reload the page and try again.");
    err.status = 0;
    err.body = { error: "csrf_bootstrap_failed" };
    throw err;
  }
  const form = new FormData();
  for (const f of list) {
    form.append("file", f);
  }
  const q =
    opts.variantId != null && opts.variantId !== ""
      ? `?variant_id=${encodeURIComponent(String(opts.variantId))}`
      : "";
  const headers = {
    "X-CSRF-Token": csrfToken,
  };
  const r = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/images/upload${q}`, {
    method: "POST",
    credentials: "include",
    headers,
    body: form,
  });
  const text = await r.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!r.ok) {
    const err = new Error(body?.error || body?.message || r.statusText);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return body;
}

export async function apiJson(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const mutating = method !== "GET" && method !== "HEAD";

  if (mutating) {
    await bootstrapCsrf();
    if (!csrfToken) {
      const err = new Error("Could not refresh security token. Reload the page and try again.");
      err.status = 0;
      err.body = { error: "csrf_bootstrap_failed" };
      throw err;
    }
  }

  const { headers: userHeaders, body: rawBody, method: _methodIgnored, ...rest } = options;

  const headers = {
    "Content-Type": "application/json",
    ...(userHeaders || {}),
  };
  if (mutating) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  let fetchBody = rawBody;
  if (method === "DELETE" && fetchBody === undefined) {
    fetchBody = "{}";
  }

  const r = await fetch(path, {
    credentials: "include",
    ...rest,
    method,
    headers,
    ...(fetchBody !== undefined ? { body: fetchBody } : {}),
  });
  const text = await r.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (!r.ok) {
    const err = new Error(parsed?.error || r.statusText);
    err.status = r.status;
    err.body = parsed;
    throw err;
  }
  return parsed;
}

export function legacyPublic(path) {
  const base = (import.meta.env.VITE_LEGACY_APP_URL || "").replace(/\/$/, "");
  if (!base) return "";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
