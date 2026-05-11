import { getDb } from "../../db/mongo.js";
import { nextSeq } from "./counter.js";

export class MongoBrandRepository {
  async getActive() {
    return getDb()
      .collection("brands")
      .find({ is_active: { $in: [1, true] } })
      .sort({ display_order: 1, name: 1 })
      .toArray();
  }

  async listAll() {
    return getDb().collection("brands").find({}).sort({ display_order: 1, name: 1 }).toArray();
  }

  async findById(id) {
    return getDb().collection("brands").findOne({ id: Number(id) });
  }

  async slugTaken(slug, excludeId) {
    const q = { slug: String(slug) };
    if (excludeId != null) q.id = { $ne: Number(excludeId) };
    return (await getDb().collection("brands").countDocuments(q)) > 0;
  }

  async countProducts(brandId) {
    return getDb().collection("products").countDocuments({ brand_id: Number(brandId) });
  }

  async create(doc) {
    const id = await nextSeq("brands");
    const now = new Date();
    const row = {
      id,
      name: doc.name,
      slug: doc.slug,
      logo_path: doc.logo_path ?? null,
      is_active: doc.is_active ? 1 : 0,
      display_order: Number(doc.display_order) || 0,
      created_at: now,
    };
    await getDb().collection("brands").insertOne(row);
    return id;
  }

  async update(id, patch) {
    await getDb().collection("brands").updateOne({ id: Number(id) }, { $set: patch });
  }

  async delete(id) {
    await getDb().collection("brands").deleteOne({ id: Number(id) });
  }
}
