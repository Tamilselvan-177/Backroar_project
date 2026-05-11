import { getDb } from "../../db/mongo.js";
import { nextSeq } from "./counter.js";

export class MongoSubcategoryRepository {
  async listFiltered({ q, categoryId, active, page = 1, limit = 24 }) {
    const db = getDb();
    const col = db.collection("subcategories");
    const filter = {};
    if (q && String(q).trim()) {
      const re = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: re }, { slug: re }];
    }
    if (categoryId) filter.category_id = Number(categoryId);
    if (active === "0" || active === "1") filter.is_active = active === "1" ? { $in: [1, true] } : { $in: [0, false] };

    const lim = Math.min(100, Math.max(1, Number(limit) || 24));
    const pg = Math.max(1, Number(page) || 1);
    const skip = (pg - 1) * lim;

    const [rows, total] = await Promise.all([
      col
        .aggregate([
          { $match: filter },
          { $sort: { display_order: 1, created_at: -1 } },
          { $skip: skip },
          { $limit: lim },
          {
            $lookup: {
              from: "categories",
              localField: "category_id",
              foreignField: "id",
              as: "cat",
            },
          },
        ])
        .toArray(),
      col.countDocuments(filter),
    ]);

    const items = rows.map((r) => {
      const c = r.cat?.[0];
      const { cat: _c, ...rest } = r;
      return { ...rest, category_name: c?.name ?? null };
    });
    return { items, total, page: pg, limit: lim, total_pages: Math.max(1, Math.ceil(total / lim)) };
  }

  async findById(id) {
    return getDb().collection("subcategories").findOne({ id: Number(id) });
  }

  async slugTaken(categoryId, slug, excludeId) {
    const q = { category_id: Number(categoryId), slug: String(slug) };
    if (excludeId != null) q.id = { $ne: Number(excludeId) };
    return (await getDb().collection("subcategories").countDocuments(q)) > 0;
  }

  async countProducts(subcategoryId) {
    return getDb().collection("products").countDocuments({ subcategory_id: Number(subcategoryId) });
  }

  async create(doc) {
    const id = await nextSeq("subcategories");
    const now = new Date();
    const row = {
      id,
      category_id: Number(doc.category_id),
      name: doc.name,
      slug: doc.slug,
      description: doc.description ?? null,
      is_active: doc.is_active ? 1 : 0,
      display_order: Number(doc.display_order) || 0,
      created_at: now,
    };
    await getDb().collection("subcategories").insertOne(row);
    return id;
  }

  async update(id, patch) {
    await getDb().collection("subcategories").updateOne({ id: Number(id) }, { $set: patch });
  }

  async delete(id) {
    await getDb().collection("subcategories").deleteOne({ id: Number(id) });
  }
}
