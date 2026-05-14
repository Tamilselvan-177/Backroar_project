import {
  forgotPasswordBodySchema,
  googleLoginBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
} from "../schemas/auth.js";
import {
  cartAddBodySchema,
  cartBuyNowBodySchema,
  cartRemoveBodySchema,
  cartUpdateBodySchema,
} from "../schemas/cart.js";
import { computeCartTotals } from "../lib/cartTotals.js";
import { setSessionCookie, clearSessionCookie, readSessionIdFromCookie } from "../plugins/sessionContext.js";
import { env } from "../config/env.js";
import { normalizeProductListSort } from "../repositories/mongo/productRepository.js";
import { csrfOk } from "../lib/csrf.js";
import { wishlistProductBodySchema } from "../schemas/wishlist.js";
import { reviewCreateBodySchema } from "../schemas/review.js";
import { checkoutBodySchema, checkoutCouponPreviewSchema } from "../schemas/checkout.js";
import { mintAuthTokenPair, verifyRefreshJwt } from "../lib/jwtTokens.js";
import {
  clearJwtAuthCookies,
  JWT_REFRESH_COOKIE,
  setJwtAuthCookies,
} from "../lib/jwtCookies.js";

/** KV session holds CSRF + POS payloads only — strip legacy user identity fields. */
function pickKvSession(raw, genCsrf) {
  if (!raw || typeof raw !== "object") return { csrfToken: genCsrf() };
  const csrfToken =
    typeof raw.csrfToken === "string" && raw.csrfToken.length > 0 ? raw.csrfToken : genCsrf();
  const next = { csrfToken };
  if (raw.pos !== undefined) next.pos = raw.pos;
  if (raw.stock_transfer !== undefined) next.stock_transfer = raw.stock_transfer;
  if (raw.pos_resume !== undefined) next.pos_resume = raw.pos_resume;
  return next;
}

async function ensureGuestSession(req, reply) {
  const store = req.server.sessionStore;
  let sid = readSessionIdFromCookie(req, store);
  let data = sid ? await store.get(sid) : null;

  if (!sid || !data) {
    sid = store.generateSid();
    data = { csrfToken: store.generateCsrf() };
    await store.set(sid, data);
    setSessionCookie(reply, sid);
  } else {
    const legacy =
      data.userId != null ||
      data.role != null ||
      data.userEmail != null ||
      data.userName != null;
    if (legacy) {
      data = pickKvSession(data, () => store.generateCsrf());
      await store.set(sid, data);
    } else if (!data.csrfToken || typeof data.csrfToken !== "string") {
      data = pickKvSession(data, () => store.generateCsrf());
      await store.set(sid, data);
    }
  }

  req.sessionId = sid;
  req.sessionData = data;
  return data;
}

function requireUserId(req, reply) {
  const uid = req.authUser?.id;
  if (!uid) {
    reply.code(401).send({ error: "auth_required" });
    return null;
  }
  return uid;
}

