import { getDb } from "../../db/mongo.js";
import { nextSeq } from "./counter.js";

export class MongoCategoryRepository {
  async getActive() {
    return getDb()
      .collection("categories")
      .find({ is_active: { $in: [1, true] } })
      .sort({ display_order: 1, name: 1 })
      .toArray();
  }

  async listAll() {
    return getDb()
      .collection("categories")
      .find({})
      .sort({ display_order: 1, name: 1 })
      .toArray();
  }

  async findBySlug(slug) {
    const c = await getDb().collection("categories").findOne({ slug: String(slug) });
    return c ?? null;
  }

  async findById(id) {
    const c = await getDb().collection("categories").findOne({ id: Number(id) });
    return c ?? null;
  }

  async slugTaken(slug, excludeId) {
    const q = { slug: String(slug) };
    if (excludeId != null) q.id = { $ne: Number(excludeId) };
    const n = await getDb().collection("categories").countDocuments(q);
    return n > 0;
  }

  async countProducts(categoryId) {
    return getDb().collection("products").countDocuments({ category_id: Number(categoryId) });
  }

  async create(doc) {
    const id = await nextSeq("categories");
    const now = new Date();
    const row = {
      id,
      name: doc.name,
      slug: doc.slug,
      description: doc.description ?? null,
      image_path: doc.image_path ?? null,
      is_active: doc.is_active ? 1 : 0,
      display_order: Number(doc.display_order) || 0,
      created_at: now,
      updated_at: now,
    };
    await getDb().collection("categories").insertOne(row);
    return id;
  }

  async update(id, patch) {
    const now = new Date();
    await getDb()
      .collection("categories")
      .updateOne(
        { id: Number(id) },
        {
          $set: {
            ...patch,
            updated_at: now,
          },
        }
      );
  }

  async delete(id) {
    await getDb().collection("categories").deleteOne({ id: Number(id) });
  }
}
