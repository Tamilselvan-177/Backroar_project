import { getDb } from "../db/mongo.js";
import { PERM } from "../lib/adminPermissionCatalog.js";
import { requireStaffWithPermission } from "../lib/staffPermissionGate.js";
import { csrfOk } from "../lib/csrf.js";
import { posFinancialYears } from "../lib/posFinancialYears.js";
import { changeBreakdown, computePosCartTotals, round2 } from "../lib/posTotals.js";

function parseJsonBody(body) {
  if (body == null || typeof body !== "object") return {};
  return body;
}

function csvEscapeCell(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function saveSession(req) {
  if (req.sessionId && req.sessionData) {
    await req.server.sessionStore.set(req.sessionId, req.sessionData);
  }
}

async function requireStaff(req, reply, rbacService) {
  const uid = req.authUser?.id;
  if (!uid) {
    reply.code(401).send({ error: "auth_required" });
    return null;
  }
  const ok = await rbacService.isAdminOrStaff(req.authUser.role, uid);
  if (!ok) {
    reply.code(403).send({ error: "admin_required" });
    return null;
  }
  return uid;
}

async function requirePosAccess(req, reply, rbacService) {
  const uid = await requireStaff(req, reply, rbacService);
  if (uid == null) return null;
  const admin = await rbacService.isAdmin(req.authUser.role, uid);
  if (!admin) {
    const rpCount = await getDb().collection("role_permissions").countDocuments();
    const allowed =
      rpCount === 0 ? true : await rbacService.hasPermission(uid, "access_pos", false);
    if (!allowed) {
      reply.code(403).send({ error: "pos_forbidden" });
      return null;
    }
  }
  return uid;
}

function emptyPosSession() {
  return {
    active: false,
    storeId: null,
    storeCode: null,
    counterId: null,
    counterCode: null,
    financialYear: null,
    cart: {},
    serviceCharge: 0,
    tempData: {},
    checkoutLockTs: 0,
    /** When set, successful checkout deletes this `pos_holds.id` (bill was recalled from hold). */
    recalledHoldId: null,
  };
}

function posSession(req) {
  return req.sessionData?.pos ?? null;
}

function cartKeyFor(productId, variantId) {
  const pid = Number(productId);
  return variantId != null && !Number.isNaN(Number(variantId))
    ? `${pid}_variant_${Number(variantId)}`
    : String(pid);
}

/** After "End session", staff can reopen billing without re-entering counter PIN until this TTL (same browser session). */
const POS_RESUME_TTL_MS = 24 * 60 * 60 * 1000;

async function validatePosResumeSnapshot(repos, snap) {
  if (!snap || typeof snap.savedAt !== "number") return { ok: false };
  if (Date.now() - snap.savedAt > POS_RESUME_TTL_MS) return { ok: false, stale: true };
  const storeId = Math.floor(Number(snap.storeId) || 0);
  const counterId = Math.floor(Number(snap.counterId) || 0);
  if (storeId <= 0 || counterId <= 0) return { ok: false };
  const store = await repos.stores.findById(storeId);
  const counter = await repos.posCounters.findById(counterId);
  if (
    !store ||
    !counter ||
    !(store.is_active === 1 || store.is_active === true) ||
    !(counter.is_active === 1 || counter.is_active === true) ||
    Number(counter.store_id) !== storeId
  ) {
    return { ok: false };
  }
  return { ok: true, store, counter };
}

export async function registerAdminPosRoutes(app, { repos, rbacService }) {
  app.get("/api/admin/pos/login-bootstrap", async (req, reply) => {
    if ((await requirePosAccess(req, reply, rbacService)) == null) return;
    const stores = await repos.stores.listActive();
    const base = {
      stores,
      financial_years: posFinancialYears(),
      resume: null,
      billing_active: !!(posSession(req)?.active),
    };
    const snap = req.sessionData?.pos_resume;
    if (!snap) return base;
    const v = await validatePosResumeSnapshot(repos, snap);
    if (!v.ok) {
      if (req.sessionData) {
        delete req.sessionData.pos_resume;
        await saveSession(req);
      }
      return base;
    }
    base.resume = {
      store_id: snap.storeId,
      store_code: snap.storeCode,
      counter_id: snap.counterId,
      counter_code: snap.counterCode,
      financial_year: snap.financialYear,
    };
    return base;
  });

  app.get("/api/admin/stores/:storeId/counters", async (req, reply) => {
    if ((await requirePosAccess(req, reply, rbacService)) == null) return;
    const storeId = Number(req.params.storeId);
    const store = await repos.stores.findById(storeId);
    if (!store) return reply.code(404).send({ error: "not_found" });
    const counters = await repos.posCounters.listByStore(storeId);
    return { counters };
  });

  app.post("/api/admin/pos/start", async (req, reply) => {
    if ((await requirePosAccess(req, reply, rbacService)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const storeId = Math.floor(Number(b.store_id) || 0);
    const counterId = Math.floor(Number(b.counter_id) || 0);
    const counterPin = String(b.counter_pin ?? "");
    const financialYear = String(b.financial_year ?? "").trim();
    if (storeId <= 0 || !financialYear) {
      return reply.code(400).send({ error: "validation_failed", message: "Select store and financial year" });
    }
    if (counterId <= 0 || !counterPin) {
      return reply.code(400).send({ error: "validation_failed", message: "Select counter and enter PIN" });
    }
    const store = await repos.stores.findById(storeId);
    if (!store || !(store.is_active === 1 || store.is_active === true)) {
      return reply.code(400).send({ error: "invalid_store" });
    }
    const counter = await repos.posCounters.findRowWithPin(counterId);
    if (
      !counter ||
      !(counter.is_active === 1 || counter.is_active === true) ||
      Number(counter.store_id) !== storeId
    ) {
      return reply.code(400).send({ error: "invalid_counter" });
    }
    const pinOk = await repos.posCounters.verifyPin(counterId, counterPin);
    if (!pinOk) return reply.code(400).send({ error: "invalid_pin" });

    req.sessionData.pos = {
      active: true,
      storeId,
      storeCode: String(store.code ?? "").trim() || "STORE",
      counterId,
      counterCode: String(counter.code ?? "").trim() || String(counterId),
      financialYear,
      cart: {},
      serviceCharge: 0,
      tempData: {},
      checkoutLockTs: 0,
      recalledHoldId: null,
    };
    req.sessionData.pos_resume = {
      storeId,
      storeCode: String(store.code ?? "").trim() || "STORE",
      counterId,
      counterCode: String(counter.code ?? "").trim() || String(counterId),
      financialYear,
      savedAt: Date.now(),
    };
    await saveSession(req);
    return { ok: true, redirect: "/admin/pos/billing" };
  });

  app.post("/api/admin/pos/resume", async (req, reply) => {
    if ((await requirePosAccess(req, reply, rbacService)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const snap = req.sessionData?.pos_resume;
    const v = await validatePosResumeSnapshot(repos, snap);
    if (!v.ok) {
      if (snap && req.sessionData) {
        delete req.sessionData.pos_resume;
        await saveSession(req);
      }
      return reply.code(400).send({ error: "resume_unavailable" });
    }
    req.sessionData.pos = {
      active: true,
      storeId: snap.storeId,
      storeCode: snap.storeCode,
      counterId: snap.counterId,
      counterCode: snap.counterCode,
      financialYear: snap.financialYear,
      cart: {},
      serviceCharge: 0,
      tempData: {},
      checkoutLockTs: 0,
      recalledHoldId: null,
    };
    snap.savedAt = Date.now();
    await saveSession(req);
    return { ok: true, redirect: "/admin/pos/billing" };
  });

  app.post("/api/admin/pos/discard-resume", async (req, reply) => {
    if ((await requirePosAccess(req, reply, rbacService)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    if (req.sessionData) delete req.sessionData.pos_resume;
    await saveSession(req);
    return { ok: true };
  });

  app.post("/api/admin/pos/end", async (req, reply) => {
    if ((await requirePosAccess(req, reply, rbacService)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const forgetResume = b.forget_resume === true || b.forget_resume === 1 || b.forget_resume === "1";
    const prev = posSession(req);
    if (prev?.active && req.sessionData && !forgetResume) {
      req.sessionData.pos_resume = {
        storeId: prev.storeId,
        storeCode: prev.storeCode,
        counterId: prev.counterId,
        counterCode: prev.counterCode,
        financialYear: prev.financialYear,
        savedAt: Date.now(),
      };
    } else if (req.sessionData && forgetResume) {
      delete req.sessionData.pos_resume;
    }
    req.sessionData.pos = emptyPosSession();
    await saveSession(req);
    return { ok: true };
  });

  app.get("/api/admin/pos/state", async (req, reply) => {
    if ((await requirePosAccess(req, reply, rbacService)) == null) return;
    const pos = posSession(req);
    if (!pos?.active) {
      return { active: false };
    }
    const [recent, holds, staff] = await Promise.all([
      repos.posOrders.listRecentOrders(pos.storeId, 20),
      repos.posOrders.listHolds(pos.storeId, pos.counterId, 20),
      repos.users.listActiveStaff(),
    ]);
    return {
      active: true,
      store_code: pos.storeCode,
      counter_code: pos.counterCode,
      financial_year: pos.financialYear,
      cart: pos.cart,
      service_charge: pos.serviceCharge,
      temp: pos.tempData || {},
      recent_orders: recent,
      holds,
      staff,
    };
  });

  app.post("/api/admin/pos/cart/add", async (req, reply) => {
    if ((await requirePosAccess(req, reply, rbacService)) == null) return;
    const pos = posSession(req);
    if (!pos.active) return reply.code(400).send({ error: "pos_session_required" });
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const barcode = String(b.barcode ?? "").trim();
    const productId = Math.floor(Number(b.product_id) || 0);
    const variantIdBody = b.variant_id != null && b.variant_id !== "" ? b.variant_id : null;
    const qty = Math.max(1, Math.floor(Number(b.quantity) || 1));

    const resolved = await repos.products.resolvePosProductLine({
      barcode,
      product_id: productId,
      variant_id: variantIdBody,
    });
    if (!resolved.ok) {
      return reply.code(400).send({
        error: resolved.error,
        message: resolved.error === "product_not_found" ? `Product not found: ${barcode || productId}` : resolved.error,
      });
    }

    const p = await repos.products.findById(resolved.product_id);
    if (!p) return reply.code(400).send({ error: "product_not_found" });

    const variantId = resolved.variant_id;
    const sid = Math.floor(Number(pos.storeId) || 0);
    const available =
      sid > 0
        ? await repos.stockTransfer.getLineQtyAtStore(sid, resolved.product_id, variantId, p)
        : repos.products.posAvailableQty(p, variantId);
    const noStoreStock = Number(resolved.no_store_stock) === 1;
    if (!noStoreStock && qty > available) {
      return reply.code(400).send({ error: "insufficient_stock", available });
    }

    const key = cartKeyFor(resolved.product_id, variantId);
    const existing = Math.floor(Number(pos.cart[key]?.quantity) || 0);
    let newQty = existing + qty;
    if (!noStoreStock && newQty > available) newQty = available;

    pos.cart[key] = {
      product_id: resolved.product_id,
      variant_id: variantId,
      variant_barcode: resolved.variant_barcode ?? null,
      name: resolved.name,
      image_path: resolved.image_path ?? null,
      price: resolved.price,
      gst_percent: resolved.gst_percent,
      discount_percent: 0,
      max_discount_percent: resolved.max_discount_percent,
      quantity: newQty,
      no_store_stock: noStoreStock ? 1 : 0,
      store_id: resolved.product_store_id ?? 0,
    };
    await saveSession(req);
    return { ok: true, cart: pos.cart };
  });

  app.post("/api/admin/pos/cart/update-qty", async (req, reply) => {
    if ((await requirePosAccess(req, reply, rbacService)) == null) return;
    const pos = posSession(req);
    if (!pos.active) return reply.code(400).send({ error: "pos_session_required" });
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    let cartKey = String(b.cart_key ?? "").trim();
    const pid = Math.floor(Number(b.product_id) || 0);
    let qty = Math.max(1, Math.floor(Number(b.quantity) || 1));
    if (!cartKey || !pos.cart[cartKey]) cartKey = String(pid);
    const item = pos.cart[cartKey];
    if (!item) return reply.code(400).send({ error: "not_in_cart" });

    const p = await repos.products.findById(item.product_id);
    if (!p) return reply.code(400).send({ error: "product_not_found" });
    const noStoreStock = Number(item.no_store_stock) === 1;
    if (!noStoreStock) {
      const variantId = item.variant_id != null ? Number(item.variant_id) : null;
      const sid = Math.floor(Number(pos.storeId) || 0);
      const available =
        sid > 0
          ? await repos.stockTransfer.getLineQtyAtStore(sid, item.product_id, variantId, p)
          : repos.products.posAvailableQty(p, variantId);
      qty = Math.min(qty, available);
    }
    pos.cart[cartKey].quantity = Math.max(1, qty);
    await saveSession(req);
    return { ok: true, cart: pos.cart };
  });

  app.post("/api/admin/pos/cart/update-discount", async (req, reply) => {
    if ((await requirePosAccess(req, reply, rbacService)) == null) return;
    const pos = posSession(req);
    if (!pos.active) return reply.code(400).send({ error: "pos_session_required" });
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    let cartKey = String(b.cart_key ?? "").trim();
    const pid = Math.floor(Number(b.product_id) || 0);
    let dp = Number(b.discount_percent) || 0;
    if (!cartKey || !pos.cart[cartKey]) cartKey = String(pid);
    const item = pos.cart[cartKey];
    if (!item) return reply.code(400).send({ error: "not_in_cart" });

    const amount = Number(b.discount_amount) || 0;
    if (amount > 0) {
      const price = Number(item.price) || 0;
      const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
      const lineSub = price * qty;
      if (lineSub > 0) dp = (amount / lineSub) * 100;
      else dp = 0;
    }
    dp = Math.max(0, Math.min(100, dp));

    let maxAllowed = item.max_discount_percent;
    if (maxAllowed == null && item.product_id) {
      const prod = await repos.products.findById(item.product_id);
      if (prod?.max_discount_percent != null && prod.max_discount_percent !== "") {
        maxAllowed = Number(prod.max_discount_percent);
        item.max_discount_percent = maxAllowed;
      }
    }
    if (maxAllowed != null && dp > Number(maxAllowed)) {
      dp = Number(maxAllowed);
    }

    item.discount_percent = dp;
    const basePrice = Number(item.price) || 0;
    const effectiveUnit = basePrice * (1 - dp / 100);
    item.effective_price = Math.floor(effectiveUnit);
    await saveSession(req);
    return { ok: true, cart: pos.cart };
  });

  app.post("/api/admin/pos/cart/remove", async (req, reply) => {
    if ((await requirePosAccess(req, reply, rbacService)) == null) return;
    const pos = posSession(req);
    if (!pos.active) return reply.code(400).send({ error: "pos_session_required" });
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const cartKey = String(b.cart_key ?? "").trim();
    const pid = Math.floor(Number(b.product_id) || 0);
    if (cartKey && pos.cart[cartKey]) delete pos.cart[cartKey];
    else if (pid > 0) {
      for (const k of Object.keys(pos.cart)) {
        if (Number(pos.cart[k]?.product_id) === pid) {
          delete pos.cart[k];
          break;
        }
      }
    }
    await saveSession(req);
    return { ok: true, cart: pos.cart };
  });

  app.post("/api/admin/pos/cart/clear", async (req, reply) => {
    if ((await requirePosAccess(req, reply, rbacService)) == null) return;
    const pos = posSession(req);
    if (!pos.active) return reply.code(400).send({ error: "pos_session_required" });
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    pos.cart = {};
    pos.tempData = {};
    pos.recalledHoldId = null;
    await saveSession(req);
    return { ok: true, cart: pos.cart };
  });

  app.post("/api/admin/pos/service-charge", async (req, reply) => {
    if ((await requirePosAccess(req, reply, rbacService)) == null) return;
    const pos = posSession(req);
    if (!pos.active) return reply.code(400).send({ error: "pos_session_required" });
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    pos.tempData = {
      staff_id: b.staff_id ?? "",
      customer_name: String(b.customer_name ?? ""),
      customer_phone: String(b.customer_phone ?? ""),
      cash_amount: b.cash_amount ?? "",
      card_amount: b.card_amount ?? "",
      upi_amount: b.upi_amount ?? "",
    };
    let val = Number(b.service_charge) || 0;
    if (val < 0) val = 0;
    pos.serviceCharge = round2(val);
    await saveSession(req);
    return { ok: true, service_charge: pos.serviceCharge, temp: pos.tempData };
  });

  app.post("/api/admin/pos/hold", async (req, reply) => {
    if ((await requirePosAccess(req, reply, rbacService)) == null) return;
    const pos = posSession(req);
    if (!pos.active) return reply.code(400).send({ error: "pos_session_required" });
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const cart = pos.cart || {};
    if (!Object.keys(cart).length) return reply.code(400).send({ error: "empty_cart" });
    const b = parseJsonBody(req.body);
    const uid = req.authUser?.id;
    await repos.posOrders.createHold({
      storeId: pos.storeId,
      counterId: pos.counterId,
      staffId: uid,
      customerName: b.customer_name,
      customerPhone: b.customer_phone,
      cart,
    });
    pos.cart = {};
    pos.recalledHoldId = null;
    await saveSession(req);
    return { ok: true, cart: pos.cart };
  });

  app.post("/api/admin/pos/recall/:holdId", async (req, reply) => {
    if ((await requirePosAccess(req, reply, rbacService)) == null) return;
    const pos = posSession(req);
    if (!pos.active) return reply.code(400).send({ error: "pos_session_required" });
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const hid = Math.floor(Number(req.params.holdId) || 0);
    if (hid <= 0) return reply.code(400).send({ error: "validation_failed" });
    const row = await repos.posOrders.findHold(hid);
    if (!row || Number(row.store_id) !== Number(pos.storeId)) {
      return reply.code(404).send({ error: "not_found" });
    }
    if (pos.counterId && row.counter_id && Number(row.counter_id) !== Number(pos.counterId)) {
      return reply.code(403).send({ error: "hold_counter_mismatch" });
    }
    let parsed = {};
    try {
      parsed = JSON.parse(String(row.cart_json ?? "{}")) || {};
    } catch {
      parsed = {};
    }
    pos.cart = typeof parsed === "object" && parsed ? parsed : {};
    pos.recalledHoldId = hid;
    await saveSession(req);
    return { ok: true, cart: pos.cart };
  });

  /** Drop a held bill without billing it (counter must match when holds are counter-scoped). */
  app.post("/api/admin/pos/holds/:holdId/delete", async (req, reply) => {
    if ((await requirePosAccess(req, reply, rbacService)) == null) return;
    const pos = posSession(req);
    if (!pos.active) return reply.code(400).send({ error: "pos_session_required" });
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const hid = Math.floor(Number(req.params.holdId) || 0);
    if (hid <= 0) return reply.code(400).send({ error: "validation_failed" });
    const row = await repos.posOrders.findHold(hid);
    if (!row || Number(row.store_id) !== Number(pos.storeId)) {
      return reply.code(404).send({ error: "not_found" });
    }
    if (pos.counterId && row.counter_id && Number(row.counter_id) !== Number(pos.counterId)) {
      return reply.code(403).send({ error: "hold_counter_mismatch" });
    }
    await repos.posOrders.deleteHold(hid);
    if (Number(pos.recalledHoldId) === hid) pos.recalledHoldId = null;
    await saveSession(req);
    return { ok: true };
  });

  app.get("/api/admin/pos/search-products", async (req, reply) => {
    if ((await requirePosAccess(req, reply, rbacService)) == null) return;
    const pos = posSession(req);
    if (!pos.active) return reply.code(403).send({ error: "pos_inactive" });
    const q = String(req.query.q ?? "").trim();
    if (!q || pos.storeId <= 0) return [];
    const results = await repos.products.searchProductsForPos(q, {
      limit: 30,
      storeId: pos.storeId,
      lineQtyAtStore: (sid, pid, vid, doc) => repos.stockTransfer.getLineQtyAtStore(sid, pid, vid, doc),
    });
    return results;
  });

  app.post("/api/admin/pos/checkout", async (req, reply) => {
    if ((await requirePosAccess(req, reply, rbacService)) == null) return;
    const pos = posSession(req);
    if (!pos.active) return reply.code(400).send({ error: "pos_session_required" });
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });

    const cart = pos.cart || {};
    if (!Object.keys(cart).length) return reply.code(400).send({ error: "empty_cart" });

    const lockTs = Math.floor(Number(pos.checkoutLockTs) || 0);
    if (lockTs > 0 && Date.now() / 1000 - lockTs < 20) {
      return reply.code(409).send({ error: "checkout_in_progress" });
    }
    pos.checkoutLockTs = Math.floor(Date.now() / 1000);
    await saveSession(req);

    try {
      const b = parseJsonBody(req.body);
      let cash = Number(b.cash_amount) || 0;
      const card = Number(b.card_amount) || 0;
      const upi = Number(b.upi_amount) || 0;
      const service =
        b.service_charge !== undefined && b.service_charge !== null && b.service_charge !== ""
          ? Number(b.service_charge)
          : Number(pos.serviceCharge) || 0;
      const customer = String(b.customer_name ?? "").trim();
      const phone = String(b.customer_phone ?? "").trim();
      const fy = String(pos.financialYear ?? "");
      const storeId = Number(pos.storeId);
      const counterId = pos.counterId != null ? Number(pos.counterId) : null;

      let staffUse = null;
      const staffPick = Math.floor(Number(b.staff_id) || 0);
      if (staffPick > 0) {
        const u = await repos.users.findById(staffPick);
        if (u && String(u.role) === "staff" && (u.is_active === 1 || u.is_active === true)) {
          staffUse = staffPick;
        }
      }
      if (staffUse == null && req.authUser?.id) {
        staffUse = req.authUser?.id;
      }

      const totals = computePosCartTotals(cart, service);
      const { subtotal, discountTotal, gstTotal, grand } = totals;
      const creditSale = b.credit_sale === true || b.credit_sale === 1 || b.credit_sale === "1";
      let paid = cash + card + upi;
      if (!creditSale && round2(paid) < round2(grand) - 0.009) {
        return reply.code(400).send({ error: "payment_short", grand, paid });
      }

      let change = 0;
      if (!creditSale && paid > grand) {
        change = paid - grand;
        if (cash >= change) cash -= change;
      }
      const tendered = paid;
      const cb = changeBreakdown(change);

      const saleType = ["Shop", "Online"].includes(String(b.sale_type)) ? String(b.sale_type) : "Shop";

      const orderNumber = await repos.posOrders.nextBillNumber(storeId, fy, pos.storeCode);

      const lines = [];
      for (const item of Object.values(cart)) {
        const basePrice = Number(item.price) || 0;
        const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
        const dp = Number(item.discount_percent) || 0;
        const effectiveUnit =
          item.effective_price > 0 ? Number(item.effective_price) : basePrice * (1 - dp / 100);
        const lineSub = basePrice * qty;
        const lineAfterDisc = effectiveUnit * qty;
        const disc = lineSub - lineAfterDisc;
        const gst = lineAfterDisc * ((Number(item.gst_percent) || 0) / 100);
        const lineTotal = lineAfterDisc + gst;
        lines.push({
          product_id: item.product_id,
          variant_id: item.variant_id ?? null,
          product_name: item.name,
          price: effectiveUnit,
          quantity: qty,
          discount_percent: dp,
          gst_percent: Number(item.gst_percent) || 0,
          gst_amount: gst,
          subtotal: lineSub,
          line_total: lineTotal,
        });
      }

      const payments = [
        { method: "Cash", amount: cash, reference: null },
        { method: "Card", amount: card, reference: null },
        { method: "UPI", amount: upi, reference: null },
      ];

      const orderDoc = {
        order_number: orderNumber,
        store_id: storeId,
        counter_id: counterId,
        financial_year: fy,
        customer_name: customer,
        customer_phone: phone,
        staff_id: staffUse,
        subtotal,
        discount_total: discountTotal,
        service_charge: totals.serviceCharge,
        gst_total: gstTotal,
        grand_total: grand,
        tendered_amount: tendered,
        change_amount: change,
        cash_amount: cash,
        card_amount: card,
        upi_amount: upi,
        payments_json: { cash, card, upi },
        change_breakdown_json: cb,
        sale_type: saleType,
        credit_sale: creditSale,
      };

      const { orderId } = await repos.posOrders.createOrderAndItems(orderDoc, lines, payments);

      const recalledId = pos.recalledHoldId != null ? Math.floor(Number(pos.recalledHoldId)) : 0;
      if (recalledId > 0) {
        const hrow = await repos.posOrders.findHold(recalledId);
        if (hrow && Number(hrow.store_id) === Number(storeId)) {
          await repos.posOrders.deleteHold(recalledId);
        }
      }

      for (const item of Object.values(cart)) {
        if (Number(item.no_store_stock) === 1) continue;
        const dec = await repos.products.decrementPosStock(
          storeId,
          item.product_id,
          item.variant_id != null ? Number(item.variant_id) : null,
          Math.max(1, Math.floor(Number(item.quantity) || 1)),
          repos.stockTransfer
        );
        if (!dec.ok) {
          req.log.error({ orderId, item, dec }, "pos_stock_decrement_failed_post_order");
        }
      }

      pos.cart = {};
      pos.tempData = {};
      pos.checkoutLockTs = 0;
      pos.serviceCharge = 0;
      pos.recalledHoldId = null;
      await saveSession(req);

      return { ok: true, order_id: orderId, order_number: orderNumber };
    } catch (e) {
      req.log.error(e, "pos_checkout");
      return reply.code(500).send({ error: "checkout_failed" });
    } finally {
      const pos2 = posSession(req);
      if (pos2) pos2.checkoutLockTs = 0;
      await saveSession(req);
    }
  });

  /** POS bills list / reprint — finance-gated for staff (totals / sales history). */
  app.get("/api/admin/pos/orders", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.FINANCE_POS_ORDERS)) == null) return;
    const storeId = Math.floor(Number(req.query.store_id) || 0);
    const staffId = Math.floor(Number(req.query.staff_id) || 0);
    const from = String(req.query.from ?? "").trim();
    const to = String(req.query.to ?? "").trim();
    const page = Math.floor(Number(req.query.page) || 1);
    const list = await repos.posOrders.listOrdersPage({
      storeId,
      staffId,
      from,
      to,
      page,
      perPage: 24,
    });
    const [stores, staff] = await Promise.all([repos.stores.listActive(), repos.users.listActiveStaff()]);
    return { ...list, stores, staff };
  });

  app.get("/api/admin/pos/orders/:id", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.FINANCE_POS_ORDERS)) == null) return;
    const id = Math.floor(Number(req.params.id) || 0);
    const detail = await repos.posOrders.getOrderDetail(id, repos.stores);
    if (!detail) return reply.code(404).send({ error: "not_found" });
    return detail;
  });

  /** POS GST report. JSON or ?export=csv */
  app.get("/api/admin/pos/gst-report", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.FINANCE_POS_GST)) == null) return;
    const storeId = Math.floor(Number(req.query.store_id) || 0);
    const rangeRaw = String(req.query.range ?? "daily").trim().toLowerCase();
    const range = rangeRaw === "monthly" ? "monthly" : "daily";
    const from = String(req.query.from ?? "").trim();
    const to = String(req.query.to ?? "").trim();
    const exportCsv = String(req.query.export ?? "").toLowerCase() === "csv";

    const { rows } = await repos.posOrders.getGstReport({ storeId, range, from, to });

    if (exportCsv) {
      const colName = range === "monthly" ? "Month" : "Day";
      const lines = [[`${colName}`, "Subtotal", "Discounts", "GST", "Grand Total"].join(",")];
      for (const r of rows) {
        lines.push(
          [
            r.period,
            Number(r.subtotal).toFixed(2),
            Number(r.discounts).toFixed(2),
            Number(r.gst).toFixed(2),
            Number(r.grand_total).toFixed(2),
          ].join(",")
        );
      }
      const body = `\uFEFF${lines.join("\r\n")}`;
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="gst_${range}.csv"`)
        .send(body);
    }

    const stores = await repos.stores.listActive();
    return { rows, stores, filters: { store_id: storeId, range, from, to } };
  });

  /** POS returns list. JSON or ?export=csv (current page). */
  app.get("/api/admin/pos/returns", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.FINANCE_POS_RETURNS)) == null) return;
    const storeId = Math.floor(Number(req.query.store_id) || 0);
    const from = String(req.query.from ?? "").trim();
    const to = String(req.query.to ?? "").trim();
    const page = Math.floor(Number(req.query.page) || 1);
    const exportCsv = String(req.query.export ?? "").toLowerCase() === "csv";

    const list = await repos.posOrders.listPosReturnsPage({ storeId, from, to, page, perPage: 24 });

    if (exportCsv) {
      const header = [
        "Return ID",
        "POS Order #",
        "Customer",
        "Product",
        "Quantity",
        "Refund Method",
        "Refund Amount",
        "GST Adjust",
        "Date",
      ];
      const lines = [header.map(csvEscapeCell).join(",")];
      for (const r of list.returns) {
        const dt =
          r.created_at instanceof Date
            ? r.created_at.toISOString()
            : String(r.created_at ?? "");
        lines.push(
          [
            r.id,
            r.order_number ?? "",
            r.customer_name ?? "",
            r.product_name ?? "",
            r.quantity,
            r.refund_method ?? "",
            Number(r.refund_amount ?? 0).toFixed(2),
            Number(r.gst_adjustment ?? 0).toFixed(2),
            dt,
          ]
            .map(csvEscapeCell)
            .join(",")
        );
      }
      const body = `\uFEFF${lines.join("\r\n")}`;
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", "attachment; filename=\"pos_returns.csv\"")
        .send(body);
    }

    const stores = await repos.stores.listActive();
    return { ...list, stores, filters: { store_id: storeId, from, to } };
  });
}
