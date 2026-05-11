import { env } from "../config/env.js";

export const JWT_ACCESS_COOKIE = "br_access";
export const JWT_REFRESH_COOKIE = "br_refresh";

function cookieSecure() {
  if (typeof env.COOKIE_SECURE === "boolean") return env.COOKIE_SECURE;
  return env.NODE_ENV === "production";
}

export function setJwtAuthCookies(reply, { access, refresh }) {
  const secure = cookieSecure();
  reply.setCookie(JWT_ACCESS_COOKIE, access, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure,
    maxAge: env.JWT_ACCESS_TTL_SEC,
  });
  reply.setCookie(JWT_REFRESH_COOKIE, refresh, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure,
    maxAge: env.JWT_REFRESH_TTL_SEC,
  });
}

export function clearJwtAuthCookies(reply) {
  const secure = cookieSecure();
  reply.clearCookie(JWT_ACCESS_COOKIE, { path: "/", secure });
  reply.clearCookie(JWT_REFRESH_COOKIE, { path: "/", secure });
}

export function readBearerToken(req) {
  const h = req.headers.authorization;
  if (!h || typeof h !== "string") return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}
