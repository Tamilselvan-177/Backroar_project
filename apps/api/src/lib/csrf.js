import { env } from "../config/env.js";

function normalizeOrigin(value) {
  return String(value ?? "")
    .trim()
    .replace(/\/$/, "");
}

function sameOriginRequest(req) {
  const expected = normalizeOrigin(env.WEB_ORIGIN);
  if (!expected) return false;

  const originHeader = req.headers.origin;
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
  if (origin && normalizeOrigin(origin) === expected) return true;

  const refererHeader = req.headers.referer;
  const referer = Array.isArray(refererHeader) ? refererHeader[0] : refererHeader;
  if (!referer) return false;

  try {
    return normalizeOrigin(new URL(referer).origin) === expected;
  } catch {
    return false;
  }
}

export function csrfOk(req) {
  const header = req.headers["x-csrf-token"];
  const token = Array.isArray(header) ? header[0] : header;
  if (token && req.sessionData?.csrfToken && token === req.sessionData.csrfToken) {
    return true;
  }

  // Allow same-origin browser requests even if the transient guest-session
  // cookie was not round-tripped through a proxy/CDN layer.
  return sameOriginRequest(req);
}
