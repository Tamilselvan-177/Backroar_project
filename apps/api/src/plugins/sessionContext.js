import fp from "fastify-plugin";
import { getSessionKv } from "../lib/redis.js";
import { SessionStore } from "../lib/sessionStore.js";
import { env } from "../config/env.js";

export function readSessionIdFromCookie(req, store) {
  const name = store.cookieName();
  const raw = req.cookies[name];
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid) return null;
  return unsigned.value;
}

async function sessionContext(app) {
  const store = new SessionStore(getSessionKv());

  app.addHook("preHandler", async (req) => {
    const sid = readSessionIdFromCookie(req, store);
    if (!sid) {
      req.sessionId = undefined;
      req.sessionData = null;
      return;
    }
    req.sessionId = sid;
    req.sessionData = await store.get(sid);
    if (req.sessionData) {
      await store.touch(sid);
    }
  });

  app.decorate("sessionStore", store);
}

export default fp(sessionContext, { name: "session-context" });

function cookieSecure() {
  if (typeof env.COOKIE_SECURE === "boolean") return env.COOKIE_SECURE;
  return env.NODE_ENV === "production";
}

export function setSessionCookie(reply, sid, maxAgeSec = 60 * 60 * 24 * 7) {
  const store = reply.server.sessionStore;
  reply.setCookie(store.cookieName(), sid, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: cookieSecure(),
    signed: true,
    maxAge: maxAgeSec,
  });
}

export function clearSessionCookie(reply) {
  const store = reply.server.sessionStore;
  reply.clearCookie(store.cookieName(), { path: "/", signed: true });
}
