import { getDb } from "../../db/mongo.js";
import { nextSeq } from "./counter.js";
import { pickImagePath } from "./productRepository.js";

export class MongoWishlistRepository {
  async exists(userId, productId) {
    const row = await getDb()
      .collection("wishlist_items")
      .findOne({ user_id: Number(userId), product_id: Number(productId) });
    return !!row;
  }

  async add(userId, productId, notes = null) {
    const db = getDb();
    const col = db.collection("wishlist_items");
    const uid = Number(userId);
    const pid = Number(productId);
    const product = await db.collection("products").findOne({ id: pid, is_active: { $in: [1, true] } });
    if (!product) {
      throw new Error("product_not_found");
    }
    const existing = await col.findOne({ user_id: uid, product_id: pid });
    if (existing) return { already: true, id: existing.id };
    const id = await nextSeq("wishlist_items");
    const now = new Date();
    await col.insertOne({
      id,
      user_id: uid,
      product_id: pid,
      notes: notes != null ? String(notes) : null,
      created_at: now,
    });
    return { already: false, id };
  }

  async remove(userId, productId) {
    await getDb()
      .collection("wishlist_items")
      .deleteOne({ user_id: Number(userId), product_id: Number(productId) });
  }

  async listForUser(userId) {
    const db = getDb();
    const uid = Number(userId);
    const rows = await db.collection("wishlist_items").find({ user_id: uid }).sort({ created_at: -1 }).toArray();
    if (!rows.length) return [];
    const pids = [...new Set(rows.map((r) => r.product_id).filter(Boolean))];
    const products = await db.collection("products").find({ id: { $in: pids } }).toArray();
    const pmap = new Map(products.map((p) => [p.id, p]));
    return rows.map((w) => {
      const p = pmap.get(w.product_id);
      if (!p) {
        return {
          id: w.id,
          user_id: w.user_id,
          product_id: w.product_id,
          notes: w.notes ?? null,
          created_at: w.created_at,
          name: "(removed product)",
          slug: "",
          price: 0,
          sale_price: null,
          image_path: null,
          missing: true,
        };
      }
      return {
        id: w.id,
        user_id: w.user_id,
        product_id: w.product_id,
        notes: w.notes ?? null,
        created_at: w.created_at,
        name: p.name,
        slug: p.slug,
        price: p.price,
        sale_price: p.sale_price,
        image_path: pickImagePath(p),
        missing: false,
      };
    });
  }
}
