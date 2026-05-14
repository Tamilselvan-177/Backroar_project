import bcrypt from "bcryptjs";
import { getDb } from "./mongo.js";
import { ADMIN_PERMISSION_CATALOG } from "../lib/adminPermissionCatalog.js";
import { nextSeq } from "../repositories/mongo/counter.js";

/**
 * Recommended indexes for storefront + admin parity (see docs/MONGODB_SCHEMA.md).
 */
export async function ensureAllIndexes() {
  const db = getDb();

  /* _counters uses string _id keys; MongoDB already enforces unique _id. */

  await db.collection("users").createIndex({ id: 1 }, { unique: true });
  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  try {
    await db.collection("users").createIndex({ google_sub: 1 }, { unique: true, sparse: true });
  } catch {
    /* duplicate google_sub or index mismatch */
  }
  try {
    await db.collection("users").createIndex({ reset_password_token_hash: 1 }, { sparse: true });
  } catch {
    /* index mismatch */
  }

  await db.collection("categories").createIndex({ id: 1 }, { unique: true });
  await db.collection("categories").createIndex({ slug: 1 }, { unique: true });

  await db.collection("subcategories").createIndex({ id: 1 }, { unique: true });
  await db.collection("subcategories").createIndex({ category_id: 1, slug: 1 }, { unique: true });

  await db.collection("brands").createIndex({ id: 1 }, { unique: true });
  await db.collection("brands").createIndex({ slug: 1 }, { unique: true });

  await db.collection("models").createIndex({ id: 1 }, { unique: true });
  await db.collection("models").createIndex({ brand_id: 1, slug: 1 }, { unique: true });

  await db.collection("products").createIndex({ id: 1 }, { unique: true });
  await db.collection("products").createIndex({ slug: 1 }, { unique: true });
  try {
    await db.collection("products").createIndex({ sku: 1 }, { unique: true, sparse: true });
  } catch {
    /* duplicate skus or index already exists with different options */
  }
  try {
    await db.collection("products").createIndex({ "variants.barcode": 1 }, { unique: true, sparse: true });
  } catch {
    /* duplicate barcodes in data or index mismatch */
  }
  await db.collection("products").createIndex({ category_id: 1, is_active: 1 });
  try {
    await db.collection("products").createIndex({ shop_id: 1 }, { sparse: true });
  } catch {
    /* exists */
  }

  await db.collection("cart_items").createIndex({ id: 1 }, { unique: true });
  await db.collection("cart_items").createIndex({ user_id: 1, product_id: 1, variant_id: 1 });

  await db.collection("wishlist_items").createIndex({ id: 1 }, { unique: true });
  await db.collection("wishlist_items").createIndex({ user_id: 1, product_id: 1 }, { unique: true });

  await db.collection("reviews").createIndex({ id: 1 }, { unique: true });
  await db.collection("reviews").createIndex({ user_id: 1, product_id: 1 }, { unique: true });
  await db.collection("reviews").createIndex({ product_id: 1, status: 1 });

  await db.collection("orders").createIndex({ id: 1 }, { unique: true });
  await db.collection("orders").createIndex({ order_number: 1 }, { unique: true });
  await db.collection("orders").createIndex({ user_id: 1, created_at: -1 });
  await db.collection("orders").createIndex({ "items.product_id": 1 });

  await db.collection("roles").createIndex({ id: 1 }, { unique: true });
  await db.collection("permissions").createIndex({ id: 1 }, { unique: true });
  await db.collection("user_roles").createIndex({ user_id: 1, role_id: 1 }, { unique: true });
  await db.collection("role_permissions").createIndex({ role_id: 1, permission_id: 1 }, { unique: true });

  await db.collection("stores").createIndex({ id: 1 }, { unique: true });
  try {
    await db.collection("stores").createIndex({ code: 1 }, { unique: true, sparse: true });
  } catch {
    /* duplicate codes or index mismatch */
  }

  await db.collection("counters").createIndex({ id: 1 }, { unique: true });
  await db.collection("counters").createIndex({ store_id: 1, is_active: 1 });
  try {
    await db.collection("counters").createIndex({ code: 1 }, { unique: true, sparse: true });
  } catch {
    /* duplicate codes or index mismatch */
  }

  await db.collection("pos_orders").createIndex({ id: 1 }, { unique: true });
  await db.collection("pos_orders").createIndex({ order_number: 1 }, { unique: true });
  await db.collection("pos_orders").createIndex({ store_id: 1, created_at: -1 });

  await db.collection("pos_order_items").createIndex({ id: 1 }, { unique: true });
  await db.collection("pos_order_items").createIndex({ pos_order_id: 1 });

  await db.collection("pos_payments").createIndex({ id: 1 }, { unique: true });
  await db.collection("pos_payments").createIndex({ pos_order_id: 1 });

  await db.collection("pos_holds").createIndex({ id: 1 }, { unique: true });
  await db.collection("pos_holds").createIndex({ store_id: 1, counter_id: 1, created_at: -1 });

  await db.collection("bill_sequences").createIndex({ store_id: 1, financial_year: 1 }, { unique: true });

  await db.collection("coupons").createIndex({ id: 1 }, { unique: true });
  try {
    await db.collection("coupons").createIndex({ code: 1 }, { unique: true });
  } catch {
    /* duplicate coupon codes or index mismatch */
  }

  await db.collection("store_stock").createIndex({ id: 1 }, { unique: true });
  await db.collection("store_stock").createIndex({ store_id: 1, product_id: 1 }, { unique: true });

  await db.collection("variant_store_stock").createIndex({ id: 1 }, { unique: true });
  await db.collection("variant_store_stock").createIndex({ store_id: 1, variant_id: 1 }, { unique: true });

  await db.collection("stock_transfers").createIndex({ id: 1 }, { unique: true });
  await db.collection("stock_transfers").createIndex({ source_store_id: 1, created_at: -1 });

  await db.collection("stock_transfer_items").createIndex({ id: 1 }, { unique: true });
  await db.collection("stock_transfer_items").createIndex({ transfer_id: 1 });

  await db.collection("stock_movements").createIndex({ id: 1 }, { unique: true });
  await db.collection("stock_movements").createIndex({ store_id: 1, created_at: -1 });
  await db.collection("stock_movements").createIndex({ product_id: 1, created_at: -1 });
  await db.collection("stock_movements").createIndex({ variant_id: 1, created_at: -1 });

  try {
    await db.collection("returns").createIndex({ pos_order_id: 1, created_at: -1 });
    await db.collection("returns").createIndex({ store_id: 1, created_at: -1 });
    await db.collection("returns").createIndex({ order_id: 1, order_line_index: 1 });
  } catch {
    /* returns collection or index mismatch */
  }

  try {
    await db.collection("expense_categories").createIndex({ id: 1 }, { unique: true });
    await db.collection("expenses").createIndex({ id: 1 }, { unique: true });
    await db.collection("expenses").createIndex({ store_id: 1, expense_date: -1 });
    await db.collection("incomes").createIndex({ id: 1 }, { unique: true });
    await db.collection("incomes").createIndex({ store_id: 1, income_date: -1 });
    await db.collection("attendance").createIndex({ id: 1 }, { unique: true });
    await db.collection("attendance").createIndex({ user_id: 1, date: 1 }, { unique: true });
  } catch {
    /* finance / attendance collections */
  }

  /* First-time POS: one demo store + counter (PIN 1234) when collections are empty. */
  if ((await db.collection("stores").countDocuments()) === 0) {
    const id = await nextSeq("stores");
    await db.collection("stores").insertOne({
      id,
      code: "MAIN",
      name: "Main Store",
      address: "",
      city: "",
      state: "",
      pincode: "",
      gstin: "",
      is_active: 1,
      created_at: new Date(),
    });
  }
  for (const row of ADMIN_PERMISSION_CATALOG) {
    const exists = await db.collection("permissions").findOne({ key_name: row.key });
    if (!exists) {
      const pid = await nextSeq("permissions");
      await db.collection("permissions").insertOne({
        id: pid,
        key_name: row.key,
        name: row.name,
        description: row.description ?? "",
      });
    }
  }

  if ((await db.collection("roles").countDocuments()) === 0) {
    const now = new Date();
    const adminId = await nextSeq("roles");
    await db.collection("roles").insertOne({
      id: adminId,
      name: "Administrator",
      description: "System role — full access in app; link permissions for RBAC parity.",
      is_system_role: 1,
      created_at: now,
      updated_at: now,
    });
    const staffId = await nextSeq("roles");
    await db.collection("roles").insertOne({
      id: staffId,
      name: "Staff",
      description: "Default staff role — grant POS and finance keys as needed.",
      is_system_role: 1,
      created_at: now,
      updated_at: now,
    });
  }

  try {
    const staffRole = await db.collection("roles").findOne({ name: "Staff" });
    if (staffRole) {
      const rpCount = await db.collection("role_permissions").countDocuments({ role_id: staffRole.id });
      if (rpCount === 0) {
        const permRows = await db.collection("permissions").find({}).project({ id: 1 }).toArray();
        if (permRows.length > 0) {
          await db.collection("role_permissions").insertMany(
            permRows.map((row) => ({ role_id: staffRole.id, permission_id: row.id }))
          );
        }
      }
    }
  } catch {
    /* ignore */
  }

  if ((await db.collection("counters").countDocuments()) === 0) {
    const firstStore = await db.collection("stores").findOne({}, { sort: { id: 1 } });
    if (firstStore) {
      const cid = await nextSeq("counters");
      await db.collection("counters").insertOne({
        id: cid,
        store_id: firstStore.id,
        code: "C1",
        name: "Counter 1",
        is_active: 1,
        pin_hash: bcrypt.hashSync("1234", 10),
        created_at: new Date(),
      });
    }
  }
}
