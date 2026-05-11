import fp from "fastify-plugin";
import { mintAuthTokenPair, verifyAccessJwt, verifyRefreshJwt } from "../lib/jwtTokens.js";
import {
  clearJwtAuthCookies,
  JWT_ACCESS_COOKIE,
  JWT_REFRESH_COOKIE,
  readBearerToken,
  setJwtAuthCookies,
} from "../lib/jwtCookies.js";

/**
 * Populates req.authUser from JWT (Authorization Bearer or br_access cookie).
 * If access is expired but refresh is valid, mints a new pair and sets cookies (silent refresh).
 */
async function jwtAuthContext(app) {
  app.addHook("preHandler", async (req, reply) => {
    req.authUser = null;

    const bearer = readBearerToken(req);
    const cookieAccess = req.cookies[JWT_ACCESS_COOKIE];
    const token = bearer || cookieAccess;

    let identity = token ? await verifyAccessJwt(token) : null;

    if (!identity) {
      const rt = req.cookies[JWT_REFRESH_COOKIE];
      const rid = rt ? await verifyRefreshJwt(rt) : null;
      if (rid) {
        try {
          const pair = await mintAuthTokenPair(rid.userId, rid.role);
          setJwtAuthCookies(reply, pair);
          identity = await verifyAccessJwt(pair.access);
        } catch {
          clearJwtAuthCookies(reply);
        }
      }
    }

    if (identity) {
      req.authUser = { id: identity.userId, role: identity.role };
    }
  });
}

export default fp(jwtAuthContext, { name: "jwt-auth-context" });
