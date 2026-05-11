import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import { csrfOk } from "../lib/csrf.js";
import { buildTsplVariantLabel, formatPriceInr } from "../lib/tsplVariantLabel.js";
import { sendTsplToNetwork } from "../lib/tsplTransport.js";
import { slugify } from "../lib/slug.js";
import { env } from "../config/env.js";
import { configureCloudinary, isCloudinaryConfigured } from "../lib/cloudinary.js";
import { getImageFolder } from "../lib/imagePaths.js";
import { PERM, PERM_EXTRA_PRODUCT_EDITOR_READ } from "../lib/adminPermissionCatalog.js";
import { requireStaffWithPermission, requireStaffWithAnyPermission } from "../lib/staffPermissionGate.js";

function taxonomyRead(resourceViewPerm) {
  return [resourceViewPerm, ...PERM_EXTRA_PRODUCT_EDITOR_READ];
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

/** Stores: admin-only (not staff). */
async function requireAdmin(req, reply, rbacService) {
  const uid = req.authUser?.id;
  if (!uid) {
    reply.code(401).send({ error: "auth_required" });
    return null;
  }
  const staffOk = await rbacService.isAdminOrStaff(req.authUser.role, uid);
  if (!staffOk) {
    reply.code(403).send({ error: "admin_required" });
    return null;
  }
  const admin = await rbacService.isAdmin(req.authUser.role, uid);
  if (!admin) {
    reply.code(403).send({ error: "admin_only" });
    return null;
  }
  return uid;
}

function parseJsonBody(body) {
  if (body == null || typeof body !== "object") return {};
  return body;
}

async function resolveCatalogProductScope(req, rbacService, repos) {
  const uid = req.authUser.id;
  const isAdmin = await rbacService.isAdmin(req.authUser.role, uid);
  const user = await repos.users.findById(uid);
  const staffShopId =
    user?.shop_id != null && user.shop_id !== "" && Number(user.shop_id) > 0 ? Number(user.shop_id) : null;
  const canAllShops =
    isAdmin || (await rbacService.hasExactPermission(uid, PERM.CATALOG_PRODUCTS_ALL_SHOPS));

  let shopName = null;
  if (staffShopId != null) {
    const s = await repos.stores.findById(staffShopId);
    shopName = s?.name ?? null;
  }

  /** When set, catalog lists permit these shop IDs plus legacy rows with no `shop_id`. */
  let restrictedCatalogShopIds = null;
  if (!canAllShops && staffShopId != null) {
    const multi =
      user?.catalog_multi_shop_filter === true ||
      user?.catalog_multi_shop_filter === 1 ||
      user?.catalog_multi_shop_filter === "1";
    const extrasRaw = user?.catalog_extra_shop_ids;
    const extras = Array.isArray(extrasRaw)
      ? [...new Set(extrasRaw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))]
      : [];
    const candidateIds =
      multi && extras.length > 0 ? [staffShopId, ...extras.filter((id) => id !== staffShopId)] : [staffShopId];
    const validated = [];
    const seen = new Set();
    for (const sid of candidateIds) {
      if (seen.has(sid)) continue;
      seen.add(sid);
      const st = await repos.stores.findById(sid);
      if (st) validated.push(sid);
    }
    restrictedCatalogShopIds = validated.length ? validated : [staffShopId];
  }

  return { uid, isAdmin, staffShopId, shopName, canAllShops, restrictedCatalogShopIds };
}

function assertProductShopScope(reply, product, scope) {
  if (!product) return false;
  if (scope.canAllShops) return true;
  const ids = scope.restrictedCatalogShopIds;
  if (!ids?.length) return true;

  const raw = product.shop_id;
  if (raw == null || raw === "") return true;
  const pid = Number(raw);
  if (!Number.isFinite(pid) || pid <= 0) return true;

  if (ids.includes(pid)) return true;
  reply.code(404).send({ error: "not_found" });
  return false;
}

function mergeShopScopedProductPayload(scope, body) {
  const b = { ...body };
  if (scope.canAllShops) return b;
  const ids = scope.restrictedCatalogShopIds;
  if (!ids?.length) return b;
  if (ids.length === 1) {
    b.shop_id = ids[0];
    return b;
  }
  const raw = b.shop_id;
  const n = raw === undefined ? undefined : raw == null || raw === "" ? null : Number(raw);
  if (n === undefined) {
    b.shop_id = scope.staffShopId ?? ids[0];
    return b;
  }
  if (n == null || !Number.isFinite(n)) {
    b.shop_id = scope.staffShopId ?? ids[0];
    return b;
  }
  if (!ids.includes(n)) {
    b.shop_id = scope.staffShopId ?? ids[0];
  }
  return b;
}

async function saveAdminSession(req) {
  if (req.sessionId && req.sessionData) {
    await req.server.sessionStore.set(req.sessionId, req.sessionData);
  }
}

