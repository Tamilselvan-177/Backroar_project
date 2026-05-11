import * as jose from "jose";
import { env } from "../config/env.js";

function keyBytes() {
  const s = env.JWT_SECRET || env.SESSION_SECRET;
  return new TextEncoder().encode(s);
}

export async function mintAuthTokenPair(userId, role) {
  const key = keyBytes();
  const sub = String(userId);
  const r = String(role);
  const access = await new jose.SignJWT({ role: r, typ: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_ACCESS_TTL_SEC}s`)
    .sign(key);

  const refresh = await new jose.SignJWT({ role: r, typ: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_REFRESH_TTL_SEC}s`)
    .sign(key);

  return { access, refresh };
}

/** @returns {{ userId: number, role: string } | null} */
export async function verifyAccessJwt(token) {
  if (!token || typeof token !== "string") return null;
  try {
    const { payload } = await jose.jwtVerify(token, keyBytes(), { algorithms: ["HS256"] });
    if (payload.typ !== "access") return null;
    const userId = Number(payload.sub);
    if (!Number.isFinite(userId) || userId <= 0) return null;
    const role = payload.role != null ? String(payload.role) : "";
    if (!role) return null;
    return { userId, role };
  } catch {
    return null;
  }
}

/** @returns {{ userId: number, role: string } | null} */
export async function verifyRefreshJwt(token) {
  if (!token || typeof token !== "string") return null;
  try {
    const { payload } = await jose.jwtVerify(token, keyBytes(), { algorithms: ["HS256"] });
    if (payload.typ !== "refresh") return null;
    const userId = Number(payload.sub);
    if (!Number.isFinite(userId) || userId <= 0) return null;
    const role = payload.role != null ? String(payload.role) : "";
    if (!role) return null;
    return { userId, role };
  } catch {
    return null;
  }
}
