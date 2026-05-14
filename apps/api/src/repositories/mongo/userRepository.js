import bcrypt from "bcryptjs";
import { getDb } from "../../db/mongo.js";
import { nextSeq } from "./counter.js";

async function normalizeStaffCatalogFields(db, primaryShopId, catalog_multi_shop_filter, catalog_extra_shop_ids) {
  const sid =
    primaryShopId != null && primaryShopId !== "" && Number(primaryShopId) > 0 ? Number(primaryShopId) : null;
  const multiRequested =
    catalog_multi_shop_filter === true ||
    catalog_multi_shop_filter === 1 ||
    catalog_multi_shop_filter === "1";
  if (multiRequested && (sid == null || !Number.isFinite(sid))) {
    return { ok: false, error: "validation_failed", field: "catalog_multi_shop_filter" };
  }
  const rawExtras = catalog_extra_shop_ids;
  const arr = Array.isArray(rawExtras) ? rawExtras : [];
  let extras = [...new Set(arr.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
  extras = extras.filter((id) => id !== sid);
  const catalog_multi = multiRequested ? 1 : 0;
  const catalog_extras = multiRequested ? extras : [];
  for (const id of catalog_extras) {
    const store = await db.collection("stores").findOne({ id });
    if (!store) return { ok: false, error: "invalid_catalog_shop", field: "catalog_extra_shop_ids" };
  }
  return { ok: true, catalog_multi_shop_filter: catalog_multi, catalog_extra_shop_ids: catalog_extras };
}

export class MongoUserRepository {
  async findByEmail(email) {
    const u = await getDb().collection("users").findOne({ email: String(email ?? "").trim() });
    return u ?? null;
  }

  async findByGoogleSub(googleSub) {
    const sub = String(googleSub ?? "").trim();
    if (!sub) return null;
    const u = await getDb().collection("users").findOne({ google_sub: sub });
    return u ?? null;
  }

  async findById(id) {
    const u = await getDb()
      .collection("users")
      .findOne(
        { id: Number(id) },
        { projection: { password: 0 } }
      );
    return u ?? null;
  }

  async emailExists(email) {
    const u = await this.findByEmail(email);
    return u !== null;
  }

  async createUser(input) {
    const role = input.role ?? "customer";
    const id = await nextSeq("users");
    const now = new Date();
    await getDb().collection("users").insertOne({
      id,
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      password: input.passwordHash,
      google_sub: input.googleSub ?? null,
      role,
      is_active: 1,
      shop_id: null,
      preferred_printer: null,
      created_at: now,
      updated_at: now,
    });
    return id;
  }

  async linkGoogleIdentity(userId, googleSub) {
    const uid = Number(userId);
    const sub = String(googleSub ?? "").trim();
    if (!uid || !sub) return;
    await getDb().collection("users").updateOne(
      { id: uid },
      {
        $set: {
          google_sub: sub,
          updated_at: new Date(),
        },
      }
    );
  }

  async setPasswordResetToken(userId, tokenHash, expiresAt) {
    await getDb().collection("users").updateOne(
      { id: Number(userId) },
      {
        $set: {
          reset_password_token_hash: String(tokenHash),
          reset_password_expires_at: expiresAt,
          updated_at: new Date(),
        },
      }
    );
  }

  async clearPasswordResetToken(userId) {
    await getDb().collection("users").updateOne(
      { id: Number(userId) },
      {
        $set: {
          reset_password_token_hash: null,
          reset_password_expires_at: null,
          updated_at: new Date(),
        },
      }
    );
  }

  async findByPasswordResetTokenHash(tokenHash) {
    const hash = String(tokenHash ?? "").trim();
    if (!hash) return null;
    const now = new Date();
    const u = await getDb().collection("users").findOne({
      reset_password_token_hash: hash,
      reset_password_expires_at: { $gt: now },
      is_active: { $in: [1, true] },
    });
    return u ?? null;
  }

  async updatePasswordHash(userId, passwordHash) {
    await getDb().collection("users").updateOne(
      { id: Number(userId) },
      {
        $set: {
          password: String(passwordHash),
          updated_at: new Date(),
        },
      }
    );
  }

  async updateLastLogin(userId) {
    await getDb()
      .collection("users")
      .updateOne({ id: Number(userId) }, { $set: { updated_at: new Date() } });
  }

  async getPrinterPreference(userId) {
    const u = await getDb()
      .collection("users")
      .findOne({ id: Number(userId) }, { projection: { preferred_printer: 1 } });
    return u?.preferred_printer ?? null;
  }

  async savePrinterPreference(userId, printerName) {
    await getDb().collection("users").updateOne(
      { id: Number(userId) },
      {
        $set: {
          preferred_printer: String(printerName ?? "").trim() || null,
          updated_at: new Date(),
        },
      }
    );
  }

  /** Active staff for POS billing staff dropdown. */
  async listActiveStaff() {
    return getDb()
      .collection("users")
      .find({ role: "staff", is_active: { $in: [1, true] } })
      .project({ password: 0 })
      .sort({ name: 1 })
      .toArray();
  }

  /** Admin staff list. */
  async listStaffForAdmin() {
    const db = getDb();
    const users = await db
      .collection("users")
      .find({ role: "staff" })
      .project({ password: 0 })
      .sort({ name: 1 })
      .toArray();
    const out = [];
    for (const u of users) {
      const ur = await db.collection("user_roles").findOne({ user_id: u.id });
      let shop_name = null;
      if (u.shop_id != null) {
        const s = await db.collection("stores").findOne({ id: Number(u.shop_id) }, { projection: { name: 1 } });
        shop_name = s?.name ?? null;
      }
      let role_name = null;
      if (ur?.role_id != null) {
        const r = await db.collection("roles").findOne({ id: Number(ur.role_id) }, { projection: { name: 1 } });
        role_name = r?.name ?? null;
      }
      out.push({ ...u, role_id: ur?.role_id ?? null, shop_name, role_name });
    }
    return out;
  }

  async findStaffForAdminDetail(id) {
    const u = await this.findById(id);
    if (!u || u.role !== "staff") return null;
    const ur = await getDb().collection("user_roles").findOne({ user_id: u.id });
    return { ...u, role_id: ur?.role_id ?? null };
  }

  async createStaff({ name, email, phone, password, shop_id, role_id, catalog_multi_shop_filter, catalog_extra_shop_ids }) {
    const db = getDb();
    const nameT = String(name ?? "").trim();
    const emailN = String(email ?? "").trim().toLowerCase();
    const pwd = String(password ?? "");
    if (!nameT || !emailN) return { ok: false, error: "validation_failed", field: "name" };
    if (pwd.length < 6) return { ok: false, error: "password_short" };
    const dup = await db.collection("users").findOne({
      email: { $regex: new RegExp(`^${emailN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    });
    if (dup) return { ok: false, error: "email_taken" };
    const rid = Number(role_id);
    if (!Number.isFinite(rid) || rid <= 0) return { ok: false, error: "invalid_role" };
    const roleRow = await db.collection("roles").findOne({ id: rid });
    if (!roleRow) return { ok: false, error: "invalid_role" };
    let sid = shop_id != null && shop_id !== "" ? Number(shop_id) : null;
    if (sid != null && (!Number.isFinite(sid) || sid <= 0)) sid = null;
    if (sid != null) {
      const store = await db.collection("stores").findOne({ id: sid });
      if (!store) return { ok: false, error: "invalid_store" };
    }
    const catNorm = await normalizeStaffCatalogFields(db, sid, catalog_multi_shop_filter, catalog_extra_shop_ids);
    if (!catNorm.ok) return catNorm;
    const uid = await nextSeq("users");
    const now = new Date();
    const hash = bcrypt.hashSync(pwd, 10);
    await db.collection("users").insertOne({
      id: uid,
      name: nameT,
      email: emailN,
      phone: phone != null && String(phone).trim() ? String(phone).trim() : null,
      password: hash,
      role: "staff",
      is_active: 1,
      shop_id: sid,
      catalog_multi_shop_filter: catNorm.catalog_multi_shop_filter,
      catalog_extra_shop_ids: catNorm.catalog_extra_shop_ids,
      preferred_printer: null,
      created_at: now,
      updated_at: now,
    });
    await db.collection("user_roles").deleteMany({ user_id: uid });
    await db.collection("user_roles").insertOne({ user_id: uid, role_id: rid, shop_id: sid });
    return { ok: true, id: uid };
  }

  async updateStaff(id, body) {
    const db = getDb();
    const uid = Number(id);
    const u = await db.collection("users").findOne({ id: uid, role: "staff" });
    if (!u) return { ok: false, error: "not_found" };
    const set = {};
    if (body.name != null) set.name = String(body.name).trim();
    if (body.phone !== undefined) {
      set.phone = body.phone != null && String(body.phone).trim() ? String(body.phone).trim() : null;
    }
    if (body.shop_id !== undefined) {
      let sid = body.shop_id != null && body.shop_id !== "" ? Number(body.shop_id) : null;
      if (sid != null && (!Number.isFinite(sid) || sid <= 0)) sid = null;
      if (sid != null) {
        const store = await db.collection("stores").findOne({ id: sid });
        if (!store) return { ok: false, error: "invalid_store" };
      }
      set.shop_id = sid;
    }
    if (body.is_active !== undefined) {
      set.is_active = body.is_active === false || body.is_active === 0 ? 0 : 1;
    }
    if (Object.keys(set).length > 0) {
      set.updated_at = new Date();
      await db.collection("users").updateOne({ id: uid }, { $set: set });
    }
    const pwd = body.password != null ? String(body.password) : "";
    if (pwd !== "") {
      if (pwd.length < 6) return { ok: false, error: "password_short" };
      await db.collection("users").updateOne(
        { id: uid },
        { $set: { password: bcrypt.hashSync(pwd, 10), updated_at: new Date() } }
      );
    }
    let fresh = await db.collection("users").findOne({ id: uid });
    if (!fresh.shop_id) {
      await db.collection("users").updateOne(
        { id: uid },
        {
          $set: {
            catalog_multi_shop_filter: 0,
            catalog_extra_shop_ids: [],
            updated_at: new Date(),
          },
        }
      );
      fresh = await db.collection("users").findOne({ id: uid });
    } else if (body.catalog_multi_shop_filter !== undefined || body.catalog_extra_shop_ids !== undefined) {
      const catNorm = await normalizeStaffCatalogFields(
        db,
        fresh?.shop_id ?? null,
        body.catalog_multi_shop_filter ?? fresh?.catalog_multi_shop_filter,
        body.catalog_extra_shop_ids !== undefined ? body.catalog_extra_shop_ids : fresh?.catalog_extra_shop_ids
      );
      if (!catNorm.ok) return catNorm;
      await db.collection("users").updateOne(
        { id: uid },
        {
          $set: {
            catalog_multi_shop_filter: catNorm.catalog_multi_shop_filter,
            catalog_extra_shop_ids: catNorm.catalog_extra_shop_ids,
            updated_at: new Date(),
          },
        }
      );
      fresh = await db.collection("users").findOne({ id: uid });
    }
    if (body.role_id != null && body.role_id !== "") {
      const rid = Number(body.role_id);
      if (!Number.isFinite(rid) || rid <= 0) return { ok: false, error: "invalid_role" };
      const roleRow = await db.collection("roles").findOne({ id: rid });
      if (!roleRow) return { ok: false, error: "invalid_role" };
      const shopForUr = fresh?.shop_id ?? null;
      await db.collection("user_roles").deleteMany({ user_id: uid });
      await db.collection("user_roles").insertOne({ user_id: uid, role_id: rid, shop_id: shopForUr });
    } else if (body.shop_id !== undefined) {
      await db.collection("user_roles").updateMany({ user_id: uid }, { $set: { shop_id: fresh?.shop_id ?? null } });
    }
    return { ok: true };
  }

  async getStaffDeleteBlockers(userId) {
    const uid = Number(userId);
    const db = getDb();
    const [pos_orders, pos_holds, reviews, orders, cart_items, wishlist_items] = await Promise.all([
      db.collection("pos_orders").countDocuments({ staff_id: uid }),
      db.collection("pos_holds").countDocuments({ staff_id: uid }),
      db.collection("reviews").countDocuments({ user_id: uid }),
      db.collection("orders").countDocuments({ user_id: uid }),
      db.collection("cart_items").countDocuments({ user_id: uid }),
      db.collection("wishlist_items").countDocuments({ user_id: uid }),
    ]);
    return { pos_orders, pos_holds, reviews, orders, cart_items, wishlist_items };
  }

  async deleteStaff(userId) {
    const uid = Number(userId);
    const db = getDb();
    const u = await db.collection("users").findOne({ id: uid, role: "staff" });
    if (!u) return { ok: false, error: "not_found" };
    const blockers = await this.getStaffDeleteBlockers(uid);
    const sum =
      blockers.pos_orders +
      blockers.pos_holds +
      blockers.reviews +
      blockers.orders +
      blockers.cart_items +
      blockers.wishlist_items;
    if (sum > 0) return { ok: false, error: "staff_in_use", blockers };
    await db.collection("user_roles").deleteMany({ user_id: uid });
    await db.collection("users").deleteOne({ id: uid });
    return { ok: true };
  }

  async listShippingAddresses(userId) {
    const u = await getDb()
      .collection("users")
      .findOne({ id: Number(userId) }, { projection: { shipping_addresses: 1 } });
    const list = Array.isArray(u?.shipping_addresses) ? u.shipping_addresses : [];
    return [...list].sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
  }

  normalizeShippingAddress(body) {
    const full_name = String(body?.full_name ?? "").trim();
    const phone = String(body?.phone ?? "").trim();
    const address_line1 = String(body?.address_line1 ?? "").trim();
    const address_line2 = String(body?.address_line2 ?? "").trim();
    const city = String(body?.city ?? "").trim();
    const state = String(body?.state ?? "").trim();
    const pincode = String(body?.pincode ?? "").trim();
    if (!full_name || !phone || !address_line1 || !city || !state || !pincode) {
      return { ok: false, error: "validation_failed" };
    }
    return {
      ok: true,
      value: {
        full_name,
        phone,
        address_line1,
        address_line2: address_line2 || "",
        city,
        state,
        pincode,
      },
    };
  }

  async addShippingAddress(userId, body) {
    const uid = Number(userId);
    const normalized = this.normalizeShippingAddress(body);
    if (!normalized.ok) return normalized;
    const id = await nextSeq("user_shipping_addresses");
    const now = new Date();
    const row = {
      id,
      ...normalized.value,
      created_at: now,
      updated_at: now,
    };
    await getDb().collection("users").updateOne(
      { id: uid },
      { $push: { shipping_addresses: row }, $set: { updated_at: new Date() } }
    );
    return { ok: true, address: row };
  }

  async updateShippingAddress(userId, addressId, body) {
    const uid = Number(userId);
    const aid = Number(addressId);
    if (!Number.isFinite(aid) || aid <= 0) return { ok: false, error: "invalid_id" };
    const normalized = this.normalizeShippingAddress(body);
    if (!normalized.ok) return normalized;
    const col = getDb().collection("users");
    const existing = await col.findOne({ id: uid, "shipping_addresses.id": aid }, { projection: { shipping_addresses: 1 } });
    if (!existing) return { ok: false, error: "not_found" };

    const now = new Date();
    await col.updateOne(
      { id: uid },
      {
        $set: {
          "shipping_addresses.$[addr].full_name": normalized.value.full_name,
          "shipping_addresses.$[addr].phone": normalized.value.phone,
          "shipping_addresses.$[addr].address_line1": normalized.value.address_line1,
          "shipping_addresses.$[addr].address_line2": normalized.value.address_line2,
          "shipping_addresses.$[addr].city": normalized.value.city,
          "shipping_addresses.$[addr].state": normalized.value.state,
          "shipping_addresses.$[addr].pincode": normalized.value.pincode,
          "shipping_addresses.$[addr].updated_at": now,
          updated_at: now,
        },
      },
      { arrayFilters: [{ "addr.id": aid }] }
    );

    const list = await this.listShippingAddresses(uid);
    const address = list.find((row) => Number(row.id) === aid) ?? null;
    if (!address) return { ok: false, error: "not_found" };
    return { ok: true, address };
  }

  async deleteShippingAddress(userId, addressId) {
    const uid = Number(userId);
    const aid = Number(addressId);
    if (!Number.isFinite(aid) || aid <= 0) return { ok: false, error: "invalid_id" };
    const r = await getDb().collection("users").updateOne(
      { id: uid },
      { $pull: { shipping_addresses: { id: aid } }, $set: { updated_at: new Date() } }
    );
    return { ok: r.modifiedCount > 0 };
  }
}