export async function registerRoutes(app, { repos, authService, rbacService }) {
  app.get("/api/health", async () => ({ ok: true, db: "mongo" }));

  app.get("/api/auth/csrf", async (req, reply) => {
    const data = await ensureGuestSession(req, reply);
    return { csrfToken: data.csrfToken };
  });

  app.get("/api/auth/me", async (req) => {
    if (!req.authUser?.id) {
      return { user: null };
    }
    const user = await repos.users.findById(req.authUser.id);
    if (!user) return { user: null };
    const isAdmin = await rbacService.isAdmin(req.authUser.role, user.id);
    const isStaffPanel = await rbacService.isAdminOrStaff(req.authUser.role, user.id);
    const adminPermissionKeys = isStaffPanel
      ? await rbacService.listAdminPanelPermissionKeys(req.authUser.role, user.id)
      : [];
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isAdmin,
        isStaffPanel,
        adminPermissionKeys,
      },
    };
  });

  app.post(
    "/api/auth/login",
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 minute",
        },
      },
    },
    async (req, reply) => {
      await ensureGuestSession(req, reply);
      if (!csrfOk(req)) {
        return reply.code(403).send({ error: "csrf_failed" });
      }
      const parsed = loginBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_failed", details: parsed.error.flatten() });
      }
      const { email, password } = parsed.data;
      const user = await authService.verifyCredentials(email, password);
      if (!user) {
        return reply.code(401).send({ error: "invalid_credentials" });
      }
      const store = req.server.sessionStore;
      const csrf = store.generateCsrf();
      await store.set(req.sessionId, { csrfToken: csrf });
      req.sessionData = { csrfToken: csrf };
      const tokens = await mintAuthTokenPair(user.id, user.role);
      setJwtAuthCookies(reply, tokens);
      await repos.users.updateLastLogin(user.id);
      const redirect =
        user.role === "admin" || user.role === "staff" ? "/admin" : "/account";
      return {
        ok: true,
        redirect,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        accessToken: tokens.access,
        refreshToken: tokens.refresh,
        expiresIn: env.JWT_ACCESS_TTL_SEC,
      };
    });

  app.post(
    "/api/auth/register",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      await ensureGuestSession(req, reply);
      if (!csrfOk(req)) {
        return reply.code(403).send({ error: "csrf_failed" });
      }
      const parsed = registerBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_failed", details: parsed.error.flatten() });
      }
      const { name, email, phone, password } = parsed.data;
      if (await repos.users.emailExists(email)) {
        return reply.code(400).send({ error: "email_taken" });
      }
      const userId = await authService.register({ name, email, phone, password });
      const store = req.server.sessionStore;
      const csrf = store.generateCsrf();
      await store.set(req.sessionId, { csrfToken: csrf });
      req.sessionData = { csrfToken: csrf };
      const tokens = await mintAuthTokenPair(userId, "customer");
      setJwtAuthCookies(reply, tokens);
      return {
        ok: true,
        redirect: "/account",
        user: { id: userId, name, email, role: "customer" },
        accessToken: tokens.access,
        refreshToken: tokens.refresh,
        expiresIn: env.JWT_ACCESS_TTL_SEC,
      };
    }
  );

  app.post(
    "/api/auth/forgot-password",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      await ensureGuestSession(req, reply);
      if (!csrfOk(req)) {
        return reply.code(403).send({ error: "csrf_failed" });
      }
      const parsed = forgotPasswordBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_failed", details: parsed.error.flatten() });
      }
      const email = String(parsed.data.email).toLowerCase().trim();
      const user = await repos.users.findByEmail(email);
      let resetPreviewLink = null;
      if (user?.id && user?.is_active) {
        const token = authService.makePasswordResetToken();
        const expiresAt = new Date(Date.now() + 1000 * 60 * 30);
        await repos.users.setPasswordResetToken(user.id, token.hash, expiresAt);
        const base = (env.APP_URL || env.WEB_ORIGIN || "").replace(/\/+$/, "");
        const resetPath = `/reset-password?token=${encodeURIComponent(token.raw)}`;
        resetPreviewLink = `${base}${resetPath}`;
        req.log.info({ userId: user.id, resetPath }, "password reset requested");
      }
      return {
        ok: true,
        message: "If that email exists, a password reset link has been generated.",
        ...(env.NODE_ENV !== "production" && resetPreviewLink ? { reset_link: resetPreviewLink } : {}),
      };
    }
  );

  app.post(
    "/api/auth/reset-password",
    {
      config: {
        rateLimit: { max: 15, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      await ensureGuestSession(req, reply);
      if (!csrfOk(req)) {
        return reply.code(403).send({ error: "csrf_failed" });
      }
      const parsed = resetPasswordBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_failed", details: parsed.error.flatten() });
      }
      const tokenHash = authService.hashPasswordResetToken(parsed.data.token);
      const user = await repos.users.findByPasswordResetTokenHash(tokenHash);
      if (!user?.id) {
        return reply.code(400).send({ error: "token_invalid_or_expired" });
      }
      await authService.setPassword(user.id, parsed.data.password);
      await repos.users.clearPasswordResetToken(user.id);
      return { ok: true };
    }
  );

  app.post(
    "/api/auth/google",
    {
      config: {
        rateLimit: { max: 30, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      await ensureGuestSession(req, reply);
      if (!csrfOk(req)) {
        return reply.code(403).send({ error: "csrf_failed" });
      }
      const parsed = googleLoginBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_failed", details: parsed.error.flatten() });
      }
      let user = null;
      try {
        user = await authService.loginOrRegisterWithGoogle(parsed.data.id_token);
      } catch (err) {
        const msg = String(err?.message || "");
        if (msg === "google_not_configured") return reply.code(503).send({ error: msg });
        if (msg === "google_email_not_verified") return reply.code(400).send({ error: msg });
        req.log.error({ err }, "google login failed");
        return reply.code(400).send({ error: "google_token_invalid" });
      }
      if (!user) return reply.code(401).send({ error: "invalid_credentials" });
      const store = req.server.sessionStore;
      const csrf = store.generateCsrf();
      await store.set(req.sessionId, { csrfToken: csrf });
      req.sessionData = { csrfToken: csrf };
      const tokens = await mintAuthTokenPair(user.id, user.role);
      setJwtAuthCookies(reply, tokens);
      await repos.users.updateLastLogin(user.id);
      const redirect = user.role === "admin" || user.role === "staff" ? "/admin" : "/account";
      return {
        ok: true,
        redirect,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        accessToken: tokens.access,
        refreshToken: tokens.refresh,
        expiresIn: env.JWT_ACCESS_TTL_SEC,
      };
    }
  );

  app.post("/api/auth/refresh", async (req, reply) => {
    await ensureGuestSession(req, reply);
    if (!csrfOk(req)) {
      return reply.code(403).send({ error: "csrf_failed" });
    }
    const rt = req.cookies[JWT_REFRESH_COOKIE];
    const rid = rt ? await verifyRefreshJwt(rt) : null;
    if (!rid) {
      return reply.code(401).send({ error: "refresh_invalid" });
    }
    const tokens = await mintAuthTokenPair(rid.userId, rid.role);
    setJwtAuthCookies(reply, tokens);
    return { ok: true, expiresIn: env.JWT_ACCESS_TTL_SEC };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    if (!csrfOk(req)) {
      return reply.code(403).send({ error: "csrf_failed" });
    }
    const store = req.server.sessionStore;
    if (req.sessionId) {
      await store.destroy(req.sessionId);
    }
    clearJwtAuthCookies(reply);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/api/home", async () => {
    const categories = await repos.categories.getActive();
    const featured_products = await repos.products.getFeatured(8);
    return { categories, featured_products };
  });

  app.get("/api/categories", async () => {
    const categories = await repos.categories.getActive();
    return { categories };
  });

  app.get("/api/category/:slug", async (req, reply) => {
    const page = Math.max(1, Number(req.query?.page) || 1);
    const limit = Math.min(48, Math.max(1, Number(req.query?.limit) || 24));
    const sort = String(req.query?.sort ?? "p.created_at DESC").trim();
    const { products, category, total, appliedFilters } = await repos.products.listByCategorySlug(req.params.slug, {
      page,
      limit,
      sort,
      subcategory_id: req.query?.subcategory,
      brand_id: req.query?.brand,
      model_id: req.query?.model,
      min_price: req.query?.min_price,
      max_price: req.query?.max_price,
    });
    if (!category) {
      return reply.code(404).send({ error: "category_not_found" });
    }
    const total_pages = Math.max(1, Math.ceil(total / limit));
    const facets = await repos.products.getCategoryFacets(category.id, {
      brand_id: appliedFilters?.brand_id,
    });
    return {
      category,
      products,
      page,
      limit,
      total,
      total_pages,
      pagination: {
        total,
        current_page: page,
        total_pages,
        per_page: limit,
      },
      filters: appliedFilters,
      subcategories: facets.subcategories,
      brands: facets.brands,
      models: facets.models,
    };
  });

  app.get("/api/products", async (req) => {
    const page = Math.max(1, Number(req.query?.page) || 1);
    const limit = Math.min(48, Math.max(1, Number(req.query?.limit) || 24));
    const sort = String(req.query?.sort ?? "p.created_at DESC").trim();
    const { products, total } = await repos.products.listActive({ page, limit, sort });
    const total_pages = Math.max(1, Math.ceil(total / limit));
    const sortNorm = normalizeProductListSort(sort);
    return {
      products,
      page,
      limit,
      total,
      total_pages,
      pagination: {
        total,
        current_page: page,
        total_pages,
        sort: sortNorm,
        per_page: limit,
      },
      filters: { sort: sortNorm },
    };
  });

  app.get("/api/search", async (req) => {
    const q = String(req.query?.q ?? "").trim();
    const limit = Math.min(48, Math.max(1, Number(req.query?.limit) || 24));
    if (!q) return { products: [], q: "", total: 0 };
    const products = await repos.products.search(q, { limit });
    return { products, q, total: products.length };
  });

  app.get("/api/product/:slug", async (req, reply) => {
    const payload = await repos.products.findBySlugWithCategory(req.params.slug);
    if (!payload) {
      return reply.code(404).send({ error: "product_not_found" });
    }
    const uid = req.authUser?.id;
    const pid = payload.product.id;
    if (uid) {
      payload.in_wishlist = await repos.wishlist.exists(uid, pid);
      payload.user_has_review = await repos.reviews.exists(uid, pid);
    } else {
      payload.in_wishlist = false;
      payload.user_has_review = false;
    }
    payload.rating_stats = await repos.reviews.getAverageRating(pid);
    payload.reviews = await repos.reviews.listApprovedForProduct(pid);
    return payload;
  });

  app.get("/api/cart", async (req, reply) => {
    const uid = requireUserId(req, reply);
    if (uid == null) return;
    const items = await repos.cart.getCartItems(uid);
    const count = await repos.cart.getCartCount(uid);
    const totals = computeCartTotals(items);
    return { items, count, totals };
  });

  app.get("/api/cart/count", async (req, reply) => {
    const uid = requireUserId(req, reply);
    if (uid == null) return;
    const count = await repos.cart.getCartCount(uid);
    return { count };
  });

  app.post("/api/cart/add", async (req, reply) => {
    const uid = requireUserId(req, reply);
    if (uid == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const parsed = cartAddBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_failed", details: parsed.error.flatten() });
    }
    const { productId, quantity, variantId } = parsed.data;
    const product = await repos.products.findById(productId);
    if (!product) return reply.code(404).send({ error: "product_not_found" });
    await repos.cart.addItem({ userId: uid, productId, quantity, variantId: variantId ?? null });
    const items = await repos.cart.getCartItems(uid);
    const count = await repos.cart.getCartCount(uid);
    return { ok: true, count, totals: computeCartTotals(items) };
  });

  app.post("/api/cart/buy-now", async (req, reply) => {
    const uid = requireUserId(req, reply);
    if (uid == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const parsed = cartBuyNowBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_failed", details: parsed.error.flatten() });
    }
    const { productId, quantity, variantId } = parsed.data;
    const product = await repos.products.findById(productId);
    if (!product) return reply.code(404).send({ error: "product_not_found" });
    const vid =
      variantId != null && variantId !== "" && !Number.isNaN(Number(variantId)) ? Number(variantId) : null;
    const maxStock = repos.products.posAvailableQty(product, vid);
    if (quantity > maxStock) {
      return reply.code(400).send({
        error: "insufficient_stock",
        message:
          maxStock <= 0
            ? "This option is out of stock."
            : `Only ${maxStock} items available.`,
      });
    }
    await repos.cart.clearForUser(uid);
    await repos.cart.addItem({ userId: uid, productId, quantity, variantId: variantId ?? null });
    const items = await repos.cart.getCartItems(uid);
    return { ok: true, redirect: "/checkout", totals: computeCartTotals(items) };
  });

  app.post("/api/cart/update", async (req, reply) => {
    const uid = requireUserId(req, reply);
    if (uid == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const parsed = cartUpdateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_failed", details: parsed.error.flatten() });
    }
    await repos.cart.updateQuantity({ userId: uid, ...parsed.data });
    const items = await repos.cart.getCartItems(uid);
    const count = await repos.cart.getCartCount(uid);
    return { ok: true, count, totals: computeCartTotals(items) };
  });

  app.post("/api/cart/remove", async (req, reply) => {
    const uid = requireUserId(req, reply);
    if (uid == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const parsed = cartRemoveBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_failed", details: parsed.error.flatten() });
    }
    await repos.cart.removeItem({ userId: uid, cartItemId: parsed.data.cartItemId });
    const items = await repos.cart.getCartItems(uid);
    const count = await repos.cart.getCartCount(uid);
    return { ok: true, count, totals: computeCartTotals(items) };
  });

  app.post("/api/cart/clear", async (req, reply) => {
    const uid = requireUserId(req, reply);
    if (uid == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    await repos.cart.clearForUser(uid);
    return { ok: true, count: 0, totals: computeCartTotals([]) };
  });

  app.post("/api/checkout/coupon-preview", async (req, reply) => {
    const uid = requireUserId(req, reply);
    if (uid == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const parsed = checkoutCouponPreviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_failed", details: parsed.error.flatten() });
    }
    const items = await repos.cart.getCartItems(uid);
    if (!items.length) {
      return reply.code(400).send({ error: "empty_cart", message: "Your cart is empty." });
    }
    const totals = computeCartTotals(items);
    const quote = await repos.coupons.quoteForCheckout({
      code: parsed.data.couponCode,
      userId: uid,
      subtotal: totals.subtotal,
    });
    if (!quote.ok) {
      return reply.code(400).send({ error: quote.error, message: quote.message });
    }
    return {
      ok: true,
      coupon: quote.coupon,
      totals: {
        ...totals,
        discount: Number(quote.discount_amount || 0),
        total: Math.max(0, Number(totals.total || 0) - Number(quote.discount_amount || 0)),
      },
    };
  });

  app.get("/api/wishlist", async (req, reply) => {
    const uid = requireUserId(req, reply);
    if (uid == null) return;
    const items = await repos.wishlist.listForUser(uid);
    return { items };
  });

  app.post("/api/wishlist/add", async (req, reply) => {
    const uid = requireUserId(req, reply);
    if (uid == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const parsed = wishlistProductBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_failed", details: parsed.error.flatten() });
    }
    try {
      const r = await repos.wishlist.add(uid, parsed.data.productId);
      return { ok: true, already: r.already === true };
    } catch (e) {
      if (e.message === "product_not_found") return reply.code(422).send({ error: "product_not_found" });
      throw e;
    }
  });

  app.post("/api/reviews", async (req, reply) => {
    const uid = requireUserId(req, reply);
    if (uid == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const parsed = reviewCreateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_failed", details: parsed.error.flatten() });
    }
    const { productId, rating, title, comment } = parsed.data;
    const product = await repos.products.findById(productId);
    if (!product) {
      return reply.code(404).send({ error: "product_not_found" });
    }
    if (await repos.reviews.exists(uid, productId)) {
      return reply.code(422).send({ error: "already_reviewed" });
    }
    const verified = (await repos.reviews.userVerifiedPurchase(uid, productId)) ? 1 : 0;
    try {
      await repos.reviews.create({
        userId: uid,
        productId,
        rating,
        title,
        comment,
        status: "pending",
        isVerifiedPurchase: verified,
      });
    } catch (e) {
      if (e.code === 11000) {
        return reply.code(422).send({ error: "already_reviewed" });
      }
      throw e;
    }
    return {
      ok: true,
      message: "Review submitted successfully and is pending approval",
    };
  });

  app.post("/api/wishlist/remove", async (req, reply) => {
    const uid = requireUserId(req, reply);
    if (uid == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const parsed = wishlistProductBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_failed", details: parsed.error.flatten() });
    }
    await repos.wishlist.remove(uid, parsed.data.productId);
    return { ok: true };
  });

  app.get("/api/me/addresses", async (req, reply) => {
    const uid = requireUserId(req, reply);
    if (uid == null) return;
    const addresses = await repos.users.listShippingAddresses(uid);
    return { addresses };
  });

  app.post("/api/me/addresses", async (req, reply) => {
    const uid = requireUserId(req, reply);
    if (uid == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const r = await repos.users.addShippingAddress(uid, body);
    if (!r.ok) return reply.code(400).send({ error: r.error });
    return { ok: true, address: r.address };
  });

  app.patch("/api/me/addresses/:addressId", async (req, reply) => {
    const uid = requireUserId(req, reply);
    if (uid == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const r = await repos.users.updateShippingAddress(uid, req.params.addressId, body);
    if (!r.ok) {
      if (r.error === "invalid_id" || r.error === "validation_failed") {
        return reply.code(400).send({ error: r.error });
      }
      if (r.error === "not_found") return reply.code(404).send({ error: r.error });
      return reply.code(400).send({ error: r.error });
    }
    return { ok: true, address: r.address };
  });

  app.delete("/api/me/addresses/:addressId", async (req, reply) => {
    const uid = requireUserId(req, reply);
    if (uid == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const r = await repos.users.deleteShippingAddress(uid, req.params.addressId);
    if (!r.ok) return reply.code(r.error === "invalid_id" ? 400 : 404).send({ error: r.error });
    return { ok: true };
  });

  app.get("/api/orders", async (req, reply) => {
    const uid = requireUserId(req, reply);
    if (uid == null) return;
    const page = req.query?.page ?? 1;
    const perPage = req.query?.perPage ?? req.query?.per_page ?? 10;
    return repos.checkout.listForUser(uid, { page, perPage });
  });

  app.get("/api/order/:orderNumber", async (req, reply) => {
    const uid = requireUserId(req, reply);
    if (uid == null) return;
    const order = await repos.checkout.findForUserByOrderNumber(uid, req.params.orderNumber);
    if (!order) {
      return reply.code(404).send({ error: "order_not_found" });
    }
    return { order };
  });

  app.post("/api/order/cancel", async (req, reply) => {
    const uid = requireUserId(req, reply);
    if (uid == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const orderId = Number(body.order_id ?? body.orderId ?? 0);
    const r = await repos.checkout.cancelOrderForUser(uid, orderId);
    if (!r.ok) {
      if (r.error === "not_found") return reply.code(404).send({ error: "not_found" });
      if (r.error === "not_cancellable") return reply.code(409).send({ error: "not_cancellable" });
      return reply.code(400).send({ error: r.error });
    }
    return { ok: true, order: r.order };
  });

  app.post("/api/checkout", async (req, reply) => {
    const uid = requireUserId(req, reply);
    if (uid == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const parsed = checkoutBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_failed", details: parsed.error.flatten() });
    }
    const { shipping, couponCode } = parsed.data;
    const r = await repos.checkout.placeOrder(
      { userId: uid, shipping, couponCode: couponCode?.trim() || null },
      repos
    );
    if (!r.ok) {
      if (r.error === "empty_cart") {
        return reply.code(400).send({ error: r.error, message: r.message });
      }
      if (r.error === "cart_validation_failed") {
        return reply.code(400).send({ error: r.error, errors: r.errors });
      }
      if (r.error === "insufficient_stock") {
        return reply.code(409).send({ error: r.error, message: r.message });
      }
      if (String(r.error || "").startsWith("coupon_")) {
        return reply.code(400).send({ error: r.error, message: r.message });
      }
      return reply.code(500).send({ error: "checkout_failed" });
    }
    return { ok: true, order_number: r.order_number, order: r.order };
  });

}