/** Admin + staff JSON API (Fastify). */
export async function registerAdminRoutes(app, { repos, rbacService }) {
  app.get("/api/admin/ping", async (req, reply) => {
    const uid = await requireStaff(req, reply, rbacService);
    if (uid == null) return;
    const isAdmin = await rbacService.isAdmin(req.authUser.role, uid);
    const adminPermissionKeys = await rbacService.listAdminPanelPermissionKeys(req.authUser.role, uid);
    const catalogScope = await resolveCatalogProductScope(req, rbacService, repos);
    return {
      ok: true,
      isAdmin,
      adminPermissionKeys,
      session_storage: env.USE_REDIS ? "redis" : "memory",
      catalog_scope: {
        staff_shop_id: catalogScope.staffShopId,
        shop_name: catalogScope.shopName,
        can_filter_all_shops: catalogScope.canAllShops,
        catalog_shop_ids: catalogScope.restrictedCatalogShopIds,
      },
    };
  });

  /* ---------- Categories ---------- */
  app.get("/api/admin/categories", async (req, reply) => {
    if (
      (await requireStaffWithAnyPermission(req, reply, rbacService, taxonomyRead(PERM.CATALOG_CATEGORIES_VIEW))) ==
      null
    )
      return;
    const items = await repos.categories.listAll();
    return { categories: items };
  });

  app.get("/api/admin/categories/:id", async (req, reply) => {
    if (
      (await requireStaffWithAnyPermission(req, reply, rbacService, taxonomyRead(PERM.CATALOG_CATEGORIES_VIEW))) ==
      null
    )
      return;
    const row = await repos.categories.findById(req.params.id);
    if (!row) return reply.code(404).send({ error: "not_found" });
    return { category: row };
  });

  app.post("/api/admin/categories", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.CATALOG_CATEGORIES_CREATE)) == null)
      return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const name = String(b.name ?? "").trim();
    if (!name) return reply.code(400).send({ error: "validation_failed", field: "name" });
    const slug = slugify(b.slug || name);
    if (await repos.categories.slugTaken(slug, null)) {
      return reply.code(409).send({ error: "slug_taken" });
    }
    const id = await repos.categories.create({
      name,
      slug,
      description: b.description != null ? String(b.description) : null,
      image_path: b.image_path != null ? String(b.image_path) : null,
      display_order: b.display_order,
      is_active: Boolean(b.is_active),
    });
    return { ok: true, id };
  });

  app.patch("/api/admin/categories/:id", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.CATALOG_CATEGORIES_UPDATE)) == null)
      return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const existing = await repos.categories.findById(req.params.id);
    if (!existing) return reply.code(404).send({ error: "not_found" });
    const b = parseJsonBody(req.body);
    const name = b.name != null ? String(b.name).trim() : existing.name;
    let slug;
    if (b.slug != null) slug = slugify(b.slug);
    else if (b.name != null) slug = slugify(name);
    else slug = existing.slug;
    if (slug !== existing.slug && (await repos.categories.slugTaken(slug, existing.id))) {
      return reply.code(409).send({ error: "slug_taken" });
    }
    await repos.categories.update(req.params.id, {
      name,
      slug,
      description: b.description !== undefined ? (b.description == null ? null : String(b.description)) : existing.description,
      image_path: b.image_path !== undefined ? (b.image_path == null ? null : String(b.image_path)) : existing.image_path,
      display_order: b.display_order != null ? Number(b.display_order) : existing.display_order,
      is_active: b.is_active !== undefined ? (b.is_active ? 1 : 0) : existing.is_active,
    });
    return { ok: true };
  });

  app.delete("/api/admin/categories/:id", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.CATALOG_CATEGORIES_DELETE)) == null)
      return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const n = await repos.categories.countProducts(req.params.id);
    if (n > 0) return reply.code(409).send({ error: "category_has_products", count: n });
    await repos.categories.delete(req.params.id);
    return { ok: true };
  });

  /** Category thumbnail → Cloudinary (direct upload; no Redis queue). */
  app.post("/api/admin/categories/:id/image", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.CATALOG_CATEGORIES_IMAGES)) == null)
      return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    if (!isCloudinaryConfigured()) {
      return reply.code(503).send({ error: "cloudinary_not_configured" });
    }
    const cid = Number(req.params.id);
    if (!Number.isFinite(cid) || cid <= 0) {
      return reply.code(400).send({ error: "validation_failed", field: "id" });
    }
    const existing = await repos.categories.findById(cid);
    if (!existing) return reply.code(404).send({ error: "not_found" });

    const tmpRoot = path.join(tmpdir(), "backroar-uploads");
    await mkdir(tmpRoot, { recursive: true });

    let uploadedUrl = null;
    for await (const part of req.parts()) {
      if (part.type !== "file" || !part.file) continue;
      const fname = part.filename || "upload.bin";
      const dest = path.join(tmpRoot, `${randomBytes(16).toString("hex")}-${fname}`);
      await pipeline(part.file, createWriteStream(dest));
      try {
        const cloudinary = configureCloudinary();
        const publicId = `category_${cid}_${randomBytes(6).toString("hex")}`;
        const folder = `${env.CLOUDINARY_UPLOAD_PREFIX}/categories`;
        const result = await cloudinary.uploader.upload(dest, {
          folder,
          public_id: publicId,
          resource_type: "image",
        });
        uploadedUrl = result.secure_url || result.url || null;
      } finally {
        try {
          await unlink(dest);
        } catch {
          /* ignore */
        }
      }
      break;
    }

    if (!uploadedUrl) {
      return reply.code(400).send({ error: "no_files" });
    }

    await repos.categories.update(cid, { image_path: uploadedUrl });

    return { ok: true, image_path: uploadedUrl };
  });

  /* ---------- Brands ---------- */
  app.get("/api/admin/brands", async (req, reply) => {
    if (
      (await requireStaffWithAnyPermission(req, reply, rbacService, taxonomyRead(PERM.CATALOG_BRANDS_VIEW))) == null
    )
      return;
    return { brands: await repos.brands.listAll() };
  });

  app.get("/api/admin/brands/:id", async (req, reply) => {
    if (
      (await requireStaffWithAnyPermission(req, reply, rbacService, taxonomyRead(PERM.CATALOG_BRANDS_VIEW))) == null
    )
      return;
    const row = await repos.brands.findById(req.params.id);
    if (!row) return reply.code(404).send({ error: "not_found" });
    return { brand: row };
  });

  app.post("/api/admin/brands", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.CATALOG_BRANDS_CREATE)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const name = String(b.name ?? "").trim();
    if (!name) return reply.code(400).send({ error: "validation_failed", field: "name" });
    const slug = slugify(b.slug || name);
    if (await repos.brands.slugTaken(slug, null)) return reply.code(409).send({ error: "slug_taken" });
    const id = await repos.brands.create({
      name,
      slug,
      logo_path: b.logo_path != null ? String(b.logo_path) : null,
      display_order: b.display_order,
      is_active: Boolean(b.is_active),
    });
    return { ok: true, id };
  });

  app.patch("/api/admin/brands/:id", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.CATALOG_BRANDS_UPDATE)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const existing = await repos.brands.findById(req.params.id);
    if (!existing) return reply.code(404).send({ error: "not_found" });
    const b = parseJsonBody(req.body);
    const name = b.name != null ? String(b.name).trim() : existing.name;
    let slug;
    if (b.slug != null) slug = slugify(b.slug);
    else if (b.name != null) slug = slugify(name);
    else slug = existing.slug;
    if (slug !== existing.slug && (await repos.brands.slugTaken(slug, existing.id))) {
      return reply.code(409).send({ error: "slug_taken" });
    }
    await repos.brands.update(req.params.id, {
      name,
      slug,
      logo_path: b.logo_path !== undefined ? (b.logo_path == null ? null : String(b.logo_path)) : existing.logo_path,
      display_order: b.display_order != null ? Number(b.display_order) : existing.display_order,
      is_active: b.is_active !== undefined ? (b.is_active ? 1 : 0) : existing.is_active,
    });
    return { ok: true };
  });

  app.delete("/api/admin/brands/:id", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.CATALOG_BRANDS_DELETE)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const n = await repos.brands.countProducts(req.params.id);
    if (n > 0) return reply.code(409).send({ error: "brand_has_products", count: n });
    await repos.brands.delete(req.params.id);
    return { ok: true };
  });

  /* ---------- Stores (admin only) ---------- */
  app.get("/api/admin/stores", async (req, reply) => {
    if ((await requireAdmin(req, reply, rbacService)) == null) return;
    return { stores: await repos.stores.listAll() };
  });

  /** Active stores for staff dropdowns (POS, stock, catalog shop assignment / filters). */
  app.get("/api/admin/stores/active-list", async (req, reply) => {
    if (
      (await requireStaffWithAnyPermission(req, reply, rbacService, [
        PERM.ADMIN_STOCK,
        PERM.CATALOG_PRODUCTS_VIEW,
        PERM.CATALOG_PRODUCTS_CREATE,
        PERM.CATALOG_PRODUCTS_UPDATE,
      ])) == null
    )
      return;
    return { stores: await repos.stores.listActive() };
  });

  app.get("/api/admin/stores/:id", async (req, reply) => {
    if ((await requireAdmin(req, reply, rbacService)) == null) return;
    const row = await repos.stores.findById(req.params.id);
    if (!row) return reply.code(404).send({ error: "not_found" });
    return { store: row };
  });

  app.post("/api/admin/stores", async (req, reply) => {
    if ((await requireAdmin(req, reply, rbacService)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const result = await repos.stores.createForAdmin(b);
    if (!result.ok) {
      if (result.error === "code_taken") return reply.code(409).send({ error: "code_taken" });
      return reply.code(400).send({ error: result.error, fields: result.fields });
    }
    return { ok: true, id: result.id };
  });

  app.patch("/api/admin/stores/:id", async (req, reply) => {
    if ((await requireAdmin(req, reply, rbacService)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const result = await repos.stores.updateForAdmin(req.params.id, b);
    if (!result.ok) {
      if (result.error === "not_found") return reply.code(404).send({ error: "not_found" });
      if (result.error === "code_taken") return reply.code(409).send({ error: "code_taken" });
      return reply.code(400).send({ error: result.error, fields: result.fields });
    }
    return { ok: true };
  });

  app.delete("/api/admin/stores/:id", async (req, reply) => {
    if ((await requireAdmin(req, reply, rbacService)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const blockers = await repos.stores.getDeleteBlockers(req.params.id);
    const sum =
      blockers.counters +
      blockers.pos_orders +
      blockers.pos_holds +
      blockers.bill_sequences +
      blockers.returns;
    if (sum > 0) return reply.code(409).send({ error: "store_in_use", blockers });
    const result = await repos.stores.deleteById(req.params.id);
    if (!result.ok) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  /* ---------- Counters (admin + staff) ---------- */
  app.get("/api/admin/counters", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_COUNTERS)) == null) return;
    const storeId = Math.floor(Number(req.query.store_id) || 0);
    const [counters, stores] = await Promise.all([
      repos.posCounters.listWithStoreNames({ storeId }),
      repos.stores.listActive(),
    ]);
    return { counters, stores };
  });

  app.get("/api/admin/counters/:id", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_COUNTERS)) == null) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: "invalid_id" });
    const counter = await repos.posCounters.findById(id);
    if (!counter) return reply.code(404).send({ error: "not_found" });
    const stores = await repos.stores.listActive();
    return { counter, stores };
  });

  app.post("/api/admin/counters", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_COUNTERS)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const store_id = Number(b.store_id);
    const store = await repos.stores.findById(store_id);
    if (!store) return reply.code(400).send({ error: "validation_failed", field: "store_id" });
    const r = await repos.posCounters.createForAdmin({
      store_id,
      code: b.code,
      name: b.name,
      pin: b.pin,
    });
    if (!r.ok) {
      if (r.error === "code_taken") return reply.code(409).send({ error: "code_taken" });
      if (r.error === "pin_short") return reply.code(400).send({ error: "pin_short" });
      return reply.code(400).send({ error: r.error, field: r.field });
    }
    return { ok: true, id: r.id };
  });

  app.patch("/api/admin/counters/:id", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_COUNTERS)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: "invalid_id" });
    const b = parseJsonBody(req.body);
    if (b.store_id != null) {
      const store = await repos.stores.findById(Number(b.store_id));
      if (!store) return reply.code(400).send({ error: "validation_failed", field: "store_id" });
    }
    const r = await repos.posCounters.updateForAdmin(id, b);
    if (!r.ok) {
      if (r.error === "not_found") return reply.code(404).send({ error: "not_found" });
      if (r.error === "code_taken") return reply.code(409).send({ error: "code_taken" });
      if (r.error === "pin_short") return reply.code(400).send({ error: "pin_short" });
      if (r.error === "pin_mismatch") return reply.code(400).send({ error: "pin_mismatch" });
      return reply.code(400).send({ error: r.error, field: r.field });
    }
    return { ok: true };
  });

  app.post("/api/admin/counters/:id/toggle-active", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_COUNTERS)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: "invalid_id" });
    const r = await repos.posCounters.toggleActive(id);
    if (!r.ok) return reply.code(404).send({ error: "not_found" });
    return { ok: true, is_active: r.is_active };
  });

  /* ---------- Roles & permissions (admin only) ---------- */
  app.get("/api/admin/permissions", async (req, reply) => {
    if ((await requireAdmin(req, reply, rbacService)) == null) return;
    const permissions = await repos.roles.listPermissions();
    return { permissions };
  });

  app.get("/api/admin/roles", async (req, reply) => {
    if ((await requireAdmin(req, reply, rbacService)) == null) return;
    const roles = await repos.roles.listAll();
    return { roles };
  });

  app.get("/api/admin/roles/:id", async (req, reply) => {
    if ((await requireAdmin(req, reply, rbacService)) == null) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: "invalid_id" });
    const role = await repos.roles.findByIdWithUsersCount(id);
    if (!role) return reply.code(404).send({ error: "not_found" });
    const [permission_ids, permissions] = await Promise.all([
      repos.roles.getPermissionIdsForRole(id),
      repos.roles.listPermissions(),
    ]);
    return { role, permission_ids, permissions };
  });

  app.post("/api/admin/roles", async (req, reply) => {
    if ((await requireAdmin(req, reply, rbacService)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const cr = await repos.roles.createRole({ name: b.name, description: b.description });
    if (!cr.ok) {
      if (cr.field) return reply.code(400).send({ error: cr.error, field: cr.field });
      return reply.code(400).send({ error: cr.error });
    }
    const ids = Array.isArray(b.permission_ids) ? b.permission_ids : [];
    const pr = await repos.roles.setRolePermissions(cr.id, ids);
    if (!pr.ok) {
      await repos.roles.deleteById(cr.id);
      return reply.code(400).send({ error: pr.error });
    }
    return { ok: true, id: cr.id };
  });

  app.patch("/api/admin/roles/:id", async (req, reply) => {
    if ((await requireAdmin(req, reply, rbacService)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: "invalid_id" });
    const b = parseJsonBody(req.body);
    const ur = await repos.roles.updateRole(id, { name: b.name, description: b.description });
    if (!ur.ok) {
      if (ur.error === "not_found") return reply.code(404).send({ error: "not_found" });
      return reply.code(400).send({ error: ur.error, field: ur.field });
    }
    if (b.permission_ids != null) {
      const pr = await repos.roles.setRolePermissions(id, Array.isArray(b.permission_ids) ? b.permission_ids : []);
      if (!pr.ok) return reply.code(400).send({ error: pr.error });
    }
    return { ok: true };
  });

  app.delete("/api/admin/roles/:id", async (req, reply) => {
    if ((await requireAdmin(req, reply, rbacService)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: "invalid_id" });
    const r = await repos.roles.deleteById(id);
    if (!r.ok) {
      if (r.error === "not_found") return reply.code(404).send({ error: "not_found" });
      if (r.error === "system_role") return reply.code(403).send({ error: "system_role" });
      if (r.error === "role_in_use") return reply.code(409).send({ error: "role_in_use", users_count: r.users_count });
      return reply.code(400).send({ error: r.error });
    }
    return { ok: true };
  });

  /* ---------- Staff (admin only) ---------- */
  app.get("/api/admin/staff/form-options", async (req, reply) => {
    if ((await requireAdmin(req, reply, rbacService)) == null) return;
    const [stores, roles] = await Promise.all([repos.stores.listActive(), repos.roles.listAll()]);
    return {
      stores,
      roles: roles.map((r) => ({ id: r.id, name: r.name, is_system_role: r.is_system_role })),
    };
  });

  app.get("/api/admin/staff", async (req, reply) => {
    if ((await requireAdmin(req, reply, rbacService)) == null) return;
    const staff = await repos.users.listStaffForAdmin();
    return { staff };
  });

  app.get("/api/admin/staff/:id", async (req, reply) => {
    if ((await requireAdmin(req, reply, rbacService)) == null) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: "invalid_id" });
    const user = await repos.users.findStaffForAdminDetail(id);
    if (!user) return reply.code(404).send({ error: "not_found" });
    const [stores, roles] = await Promise.all([repos.stores.listActive(), repos.roles.listAll()]);
    return {
      user,
      stores,
      roles: roles.map((r) => ({ id: r.id, name: r.name, is_system_role: r.is_system_role })),
    };
  });

  app.post("/api/admin/staff", async (req, reply) => {
    if ((await requireAdmin(req, reply, rbacService)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const r = await repos.users.createStaff({
      name: b.name,
      email: b.email,
      phone: b.phone,
      password: b.password,
      shop_id: b.shop_id,
      role_id: b.role_id,
      catalog_multi_shop_filter: b.catalog_multi_shop_filter,
      catalog_extra_shop_ids: b.catalog_extra_shop_ids,
    });
    if (!r.ok) {
      if (r.error === "email_taken") return reply.code(409).send({ error: "email_taken" });
      if (r.error === "password_short") return reply.code(400).send({ error: "password_short" });
      if (r.error === "invalid_role") return reply.code(400).send({ error: "invalid_role" });
      if (r.error === "invalid_store") return reply.code(400).send({ error: "invalid_store" });
      if (r.error === "invalid_catalog_shop") return reply.code(400).send({ error: r.error, field: r.field });
      return reply.code(400).send({ error: r.error, field: r.field });
    }
    return { ok: true, id: r.id };
  });

  app.patch("/api/admin/staff/:id", async (req, reply) => {
    if ((await requireAdmin(req, reply, rbacService)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: "invalid_id" });
    const b = parseJsonBody(req.body);
    const r = await repos.users.updateStaff(id, b);
    if (!r.ok) {
      if (r.error === "not_found") return reply.code(404).send({ error: "not_found" });
      if (r.error === "password_short") return reply.code(400).send({ error: "password_short" });
      if (r.error === "invalid_role") return reply.code(400).send({ error: "invalid_role" });
      if (r.error === "invalid_store") return reply.code(400).send({ error: "invalid_store" });
      if (r.error === "invalid_catalog_shop") return reply.code(400).send({ error: r.error, field: r.field });
      return reply.code(400).send({ error: r.error });
    }
    return { ok: true };
  });

  app.delete("/api/admin/staff/:id", async (req, reply) => {
    if ((await requireAdmin(req, reply, rbacService)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: "invalid_id" });
    if (id === Number(req.authUser?.id)) {
      return reply.code(403).send({ error: "cannot_delete_self" });
    }
    const r = await repos.users.deleteStaff(id);
    if (!r.ok) {
      if (r.error === "not_found") return reply.code(404).send({ error: "not_found" });
      if (r.error === "staff_in_use") return reply.code(409).send({ error: "staff_in_use", blockers: r.blockers });
      return reply.code(400).send({ error: r.error });
    }
    return { ok: true };
  });

  /* ---------- Coupons (admin only) ---------- */
  app.get("/api/admin/coupons", async (req, reply) => {
    if ((await requireAdmin(req, reply, rbacService)) == null) return;
    const coupons = await repos.coupons.listAll();
    return { coupons };
  });

  app.get("/api/admin/coupons/:id", async (req, reply) => {
    if ((await requireAdmin(req, reply, rbacService)) == null) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: "invalid_id" });
    const coupon = await repos.coupons.findById(id);
    if (!coupon) return reply.code(404).send({ error: "not_found" });
    return { coupon };
  });

  app.post("/api/admin/coupons", async (req, reply) => {
    if ((await requireAdmin(req, reply, rbacService)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const r = await repos.coupons.create(b);
    if (!r.ok) {
      if (r.error === "code_taken") return reply.code(409).send({ error: "code_taken" });
      if (r.error === "code_invalid") return reply.code(400).send({ error: "code_invalid" });
      if (r.error === "dates_required") return reply.code(400).send({ error: "dates_required" });
      if (r.error === "valid_to_before_from") return reply.code(400).send({ error: "valid_to_before_from" });
      if (r.error === "discount_value_invalid") return reply.code(400).send({ error: "discount_value_invalid" });
      if (r.error === "percent_too_high") return reply.code(400).send({ error: "percent_too_high" });
      return reply.code(400).send({ error: r.error });
    }
    return { ok: true, id: r.id };
  });

  app.patch("/api/admin/coupons/:id", async (req, reply) => {
    if ((await requireAdmin(req, reply, rbacService)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: "invalid_id" });
    const r = await repos.coupons.update(id, parseJsonBody(req.body));
    if (!r.ok) {
      if (r.error === "not_found") return reply.code(404).send({ error: "not_found" });
      if (r.error === "code_taken") return reply.code(409).send({ error: "code_taken" });
      if (r.error === "code_invalid") return reply.code(400).send({ error: "code_invalid" });
      if (r.error === "dates_required") return reply.code(400).send({ error: "dates_required" });
      if (r.error === "valid_to_before_from") return reply.code(400).send({ error: "valid_to_before_from" });
      if (r.error === "discount_value_invalid") return reply.code(400).send({ error: "discount_value_invalid" });
      if (r.error === "percent_too_high") return reply.code(400).send({ error: "percent_too_high" });
      return reply.code(400).send({ error: r.error });
    }
    return { ok: true };
  });

  app.delete("/api/admin/coupons/:id", async (req, reply) => {
    if ((await requireAdmin(req, reply, rbacService)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const id = Number(req.params.id);
    const r = await repos.coupons.deleteById(id);
    if (!r.ok) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  /* ---------- Stock transfer (admin/staff) ---------- */
  app.get("/api/admin/stock-transfer/state", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_STOCK)) == null) return;
    const sourceId = Math.floor(Number(req.query.source_id) || 0);
    const destId = Math.floor(Number(req.query.dest_id) || 0);
    const barcode = String(req.query.barcode ?? "").trim();
    const q = String(req.query.q ?? "").trim();

    if (!req.sessionData) {
      return reply.code(401).send({ error: "auth_required" });
    }
    req.sessionData.stock_transfer ??= { source_store_id: 0, dest_store_id: 0, lines: [] };
    const st = req.sessionData.stock_transfer;
    if (sourceId > 0) st.source_store_id = sourceId;
    if (destId > 0) st.dest_store_id = destId;
    if (
      st.source_store_id > 0 &&
      st.dest_store_id > 0 &&
      Number(st.source_store_id) === Number(st.dest_store_id)
    ) {
      st.dest_store_id = 0;
    }
    await saveAdminSession(req);

    const stores = await repos.stores.listActive();
    let selected = null;
    let results = [];
    let error_detail = null;

    if (st.source_store_id > 0 && barcode) {
      const resolved = await repos.products.resolvePosProductLine({ barcode });
      if (!resolved.ok) {
        error_detail = "No product found for that barcode or SKU.";
      } else {
        const p = await repos.products.findById(resolved.product_id);
        if (p?.no_store_stock === 1) {
          error_detail = "This product is marked as no store stock.";
        } else {
          const vid = resolved.variant_id != null ? Number(resolved.variant_id) : null;
          const avail = await repos.stockTransfer.getAvailableForLine(st.source_store_id, resolved.product_id, vid);
          if (avail <= 0) {
            error_detail = "No quantity available at the source store for this line.";
          } else {
            selected = {
              product_id: resolved.product_id,
              variant_id: vid,
              name: resolved.name,
              sku: p?.sku ?? "",
              available: avail,
            };
          }
        }
      }
    } else if (st.source_store_id > 0 && q.length >= 2) {
      results = await repos.stockTransfer.searchProductsAtStore(st.source_store_id, q, 24);
    }

    const cart = st.lines ?? [];
    const cart_items = [];
    for (const line of cart) {
      const p = await repos.products.findById(line.product_id);
      cart_items.push({
        ...line,
        name: p?.name ?? `#${line.product_id}`,
      });
    }

    return {
      stores,
      source_store_id: st.source_store_id,
      dest_store_id: st.dest_store_id,
      cart: cart_items,
      selected,
      results,
      error_detail,
    };
  });

  app.post("/api/admin/stock-transfer/cart/add", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_STOCK)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const sourceId = Math.floor(Number(b.source_store_id) || 0);
    const pid = Math.floor(Number(b.product_id) || 0);
    const qty = Math.max(1, Math.floor(Number(b.quantity) || 1));
    const vid = b.variant_id != null && b.variant_id !== "" ? Math.floor(Number(b.variant_id)) : null;
    if (sourceId <= 0 || pid <= 0) return reply.code(400).send({ error: "validation_failed" });

    req.sessionData.stock_transfer ??= { source_store_id: 0, dest_store_id: 0, lines: [] };
    const st = req.sessionData.stock_transfer;
    st.source_store_id = sourceId;
    const lineKey = `${pid}:${vid ?? "p"}`;
    const avail = await repos.stockTransfer.getAvailableForLine(sourceId, pid, vid);
    const idx = st.lines.findIndex((x) => x.line_key === lineKey);
    const cur = idx >= 0 ? Math.floor(Number(st.lines[idx].qty) || 0) : 0;
    if (cur + qty > avail) return reply.code(400).send({ error: "insufficient_stock" });
    if (idx >= 0) st.lines[idx].qty = cur + qty;
    else st.lines.push({ line_key: lineKey, product_id: pid, variant_id: vid, qty });
    await saveAdminSession(req);
    return { ok: true, cart: st.lines };
  });

  app.post("/api/admin/stock-transfer/cart/remove", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_STOCK)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const lineKey = String(b.line_key ?? "").trim();
    if (!lineKey) return reply.code(400).send({ error: "validation_failed" });
    req.sessionData.stock_transfer ??= { source_store_id: 0, dest_store_id: 0, lines: [] };
    const st = req.sessionData.stock_transfer;
    st.lines = (st.lines ?? []).filter((x) => x.line_key !== lineKey);
    await saveAdminSession(req);
    return { ok: true, cart: st.lines };
  });

  app.post("/api/admin/stock-transfer/cart/clear", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_STOCK)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    req.sessionData.stock_transfer ??= { source_store_id: 0, dest_store_id: 0, lines: [] };
    req.sessionData.stock_transfer.lines = [];
    await saveAdminSession(req);
    return { ok: true };
  });

  app.post("/api/admin/stock-transfer/commit", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_STOCK)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const destId = Math.floor(Number(b.dest_store_id) || 0);
    req.sessionData.stock_transfer ??= { source_store_id: 0, dest_store_id: 0, lines: [] };
    const st = req.sessionData.stock_transfer;
    const sourceId = Math.floor(Number(st.source_store_id) || 0);
    if (sourceId <= 0 || destId <= 0 || sourceId === destId) {
      return reply.code(400).send({ error: "invalid_stores" });
    }
    const lines = st.lines ?? [];
    if (!lines.length) return reply.code(400).send({ error: "empty_cart" });

    const successes = [];
    for (const line of lines) {
      const pid = Number(line.product_id);
      const vid = line.variant_id != null ? Number(line.variant_id) : null;
      const q = Math.floor(Number(line.qty) || 0);
      if (q <= 0) continue;
      let r1;
      let r2;
      if (vid) {
        r1 = await repos.stockTransfer.adjustStoreVariantQuantity(sourceId, pid, vid, -q);
        if (!r1.ok) continue;
        r2 = await repos.stockTransfer.adjustStoreVariantQuantity(destId, pid, vid, q);
        if (!r2.ok) {
          await repos.stockTransfer.adjustStoreVariantQuantity(sourceId, pid, vid, q);
          continue;
        }
      } else {
        r1 = await repos.stockTransfer.adjustStoreProductQuantity(sourceId, pid, -q);
        if (!r1.ok) continue;
        r2 = await repos.stockTransfer.adjustStoreProductQuantity(destId, pid, q);
        if (!r2.ok) {
          await repos.stockTransfer.adjustStoreProductQuantity(sourceId, pid, q);
          continue;
        }
      }
      successes.push({ product_id: pid, variant_id: vid, qty: q });
    }
    if (!successes.length) return reply.code(400).send({ error: "transfer_failed" });

    const tr = await repos.stockTransfer.createTransferRecord({
      sourceStoreId: sourceId,
      destStoreId: destId,
      userId: req.authUser?.id,
      itemCount: successes.length,
    });
    for (const s of successes) {
      await repos.stockTransfer.insertTransferItem(tr.id, s.product_id, s.variant_id, s.qty);
    }
    st.lines = [];
    st.dest_store_id = destId;
    await saveAdminSession(req);
    return { ok: true, transfer_number: tr.transfer_number };
  });

  /* ---------- Stock management (admin/staff) ---------- */
  app.get("/api/admin/stock-management/inventory", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_STOCK)) == null) return;
    const storeId = Math.floor(Number(req.query.store_id) || 0);
    const categoryId = Math.floor(Number(req.query.category_id) || 0);
    const search = String(req.query.search ?? "").trim();
    const lowStockOnly = String(req.query.low_stock ?? "") === "1";
    const page = Math.floor(Number(req.query.page) || 1);
    const data = await repos.stockManagement.listInventory({
      storeId,
      categoryId,
      search,
      lowStockOnly,
      page,
      perPage: 40,
    });
    let low_stock_count = 0;
    if (storeId > 0) {
      low_stock_count = await repos.stockManagement.lowStockCountForStore(storeId, 5);
    }
    const [stores, categories] = await Promise.all([repos.stores.listActive(), repos.categories.getActive()]);
    return { ...data, stores, categories, low_stock_count };
  });

  app.get("/api/admin/stock-management/product/:id", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_STOCK)) == null) return;
    const storeFilter = Math.floor(Number(req.query.store_id) || 0);
    const detail = await repos.stockManagement.getProductDetail(req.params.id, storeFilter);
    if (!detail) return reply.code(404).send({ error: "not_found" });
    return detail;
  });

  app.get("/api/admin/stock-management/adjust-form", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_STOCK)) == null) return;
    const variantId = Math.floor(Number(req.query.variant_id) || 0);
    const storeId = Math.floor(Number(req.query.store_id) || 0);
    const r = await repos.stockManagement.getAdjustForm({ variantId, storeId });
    if (!r.ok) return reply.code(400).send({ error: r.error });
    return r;
  });

  app.post("/api/admin/stock-management/adjust", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_STOCK)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const variantId = b.variant_id != null && b.variant_id !== "" ? Math.floor(Number(b.variant_id)) : null;
    const productId = b.product_id != null && b.product_id !== "" ? Math.floor(Number(b.product_id)) : null;
    const storeId = Math.floor(Number(b.store_id) || 0);
    const action = String(b.action ?? "").trim();
    const quantity = Math.floor(Number(b.quantity) || 0);
    const reason = String(b.reason ?? "ADJUST").trim() || "ADJUST";
    const notes = b.notes != null ? String(b.notes) : "";
    if (!storeId) return reply.code(400).send({ error: "store_required" });
    if (!reason) return reply.code(400).send({ error: "reason_required" });
    const r = await repos.stockManagement.adjustWithLog({
      variantId,
      productId,
      storeId,
      action,
      quantity,
      reason,
      notes,
      userId: req.authUser?.id,
    });
    if (!r.ok) {
      if (r.error === "insufficient_stock") return reply.code(400).send({ error: "insufficient_stock" });
      return reply.code(400).send({ error: r.error });
    }
    return { ok: true, previous_stock: r.previous_stock, new_stock: r.new_stock };
  });

  app.get("/api/admin/stock-management/history", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_STOCK)) == null) return;
    const storeId = Math.floor(Number(req.query.store_id) || 0);
    const variantId = Math.floor(Number(req.query.variant_id) || 0);
    const productId = Math.floor(Number(req.query.product_id) || 0);
    const reason = String(req.query.reason ?? "").trim();
    const page = Math.floor(Number(req.query.page) || 1);
    const data = await repos.stockManagement.listMovements({ storeId, variantId, productId, reason, page, perPage: 20 });
    const stores = await repos.stores.listActive();
    return { ...data, stores };
  });

  app.get("/api/admin/stock-management/low-stock", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_STOCK)) == null) return;
    const storeId = Math.floor(Number(req.query.store_id) || 0);
    const threshold = Math.floor(Number(req.query.threshold) || 5);
    const data = await repos.stockManagement.listLowStock({ storeId, threshold });
    const stores = await repos.stores.listActive();
    return { ...data, stores, threshold };
  });

  /* ---------- Models ---------- */
  app.get("/api/admin/models", async (req, reply) => {
    if (
      (await requireStaffWithAnyPermission(req, reply, rbacService, taxonomyRead(PERM.CATALOG_MODELS_VIEW))) == null
    )
      return;
    const brandId = req.query?.brand_id ? Number(req.query.brand_id) : 0;
    const models = brandId ? await repos.models.listByBrand(brandId) : await repos.models.listAll();
    return { models, brands: await repos.brands.listAll() };
  });

  app.get("/api/admin/models/:id", async (req, reply) => {
    if (
      (await requireStaffWithAnyPermission(req, reply, rbacService, taxonomyRead(PERM.CATALOG_MODELS_VIEW))) == null
    )
      return;
    const row = await repos.models.findById(req.params.id);
    if (!row) return reply.code(404).send({ error: "not_found" });
    return { model: row, brands: await repos.brands.listAll() };
  });

  app.post("/api/admin/models", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.CATALOG_MODELS_CREATE)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const brand_id = Number(b.brand_id);
    if (!brand_id) return reply.code(400).send({ error: "validation_failed", field: "brand_id" });
    const name = String(b.name ?? "").trim();
    if (!name) return reply.code(400).send({ error: "validation_failed", field: "name" });
    const slug = slugify(b.slug || name);
    if (await repos.models.slugTakenForBrand(brand_id, slug, null)) {
      return reply.code(409).send({ error: "slug_taken" });
    }
    const id = await repos.models.create({
      brand_id,
      name,
      slug,
      model_number: b.model_number != null ? String(b.model_number) : null,
      is_active: Boolean(b.is_active),
    });
    return { ok: true, id };
  });

  app.patch("/api/admin/models/:id", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.CATALOG_MODELS_UPDATE)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const existing = await repos.models.findById(req.params.id);
    if (!existing) return reply.code(404).send({ error: "not_found" });
    const b = parseJsonBody(req.body);
    const brand_id = b.brand_id != null ? Number(b.brand_id) : existing.brand_id;
    const name = b.name != null ? String(b.name).trim() : existing.name;
    let slug;
    if (b.slug != null) slug = slugify(b.slug);
    else if (b.name != null) slug = slugify(name);
    else slug = existing.slug;
    if (
      (slug !== existing.slug || brand_id !== existing.brand_id) &&
      (await repos.models.slugTakenForBrand(brand_id, slug, existing.id))
    ) {
      return reply.code(409).send({ error: "slug_taken" });
    }
    await repos.models.update(req.params.id, {
      brand_id,
      name,
      slug,
      model_number:
        b.model_number !== undefined ? (b.model_number == null ? null : String(b.model_number)) : existing.model_number,
      is_active: b.is_active !== undefined ? (b.is_active ? 1 : 0) : existing.is_active,
    });
    return { ok: true };
  });

  app.delete("/api/admin/models/:id", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.CATALOG_MODELS_DELETE)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const n = await repos.models.countProducts(req.params.id);
    if (n > 0) return reply.code(409).send({ error: "model_has_products", count: n });
    await repos.models.delete(req.params.id);
    return { ok: true };
  });

  /* ---------- Subcategories ---------- */
  app.get("/api/admin/subcategories", async (req, reply) => {
    if (
      (await requireStaffWithAnyPermission(req, reply, rbacService, taxonomyRead(PERM.CATALOG_SUBCATEGORIES_VIEW))) ==
      null
    )
      return;
    const page = Math.max(1, Number(req.query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 24));
    const { items, total, total_pages } = await repos.subcategories.listFiltered({
      q: req.query?.q,
      categoryId: req.query?.category_id ? Number(req.query.category_id) : 0,
      active: req.query?.active != null ? String(req.query.active) : "",
      page,
      limit,
    });
    return {
      subcategories: items,
      categories: await repos.categories.getActive(),
      page,
      limit,
      total,
      total_pages,
    };
  });

  app.get("/api/admin/subcategories/:id", async (req, reply) => {
    if (
      (await requireStaffWithAnyPermission(req, reply, rbacService, taxonomyRead(PERM.CATALOG_SUBCATEGORIES_VIEW))) ==
      null
    )
      return;
    const row = await repos.subcategories.findById(req.params.id);
    if (!row) return reply.code(404).send({ error: "not_found" });
    return { subcategory: row, categories: await repos.categories.getActive() };
  });

  app.post("/api/admin/subcategories", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.CATALOG_SUBCATEGORIES_CREATE)) == null)
      return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const category_id = Number(b.category_id);
    if (!category_id) return reply.code(400).send({ error: "validation_failed", field: "category_id" });
    const name = String(b.name ?? "").trim();
    if (!name) return reply.code(400).send({ error: "validation_failed", field: "name" });
    const slug = slugify(b.slug || name);
    if (await repos.subcategories.slugTaken(category_id, slug, null)) {
      return reply.code(409).send({ error: "slug_taken" });
    }
    const id = await repos.subcategories.create({
      category_id,
      name,
      slug,
      description: b.description != null ? String(b.description) : null,
      display_order: b.display_order,
      is_active: Boolean(b.is_active),
    });
    return { ok: true, id };
  });

  app.patch("/api/admin/subcategories/:id", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.CATALOG_SUBCATEGORIES_UPDATE)) == null)
      return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const existing = await repos.subcategories.findById(req.params.id);
    if (!existing) return reply.code(404).send({ error: "not_found" });
    const b = parseJsonBody(req.body);
    const category_id = b.category_id != null ? Number(b.category_id) : existing.category_id;
    const name = b.name != null ? String(b.name).trim() : existing.name;
    let slug;
    if (b.slug != null) slug = slugify(b.slug);
    else if (b.name != null) slug = slugify(name);
    else slug = existing.slug;
    if (
      (slug !== existing.slug || category_id !== existing.category_id) &&
      (await repos.subcategories.slugTaken(category_id, slug, existing.id))
    ) {
      return reply.code(409).send({ error: "slug_taken" });
    }
    await repos.subcategories.update(req.params.id, {
      category_id,
      name,
      slug,
      description:
        b.description !== undefined ? (b.description == null ? null : String(b.description)) : existing.description,
      display_order: b.display_order != null ? Number(b.display_order) : existing.display_order,
      is_active: b.is_active !== undefined ? (b.is_active ? 1 : 0) : existing.is_active,
    });
    return { ok: true };
  });

  app.post("/api/admin/subcategories/:id/toggle-active", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.CATALOG_SUBCATEGORIES_UPDATE)) == null)
      return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const row = await repos.subcategories.findById(req.params.id);
    if (!row) return reply.code(404).send({ error: "not_found" });
    const next = row.is_active === 1 || row.is_active === true ? 0 : 1;
    await repos.subcategories.update(req.params.id, { is_active: next });
    return { ok: true, is_active: next };
  });

  app.delete("/api/admin/subcategories/:id", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.CATALOG_SUBCATEGORIES_DELETE)) == null)
      return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const n = await repos.subcategories.countProducts(req.params.id);
    if (n > 0) return reply.code(409).send({ error: "subcategory_has_products", count: n });
    await repos.subcategories.delete(req.params.id);
    return { ok: true };
  });

  /* ---------- Orders (Mongo; staff/admin) ---------- */
  app.get("/api/admin/orders", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_ORDERS)) == null) return;
    const page = req.query?.page ?? 1;
    const perPage = req.query?.perPage ?? req.query?.per_page ?? 20;
    const orderStatus = req.query?.order_status ?? req.query?.orderStatus;
    const paymentStatus = req.query?.payment_status ?? req.query?.paymentStatus;
    const q = req.query?.q;
    const dateFrom = req.query?.date_from ?? req.query?.dateFrom;
    const dateTo = req.query?.date_to ?? req.query?.dateTo;
    return repos.checkout.listForAdmin({ page, perPage, orderStatus, paymentStatus, q, dateFrom, dateTo });
  });

  app.get("/api/admin/orders/:id", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_ORDERS)) == null) return;
    const order = await repos.checkout.findByIdForAdmin(req.params.id);
    if (!order) return reply.code(404).send({ error: "not_found" });
    return { order };
  });

  app.patch("/api/admin/orders/:id", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_ORDERS)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    if (b.order_status === undefined && b.payment_status === undefined) {
      return reply.code(400).send({
        error: "validation_failed",
        message: "Provide order_status and/or payment_status",
      });
    }
    const r = await repos.checkout.updateOrderAdmin(req.params.id, {
      order_status: b.order_status,
      payment_status: b.payment_status,
    });
    if (!r.ok) {
      if (r.error === "not_found") return reply.code(404).send({ error: "not_found" });
      if (r.error === "no_changes") return reply.code(400).send({ error: "no_changes" });
      if (r.error === "invalid_id") return reply.code(400).send({ error: "invalid_id" });
    }
    return { ok: true, order: r.order };
  });

  /* ---------- Products ---------- */
  app.get("/api/admin/products", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.CATALOG_PRODUCTS_VIEW)) == null) return;
    const scope = await resolveCatalogProductScope(req, rbacService, repos);
    if (!scope.canAllShops && scope.staffShopId == null) {
      return reply.code(403).send({
        error: "staff_shop_required",
        message:
          "This account has no assigned shop. Assign a shop on the Staff screen, or grant “Products — all shops (catalog)”.",
      });
    }
    const page = Math.max(1, Number(req.query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 24));
    const shop_unassigned =
      scope.canAllShops && (req.query?.shop_unassigned === "1" || req.query?.shop_unassigned === "true");
    const list = await repos.products.listForAdmin({
      page,
      limit,
      q: req.query?.q,
      category_id: req.query?.category_id,
      subcategory_id: req.query?.subcategory_id,
      brand_id: req.query?.brand_id,
      model_id: req.query?.model_id,
      is_active: req.query?.is_active,
      is_featured: req.query?.is_featured,
      shop_id: req.query?.shop_id,
      shop_unassigned_only: shop_unassigned,
      stock_min: req.query?.stock_min,
      stock_max: req.query?.stock_max,
      restricted_catalog_shop_ids: scope.canAllShops ? null : scope.restrictedCatalogShopIds,
      allow_shop_filter: scope.canAllShops,
    });
    return {
      ...list,
      catalog_scope: {
        staff_shop_id: scope.staffShopId,
        shop_name: scope.shopName,
        can_filter_all_shops: scope.canAllShops,
        catalog_shop_ids: scope.restrictedCatalogShopIds,
      },
    };
  });

  app.post("/api/admin/products", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.CATALOG_PRODUCTS_CREATE)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const scope = await resolveCatalogProductScope(req, rbacService, repos);
    if (!scope.canAllShops && scope.staffShopId == null) {
      return reply.code(403).send({
        error: "staff_shop_required",
        message:
          "This account has no assigned shop. Assign a shop on the Staff screen, or grant “Products — all shops (catalog)”.",
      });
    }
    const body = mergeShopScopedProductPayload(scope, parseJsonBody(req.body));
    const r = await repos.products.createForAdmin(body);
    if (!r.ok) {
      if (r.error === "validation_failed") {
        return reply.code(400).send({ error: r.error, field: r.field });
      }
      if (r.error === "sku_taken") return reply.code(409).send({ error: r.error });
      if (
        r.error === "variant_barcode_taken" ||
        r.error === "duplicate_variant_barcode" ||
        r.error === "variant_barcode_generation_failed"
      ) {
        return reply.code(r.error === "variant_barcode_generation_failed" ? 500 : 409).send({
          error: r.error,
          barcode: r.barcode,
        });
      }
      if (
        r.error === "invalid_category" ||
        r.error === "invalid_subcategory" ||
        r.error === "invalid_brand" ||
        r.error === "invalid_model" ||
        r.error === "invalid_compatible_model" ||
        r.error === "subcategory_category_mismatch" ||
        r.error === "model_brand_mismatch"
      ) {
        return reply.code(400).send({ error: r.error });
      }
      if (r.error === "invalid_shop") return reply.code(400).send({ error: r.error, field: r.field });
      return reply.code(400).send({ error: r.error || "create_failed" });
    }
    return { ok: true, id: r.id };
  });

  app.get("/api/admin/products/:id", async (req, reply) => {
    if (
      (await requireStaffWithAnyPermission(req, reply, rbacService, [
        PERM.CATALOG_PRODUCTS_VIEW,
        PERM.CATALOG_PRODUCTS_CREATE,
        PERM.CATALOG_PRODUCTS_UPDATE,
      ])) == null
    )
      return;
    const scope = await resolveCatalogProductScope(req, rbacService, repos);
    const product = await repos.products.findByIdForAdmin(req.params.id);
    if (!product) return reply.code(404).send({ error: "not_found" });
    if (!assertProductShopScope(reply, product, scope)) return;
    return { product };
  });

  app.patch("/api/admin/products/:id", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.CATALOG_PRODUCTS_UPDATE)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const scope = await resolveCatalogProductScope(req, rbacService, repos);
    const existing = await repos.products.findByIdForAdmin(req.params.id);
    if (!existing) return reply.code(404).send({ error: "not_found" });
    if (!assertProductShopScope(reply, existing, scope)) return;
    const body = mergeShopScopedProductPayload(scope, parseJsonBody(req.body));
    const r = await repos.products.updateForAdmin(req.params.id, body);
    if (!r.ok) {
      if (r.error === "not_found") return reply.code(404).send({ error: "not_found" });
      if (r.error === "slug_taken" || r.error === "sku_taken") return reply.code(409).send({ error: r.error });
      if (
        r.error === "variant_barcode_taken" ||
        r.error === "duplicate_variant_barcode" ||
        r.error === "variant_barcode_generation_failed"
      ) {
        return reply.code(r.error === "variant_barcode_generation_failed" ? 500 : 409).send({
          error: r.error,
          barcode: r.barcode,
        });
      }
      if (r.error === "validation_failed") {
        return reply.code(400).send({ error: r.error, field: r.field });
      }
      if (
        r.error === "invalid_category" ||
        r.error === "invalid_subcategory" ||
        r.error === "invalid_brand" ||
        r.error === "invalid_model" ||
        r.error === "invalid_compatible_model" ||
        r.error === "subcategory_category_mismatch" ||
        r.error === "model_brand_mismatch"
      ) {
        return reply.code(400).send({ error: r.error });
      }
      if (r.error === "invalid_shop") return reply.code(400).send({ error: r.error, field: r.field });
      return reply.code(400).send({ error: r.error || "update_failed" });
    }
    const product = await repos.products.findByIdForAdmin(r.id);
    return { ok: true, product };
  });

  app.delete("/api/admin/products/:id", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.CATALOG_PRODUCTS_DELETE)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const scope = await resolveCatalogProductScope(req, rbacService, repos);
    const existingDel = await repos.products.findByIdForAdmin(req.params.id);
    if (!existingDel) return reply.code(404).send({ error: "not_found" });
    if (!assertProductShopScope(reply, existingDel, scope)) return;
    const r = await repos.products.deleteForAdmin(req.params.id);
    if (!r.ok) {
      if (r.error === "not_found") return reply.code(404).send({ error: "not_found" });
      if (r.error === "invalid_id") return reply.code(400).send({ error: r.error });
      if (r.error === "product_in_use") {
        return reply.code(409).send({ error: r.error, blockers: r.blockers });
      }
      return reply.code(400).send({ error: r.error || "delete_failed" });
    }
    return { ok: true };
  });

  /** TSPL label payload for thermal printers. */
  app.get("/api/admin/print/tspl", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.CATALOG_PRODUCTS_LABELS)) == null) return;
    const productId = Number(req.query.productId ?? req.query.product_id ?? 0);
    const vr = req.query.variantId ?? req.query.variant_id;
    const variantId =
      vr != null && String(vr).trim() !== "" && !Number.isNaN(Number(vr)) ? Number(vr) : null;
    const quantity = Math.min(999, Math.max(1, Number(req.query.quantity) || 1));
    const layoutRaw = String(req.query.layout ?? "two_up_72x25");
    const layout = layoutRaw === "single_35x25" ? "single_35x25" : "two_up_72x25";
    const autoCut = req.query.auto_cut !== "0" && req.query.autoCut !== "false";
    const remainderSide =
      String(req.query.remainder_side ?? req.query.odd_slot ?? "left").toLowerCase() === "right"
        ? "right"
        : "left";

    if (!productId) {
      return reply.code(400).send({ error: "validation_failed", field: "productId" });
    }

    const scopeTspl = await resolveCatalogProductScope(req, rbacService, repos);
    const prodTspl = await repos.products.findById(productId);
    if (!prodTspl) return reply.code(404).send({ error: "not_found" });
    if (!assertProductShopScope(reply, prodTspl, scopeTspl)) return;

    const ctx = await repos.products.getPrintLabelContext(productId, variantId);
    if (!ctx) {
      return reply.code(404).send({
        error: "not_found",
        message: "Product not found, or choose a variant when multiple exist.",
      });
    }

    const tspl = buildTsplVariantLabel({
      itemName: ctx.itemName,
      brand: ctx.brand,
      barcodeValue: ctx.barcodeValue,
      priceText: formatPriceInr(ctx.unitPrice),
      count: quantity,
      layout,
      autoCut,
      remainderSide,
    });

    return {
      success: true,
      tspl,
      product_id: ctx.product_id,
      variant_id: ctx.variant_id,
      barcode: ctx.barcodeValue,
      product_name: ctx.itemName,
      quantity,
      layout,
      message: `TSPL generated for ${quantity} label(s)`,
    };
  });

  app.get("/api/admin/print/printer-preference", async (req, reply) => {
    const uid = await requireStaffWithPermission(req, reply, rbacService, PERM.CATALOG_PRODUCTS_LABELS);
    if (uid == null) return;
    const printer_name = await repos.users.getPrinterPreference(uid);
    return { success: true, printer_name };
  });

  app.post("/api/admin/print/printer-preference", async (req, reply) => {
    const uid = await requireStaffWithPermission(req, reply, rbacService, PERM.CATALOG_PRODUCTS_LABELS);
    if (uid == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const name = String(b.printer_name ?? b.printerName ?? "").trim();
    if (!name) return reply.code(400).send({ error: "validation_failed", field: "printer_name" });
    await repos.users.savePrinterPreference(uid, name);
    return { success: true, printer_name: name };
  });

  app.post("/api/admin/print/tspl/send-network", async (req, reply) => {
    const uid = await requireStaffWithPermission(req, reply, rbacService, PERM.CATALOG_PRODUCTS_LABELS);
    if (uid == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const host = String(b.host ?? "").trim();
    const tspl = String(b.tspl ?? "");
    const port = Number(b.port) || 9100;
    if (!host) return reply.code(400).send({ error: "validation_failed", field: "host" });
    if (!tspl) return reply.code(400).send({ error: "validation_failed", field: "tspl" });
    const result = await sendTsplToNetwork({ host, port, tspl });
    if (!result.success) {
      return reply.code(502).send({ error: "print_send_failed", message: result.message });
    }
    return { success: true, ...result };
  });

  /* ---------- Reviews moderation ---------- */
  app.get("/api/admin/reviews/counts", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_REVIEWS)) == null) return;
    return repos.reviews.adminCounts();
  });

  app.get("/api/admin/reviews", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_REVIEWS)) == null) return;
    const status = req.query?.status ?? "pending";
    const page = req.query?.page ?? 1;
    const limit = req.query?.limit ?? 30;
    return repos.reviews.adminList({ status, page, limit });
  });

  app.patch("/api/admin/reviews/:id/status", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_REVIEWS)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const r = await repos.reviews.adminUpdateStatus(req.params.id, b.status);
    if (!r.ok) {
      if (r.error === "not_found") return reply.code(404).send({ error: "not_found" });
      return reply.code(400).send({ error: r.error });
    }
    return { ok: true };
  });

  app.delete("/api/admin/reviews/:id", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_REVIEWS)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const r = await repos.reviews.adminDelete(req.params.id);
    if (!r.ok) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.post("/api/admin/reviews/bulk", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_REVIEWS)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const r = await repos.reviews.adminBulkAction({ action: b.action, ids: b.review_ids ?? b.ids });
    if (!r.ok) return reply.code(400).send({ error: r.error });
    return { ok: true, affected: r.affected };
  });

  /* ---------- Returns ---------- */
  app.get("/api/admin/returns/search", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_RETURNS)) == null) return;
    return repos.returns.searchBill(req.query?.bill_number ?? req.query?.q);
  });

  app.post("/api/admin/returns", async (req, reply) => {
    const uid = await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_RETURNS);
    if (uid == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const r = await repos.returns.createReturn(parseJsonBody(req.body), { userId: uid });
    if (!r.ok) {
      const map = {
        validation_failed: 400,
        invalid_pos_item: 400,
        order_not_found: 404,
        invalid_order_line: 400,
        already_fully_returned: 409,
        exceeds_remaining: 400,
        missing_line_ref: 400,
        product_not_found: 404,
        store_required: 400,
        stock_failed: 502,
      };
      return reply.code(map[r.error] || 400).send({ error: r.error });
    }
    return { ok: true, id: r.id };
  });

  /* ---------- Analytics ---------- */
  app.get("/api/admin/analytics", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.FINANCE_ANALYTICS)) == null) return;
    return repos.analytics.getDashboard();
  });

  /* ---------- Income & expense ---------- */
  app.get("/api/admin/income-expense/overview", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.FINANCE_INCOME_EXPENSE)) == null) return;
    const storeId = Math.floor(Number(req.query.store_id) || 1);
    const date = String(req.query.date ?? "").slice(0, 10) || null;
    const ie = repos.incomeExpense;
    const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
    const monthStart = `${d.slice(0, 7)}-01`;
    const [y, m] = d.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const monthEnd = `${d.slice(0, 7)}-${String(last).padStart(2, "0")}`;
    const [dailyIncome, dailyExpense, recentExpenses, recentIncome, monthlyIncome, monthlyExpense] =
      await Promise.all([
        ie.dailyIncomeTotal(storeId, d),
        ie.dailyExpenseTotal(storeId, d),
        ie.listRecentExpenses(storeId, d, 10),
        ie.listRecentIncome(storeId, d, 10),
        ie.incomeTotalRange(storeId, monthStart, monthEnd),
        ie.expenseTotalRange(storeId, monthStart, monthEnd),
      ]);
    const stores = await repos.stores.listActive();
    return {
      stores,
      selected_store: storeId,
      selected_date: d,
      daily_income: dailyIncome,
      daily_expense: dailyExpense,
      daily_profit: dailyIncome - dailyExpense,
      monthly_income: monthlyIncome,
      monthly_expense: monthlyExpense,
      monthly_profit: monthlyIncome - monthlyExpense,
      recent_expenses: recentExpenses,
      recent_income: recentIncome,
    };
  });

  app.get("/api/admin/income-expense/categories", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.FINANCE_INCOME_EXPENSE)) == null) return;
    const categories = await repos.incomeExpense.listCategories();
    return { categories };
  });

  app.get("/api/admin/income-expense/expenses", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.FINANCE_INCOME_EXPENSE)) == null) return;
    return repos.incomeExpense.listExpensesPage({
      storeId: req.query.store_id,
      categoryId: req.query.category_id,
      dateFrom: req.query.date_from,
      dateTo: req.query.date_to,
      page: req.query.page,
      perPage: req.query.per_page,
    });
  });

  app.post("/api/admin/income-expense/expenses", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.FINANCE_INCOME_EXPENSE)) == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    if (!String(b.description ?? "").trim()) {
      return reply.code(400).send({ error: "validation_failed", field: "description" });
    }
    if (Number(b.amount) <= 0) return reply.code(400).send({ error: "validation_failed", field: "amount" });
    const r = await repos.incomeExpense.addExpense({
      ...b,
      recorded_by: req.authUser?.id,
    });
    return r;
  });

  app.get("/api/admin/income-expense/income-list", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.FINANCE_INCOME_EXPENSE)) == null) return;
    return repos.incomeExpense.listIncomePage({
      storeId: req.query.store_id,
      sourceType: req.query.source_type,
      dateFrom: req.query.date_from,
      dateTo: req.query.date_to,
      page: req.query.page,
      perPage: req.query.per_page,
    });
  });

  app.get("/api/admin/income-expense/reports", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.FINANCE_INCOME_EXPENSE)) == null) return;
    const storeId = Math.floor(Number(req.query.store_id) || 1);
    const dateFrom = String(req.query.date_from ?? "").slice(0, 10) || `${new Date().toISOString().slice(0, 7)}-01`;
    const dateTo = String(req.query.date_to ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10);
    const ie = repos.incomeExpense;
    const [totalIncome, totalExpense, incomeBySource, expenseByCategory] = await Promise.all([
      ie.incomeTotalRange(storeId, dateFrom, dateTo),
      ie.expenseTotalRange(storeId, dateFrom, dateTo),
      ie.incomeBySource(storeId, dateFrom, dateTo),
      ie.expensesByCategory(storeId, dateFrom, dateTo),
    ]);
    const stores = await repos.stores.listActive();
    return {
      stores,
      selected_store: storeId,
      date_from: dateFrom,
      date_to: dateTo,
      total_income: totalIncome,
      total_expense: totalExpense,
      net_profit: totalIncome - totalExpense,
      income_by_source: incomeBySource,
      expense_by_category: expenseByCategory,
    };
  });

  /* ---------- Attendance ---------- */
  app.get("/api/admin/attendance/today", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_ATTENDANCE)) == null) return;
    const uid = req.authUser?.id;
    const row = await repos.attendance.getTodayRecord(uid);
    return { record: row, can_check_in: !row?.check_in, can_check_out: !!(row?.check_in && !row?.check_out) };
  });

  app.get("/api/admin/attendance/month", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_ATTENDANCE)) == null) return;
    const uid = req.authUser?.id;
    const from = String(req.query.from ?? "").slice(0, 10);
    const to = String(req.query.to ?? "").slice(0, 10);
    const rows = await repos.attendance.listMonthForUser(uid, from || "2000-01-01", to || "2099-12-31");
    return { records: rows };
  });

  app.get("/api/admin/attendance/board", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_ATTENDANCE)) == null) return;
    const date = String(req.query.date ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10);
    const storeId = Math.floor(Number(req.query.store_id) || 0);
    const staff = await repos.users.listStaffForAdmin();
    const filtered =
      storeId > 0 ? staff.filter((s) => Number(s.shop_id) === storeId || !s.shop_id) : staff;
    const recs = await repos.attendance.listByDate(date, storeId);
    const rmap = new Map(recs.map((r) => [r.user_id, r]));
    const today_attendance = filtered.map((s) => {
      const a = rmap.get(s.id);
      if (a) {
        return {
          ...a,
          user_name: s.name,
          user_email: s.email,
          shop_name: s.shop_name ?? "",
          role: s.role_name ?? "staff",
        };
      }
      return {
        id: null,
        user_id: s.id,
        user_name: s.name,
        user_email: s.email,
        role: s.role_name ?? "staff",
        shop_id: s.shop_id,
        shop_name: s.shop_name ?? "",
        date,
        check_in: null,
        check_out: null,
        status: "not_checked_in",
        notes: null,
      };
    });
    const stores = await repos.stores.listActive();
    return { selected_date: date, selected_shop: storeId || null, today_attendance, stores };
  });

  app.post("/api/admin/attendance/checkin", async (req, reply) => {
    const uid = await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_ATTENDANCE);
    if (uid == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const r = await repos.attendance.checkIn(uid, b.shop_id ?? b.store_id, b.notes);
    if (!r.ok) return reply.code(400).send({ error: r.error });
    return { ok: true };
  });

  app.post("/api/admin/attendance/checkout", async (req, reply) => {
    const uid = await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_ATTENDANCE);
    if (uid == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const r = await repos.attendance.checkOut(uid, b.notes);
    if (!r.ok) return reply.code(400).send({ error: r.error });
    return { ok: true };
  });

  app.post("/api/admin/attendance/mark", async (req, reply) => {
    const uid = await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_ATTENDANCE);
    if (uid == null) return;
    if (!csrfOk(req)) return reply.code(403).send({ error: "csrf_failed" });
    const b = parseJsonBody(req.body);
    const r = await repos.attendance.upsertMark({
      userId: b.user_id,
      date: b.date,
      checkInIso: b.check_in,
      checkOutIso: b.check_out,
      status: b.status,
      notes: b.notes,
      adminUserId: uid,
    });
    if (!r.ok) return reply.code(400).send({ error: r.error });
    return { ok: true, id: r.id };
  });

  app.get("/api/admin/stub/:module", async (req, reply) => {
    if ((await requireStaffWithPermission(req, reply, rbacService, PERM.ADMIN_CATALOG)) == null) return;
    return {
      stub: true,
      module: String(req.params.module),
      message: "Not migrated to Node yet — UI placeholder only.",
    };
  });

  /** Product gallery / variant image → Cloudinary (direct upload; no Redis — same pattern as category thumbnails). */
  app.post("/api/admin/products/:productId/images/upload", async (req, reply) => {
    if (
      (await requireStaffWithAnyPermission(req, reply, rbacService, [
        PERM.CATALOG_PRODUCTS_IMAGES,
        PERM.CATALOG_PRODUCTS_UPDATE,
      ])) == null
    )
      return;
    if (!csrfOk(req)) {
      return reply.code(403).send({ error: "csrf_failed" });
    }
    if (!isCloudinaryConfigured()) {
      return reply.code(503).send({ error: "cloudinary_not_configured" });
    }
    const productId = Number(req.params.productId);
    const product = await repos.products.findById(productId);
    if (!product) {
      return reply.code(404).send({ error: "product_not_found" });
    }
    const scopeUpload = await resolveCatalogProductScope(req, rbacService, repos);
    if (!assertProductShopScope(reply, product, scopeUpload)) return;

    const variantIdUpload =
      req.query.variant_id != null && req.query.variant_id !== ""
        ? Math.floor(Number(req.query.variant_id))
        : null;
    const variantRows = Array.isArray(product.variants) ? product.variants : [];
    if (
      variantIdUpload != null &&
      (!Number.isFinite(variantIdUpload) ||
        variantIdUpload <= 0 ||
        !variantRows.some((v) => Number(v.id) === variantIdUpload))
    ) {
      return reply.code(400).send({ error: "invalid_variant_id" });
    }

    const tmpRoot = path.join(tmpdir(), "backroar-uploads");
    await mkdir(tmpRoot, { recursive: true });

    const urls = [];
    const existing = await repos.products.getImages(productId);
    const orderBase = existing.length;
    let fileIdx = 0;

    for await (const part of req.parts()) {
      if (part.type !== "file" || !part.file) continue;
      const fname = part.filename || "upload.bin";
      const dest = path.join(tmpRoot, `${randomBytes(16).toString("hex")}-${fname}`);
      await pipeline(part.file, createWriteStream(dest));

      let uploadedUrl = null;
      try {
        const cloudinary = configureCloudinary();
        const folderBatch = getImageFolder(productId);
        const publicId = `product_${productId}_${randomBytes(6).toString("hex")}`;
        const folder = `${env.CLOUDINARY_UPLOAD_PREFIX}/products/${folderBatch}`;
        const result = await cloudinary.uploader.upload(dest, {
          folder,
          public_id: publicId,
          resource_type: "image",
        });
        uploadedUrl = result.secure_url || result.url || null;
      } finally {
        try {
          await unlink(dest);
        } catch {
          /* ignore */
        }
      }
      if (!uploadedUrl) continue;

      const vidOpt = variantIdUpload != null && variantIdUpload > 0 ? variantIdUpload : null;
      const isPrimary = !vidOpt && existing.length === 0 && fileIdx === 0;
      const displayOrder = orderBase + fileIdx;

      await repos.products.addImage({
        productId,
        imagePath: uploadedUrl,
        isPrimary: vidOpt ? false : Boolean(isPrimary),
        displayOrder,
        variantId: vidOpt && vidOpt > 0 ? vidOpt : null,
      });
      if (vidOpt && vidOpt > 0) {
        await repos.products.updateVariantImagePath(productId, vidOpt, uploadedUrl);
      }
      urls.push(uploadedUrl);
      fileIdx += 1;
    }

    if (urls.length === 0) {
      return reply.code(400).send({ error: "no_files" });
    }
    return { ok: true, urls };
  });

  /** Remove one embedded gallery / variant image row; variant `image_path` is updated when needed. */
  app.delete("/api/admin/products/:productId/images/:imageId", async (req, reply) => {
    if (
      (await requireStaffWithAnyPermission(req, reply, rbacService, [
        PERM.CATALOG_PRODUCTS_IMAGES,
        PERM.CATALOG_PRODUCTS_UPDATE,
      ])) == null
    )
      return;
    if (!csrfOk(req)) {
      return reply.code(403).send({ error: "csrf_failed" });
    }
    const scopeImgDel = await resolveCatalogProductScope(req, rbacService, repos);
    const prodImgDel = await repos.products.findById(Number(req.params.productId));
    if (!prodImgDel) return reply.code(404).send({ error: "not_found" });
    if (!assertProductShopScope(reply, prodImgDel, scopeImgDel)) return;
    const r = await repos.products.removeProductImageById(req.params.productId, req.params.imageId);
    if (!r.ok) {
      if (r.error === "not_found") return reply.code(404).send({ error: "not_found" });
      if (r.error === "image_not_found") return reply.code(404).send({ error: "image_not_found" });
      if (r.error === "invalid_id") return reply.code(400).send({ error: r.error });
      return reply.code(400).send({ error: r.error || "delete_failed" });
    }
    return { ok: true, product: r.product };
  });

  /** Remove all image rows tagged to a variant and clear that variant’s `image_path`. */
  app.delete("/api/admin/products/:productId/variants/:variantId/image", async (req, reply) => {
    if (
      (await requireStaffWithAnyPermission(req, reply, rbacService, [
        PERM.CATALOG_PRODUCTS_IMAGES,
        PERM.CATALOG_PRODUCTS_UPDATE,
      ])) == null
    )
      return;
    if (!csrfOk(req)) {
      return reply.code(403).send({ error: "csrf_failed" });
    }
    const scopeVarImg = await resolveCatalogProductScope(req, rbacService, repos);
    const prodVarImg = await repos.products.findById(Number(req.params.productId));
    if (!prodVarImg) return reply.code(404).send({ error: "not_found" });
    if (!assertProductShopScope(reply, prodVarImg, scopeVarImg)) return;
    const r = await repos.products.clearVariantImage(req.params.productId, req.params.variantId);
    if (!r.ok) {
      if (r.error === "not_found") return reply.code(404).send({ error: "not_found" });
      if (r.error === "variant_not_found") return reply.code(404).send({ error: "variant_not_found" });
      if (r.error === "invalid_id") return reply.code(400).send({ error: r.error });
      return reply.code(400).send({ error: r.error || "delete_failed" });
    }
    return { ok: true, product: r.product };
  });
}
