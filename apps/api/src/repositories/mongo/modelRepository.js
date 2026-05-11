import { getDb } from "../../db/mongo.js";
import { nextSeq } from "./counter.js";

export class MongoModelRepository {
  async listByBrand(brandId) {
    if (!brandId) return [];
    return getDb()
      .collection("models")
      .find({ brand_id: Number(brandId) })
      .sort({ name: 1 })
      .toArray();
  }

  async listAll() {
    return getDb().collection("models").find({}).sort({ brand_id: 1, name: 1 }).toArray();
  }

  async findById(id) {
    return getDb().collection("models").findOne({ id: Number(id) });
  }

  async slugTakenForBrand(brandId, slug, excludeId) {
    const q = { brand_id: Number(brandId), slug: String(slug) };
    if (excludeId != null) q.id = { $ne: Number(excludeId) };
    return (await getDb().collection("models").countDocuments(q)) > 0;
  }

  async countProducts(modelId) {
    return getDb().collection("products").countDocuments({ model_id: Number(modelId) });
  }

  async create(doc) {
    const id = await nextSeq("models");
    const now = new Date();
    const row = {
      id,
      brand_id: Number(doc.brand_id),
      name: doc.name,
      slug: doc.slug,
      model_number: doc.model_number ?? null,
      is_active: doc.is_active ? 1 : 0,
      created_at: now,
    };
    await getDb().collection("models").insertOne(row);
    return id;
  }

  async update(id, patch) {
    await getDb().collection("models").updateOne({ id: Number(id) }, { $set: patch });
  }

  async delete(id) {
    await getDb().collection("models").deleteOne({ id: Number(id) });
  }
}
