import { getDb } from "../../db/mongo.js";
import { nextSeq } from "./counter.js";
import { variantMrp, variantSalePrice } from "../../lib/productPricing.js";

function primaryImagePath(product) {
  const images = product?.images || [];
  const primary = images.find((i) => i.is_primary === 1 || i.is_primary === true);
  return primary?.image_path ?? images[0]?.image_path ?? product?.image_path ?? null;
}

export class MongoCartRepository {
  async cartHasVariantId() {
    const one = await getDb().collection("cart_items").findOne({ variant_id: { $ne: null } });
    return one !== null;
  }

  async hasProductVariantsTable() {
    const one = await getDb().collection("products").findOne({ variants: { $exists: true, $ne: [] } });
    return one !== null;
  }

  async getCartItems(userId) {
    const uid = Number(userId);
    const db = getDb();
    const items = await db
      .collection("cart_items")
      .find({ user_id: uid })
      .sort({ created_at: -1 })
      .toArray();
    if (!items.length) return [];
    const pids = [...new Set(items.map((i) => Number(i.product_id)))];
    const products = await db
      .collection("products")
      .find({ id: { $in: pids } })
      .toArray();
    const pmap = new Map(products.map((p) => [p.id, p]));

    const cartHasVariant = await this.cartHasVariantId();
    const hasVariantsTable = await this.hasProductVariantsTable();

    return items.map((ci) => {
      const p = pmap.get(Number(ci.product_id));
      let variantName = null;
      let variantImagePath = null;
      let linePrice = p?.price ?? null;
      let lineSale = p?.sale_price ?? null;
      if (cartHasVariant && hasVariantsTable && ci.variant_id != null && p?.variants?.length) {
        const pv = p.variants.find((v) => v.id === Number(ci.variant_id));
        variantName = pv?.variant_name ?? null;
        variantImagePath = pv?.image_path ?? null;
        if (pv && String(pv.variant_name ?? "").trim()) {
          linePrice = variantMrp(pv, p);
          const s = variantSalePrice(pv, p);
          lineSale = s != null ? s : null;
        }
      }
      return {
        ...ci,
        product_id: p?.id ?? ci.product_id,
        product_name: p?.name ?? null,
        product_slug: p?.slug ?? null,
        price: linePrice,
        sale_price: lineSale,
        stock_quantity: p?.stock_quantity ?? null,
        is_active: p?.is_active ?? null,
        image_path: primaryImagePath(p),
        brand_name: p?.brand_name ?? null,
        model_name: p?.model_name ?? null,
        variant_name: variantName,
        variant_image_path: variantImagePath,
      };
    });
  }

  async getCartCount(userId) {
    const rows = await getDb()
      .collection("cart_items")
      .aggregate([
        { $match: { user_id: Number(userId) } },
        { $group: { _id: null, total: { $sum: "$quantity" } } },
      ])
      .toArray();
    return Number(rows[0]?.total ?? 0);
  }

  async addItem({ userId, productId, quantity = 1, variantId = null }) {
    const uid = Number(userId);
    const pid = Number(productId);
    const vid = variantId == null || variantId === "" ? null : Number(variantId);
    const col = getDb().collection("cart_items");
    const q = Number(quantity) > 0 ? Number(quantity) : 1;
    const existing = await col.findOne({
      user_id: uid,
      product_id: pid,
      variant_id: vid,
    });
    if (existing) {
      await col.updateOne({ id: existing.id }, { $inc: { quantity: q } });
      return existing.id;
    }
    const id = await nextSeq("cart_items");
    await col.insertOne({
      id,
      user_id: uid,
      product_id: pid,
      quantity: q,
      variant_id: vid,
      created_at: new Date(),
    });
    return id;
  }

  async updateQuantity({ userId, cartItemId, quantity }) {
    const uid = Number(userId);
    const id = Number(cartItemId);
    const q = Number(quantity);
    if (q < 1) {
      await getDb().collection("cart_items").deleteOne({ id, user_id: uid });
      return { removed: true };
    }
    const r = await getDb()
      .collection("cart_items")
      .updateOne({ id, user_id: uid }, { $set: { quantity: q } });
    return { modified: r.modifiedCount > 0 };
  }

  async removeItem({ userId, cartItemId }) {
    const r = await getDb()
      .collection("cart_items")
      .deleteOne({ id: Number(cartItemId), user_id: Number(userId) });
    return r.deletedCount > 0;
  }

  async clearForUser(userId) {
    await getDb().collection("cart_items").deleteMany({ user_id: Number(userId) });
  }
}
