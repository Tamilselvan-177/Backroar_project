import { getDb } from "../../db/mongo.js";
import { nextSeq } from "./counter.js";
import { slugify } from "../../lib/slug.js";
import { env } from "../../config/env.js";
import {
  syncProductAggregatePricing,
  unitPriceForLabel,
  variantEffectiveSelling,
  variantGstPercent,
  variantMaxDiscountPercent,
} from "../../lib/productPricing.js";

const ALLOWED_SORTS = new Set([
  "p.created_at DESC",
  "p.price ASC",
  "p.price DESC",
  "p.name ASC",
]);

export function normalizeProductListSort(sort) {
  const s = String(sort ?? "p.created_at DESC").trim();
  return ALLOWED_SORTS.has(s) ? s : "p.created_at DESC";
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Legacy rows may store `variants`/`images` as non-arrays; avoid `.filter`/`.find` throwing during POS/search. */
function asArray(v) {
  return Array.isArray(v) ? v : [];
}

/** Maps public list `sort` query tokens (e.g. p.price ASC) to a Mongo sort spec. */
export function mongoSortFromListParam(sort) {
  const s = String(sort ?? "p.created_at DESC").trim();
  if (!ALLOWED_SORTS.has(s)) return { created_at: -1 };
  if (s === "p.created_at DESC") return { created_at: -1 };
  if (s === "p.price ASC") return { price: 1 };
  if (s === "p.price DESC") return { price: -1 };
  if (s === "p.name ASC") return { name: 1 };
  return { created_at: -1 };
}

function parsePositiveInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function parsePriceBound(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function toNumOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sanitizeSku(s) {
  const t = String(s ?? "").trim();
  return t || null;
}

/** GST slab display / POS (0–28%). */
function parseGstPercent(v) {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(28, n);
}

/** POS max discount cap; empty means unset (POS falls back per line). */
function parseOptionalDiscountPct(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(100, n);
}

function parseHsnCode(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim().slice(0, 20);
  return s || null;
}

function parseNoStoreStock(v) {
  return v === true || v === 1 || v === "1" ? 1 : 0;
}

/** Optional FK to `stores.id`; null = unassigned / legacy global catalog row. */
async function resolveProductShopIdOrError(db, raw) {
  if (raw === undefined) return { shop_id: undefined };
  if (raw === null || raw === "") return { shop_id: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return { error: "validation_failed", field: "shop_id" };
  const st = await db.collection("stores").findOne({ id: n });
  if (!st) return { error: "invalid_shop", field: "shop_id" };
  return { shop_id: n };
}

function parseTriStateBool(v) {
  if (v === undefined || v === null || v === "" || v === "all") return null;
  if (v === true || v === 1 || v === "1" || v === "active" || v === "yes") return true;
  if (v === false || v === 0 || v === "0" || v === "inactive" || v === "no") return false;
  return null;
}

function pickVariantMetaString(raw, prevRow, key, maxLen) {
  if (raw != null && Object.prototype.hasOwnProperty.call(raw, key)) {
    const s = String(raw[key] ?? "").trim();
    return s ? s.slice(0, maxLen) : null;
  }
  const p = prevRow?.[key];
  if (p != null && String(p).trim()) return String(p).trim().slice(0, maxLen);
  return null;
}

/** Variant scan code / label value (Code 128 payload). */
export function sanitizeVariantBarcode(s) {
  const t = String(s ?? "").trim().slice(0, 64);
  return t || null;
}

function duplicateVariantBarcodeWithin(variants) {
  const seen = new Set();
  for (const v of variants) {
    const b = sanitizeVariantBarcode(v.barcode);
    if (!b) continue;
    if (seen.has(b)) return b;
    seen.add(b);
  }
  return null;
}

function pickVariantPriceMoney(raw, prevRow, fb, prod) {
  const fallbackRaw = fb?.price ?? prod?.price;
  const fallback = Number(fallbackRaw ?? 0);
  const fbOk = Number.isFinite(fallback) && fallback >= 0 ? fallback : 0;
  if (raw != null && Object.prototype.hasOwnProperty.call(raw, "price")) {
    const n = Number(raw.price);
    if (Number.isFinite(n) && n >= 0) return n;
    return fbOk;
  }
  const pn = prevRow?.price != null && prevRow.price !== "" ? Number(prevRow.price) : NaN;
  if (Number.isFinite(pn) && pn >= 0) return pn;
  return fbOk;
}

function pickVariantSaleMoney(raw, prevRow, fb, prod, mrp) {
  if (!(Number.isFinite(mrp) && mrp >= 0)) return null;
  if (raw != null && Object.prototype.hasOwnProperty.call(raw, "sale_price")) {
    if (raw.sale_price === null || raw.sale_price === "") return null;
    const n = Number(raw.sale_price);
    if (!Number.isFinite(n) || n < 0) return null;
    if (n === 0 || n >= mrp) return null;
    return n;
  }
  if (prevRow?.sale_price != null && prevRow.sale_price !== "") {
    const n = Number(prevRow.sale_price);
    if (Number.isFinite(n) && n > 0 && n < mrp) return n;
  }
  const fs = fb?.sale_price != null && fb.sale_price !== "" ? Number(fb.sale_price) : null;
  if (fs != null && Number.isFinite(fs) && fs > 0 && fs < mrp) return fs;
  const ps = prod?.sale_price != null && prod.sale_price !== "" ? Number(prod.sale_price) : null;
  if (ps != null && Number.isFinite(ps) && ps > 0 && ps < mrp) return ps;
  return null;
}

function stripMongoDoc(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return rest;
}

function mapProductWriteMongoError(err) {
  const code = Number(err?.code);
  const msg = String(err?.message ?? "");
  if (code !== 11000 && !msg.includes("E11000")) return null;
  if (msg.includes(" slug_1")) return { ok: false, error: "slug_taken" };
  if (msg.includes(" sku_1")) return { ok: false, error: "sku_taken" };
  if (msg.includes("variants.barcode_1") || msg.includes(" variants.barcode")) {
    return { ok: false, error: "variant_barcode_taken" };
  }
  return { ok: false, error: "duplicate_key" };
}

async function loadBrandModelNames(db, brandId, modelId) {
  const bid = toNumOrNull(brandId);
  const mid = toNumOrNull(modelId);
  let brand_name = null;
  let model_name = null;
  if (bid != null) {
    const b = await db.collection("brands").findOne({ id: bid });
    brand_name = b?.name ?? null;
  }
  if (mid != null) {
    const m = await db.collection("models").findOne({ id: mid });
    model_name = m?.name ?? null;
  }
  return { brand_name, model_name };
}

function normalizeCompatibleModelIds(raw) {
  if (raw === undefined || raw === null || raw === "") return [];
  if (!Array.isArray(raw)) return null;
  const out = [];
  const seen = new Set();
  for (const v of raw) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    const id = Math.floor(n);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

async function loadCompatibleModelRows(db, modelIds) {
  const ids = [...new Set((Array.isArray(modelIds) ? modelIds : []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return [];
  const [models, brands] = await Promise.all([
    db.collection("models").find({ id: { $in: ids } }).toArray(),
    db.collection("brands").find({}, { projection: { id: 1, name: 1 } }).toArray(),
  ]);
  const brandMap = new Map(brands.map((b) => [Number(b.id), b.name ?? null]));
  const modelMap = new Map(models.map((m) => [Number(m.id), m]));
  return ids
    .map((id) => modelMap.get(id))
    .filter(Boolean)
    .map((m) => ({
      id: Number(m.id),
      name: m.name ?? `Model ${m.id}`,
      brand_id: Number(m.brand_id),
      brand_name: brandMap.get(Number(m.brand_id)) ?? null,
    }));
}

async function validateProductRelations(db, { category_id, subcategory_id, brand_id, model_id }) {
  const cat = await db.collection("categories").findOne({ id: Number(category_id) });
  if (!cat) return { ok: false, error: "invalid_category" };
  let bid = toNumOrNull(brand_id);
  const mid = toNumOrNull(model_id);
  const sid = toNumOrNull(subcategory_id);
  if (sid != null) {
    const sub = await db.collection("subcategories").findOne({ id: sid });
    if (!sub) return { ok: false, error: "invalid_subcategory" };
    if (Number(sub.category_id) !== Number(category_id)) {
      return { ok: false, error: "subcategory_category_mismatch" };
    }
  }
  if (mid != null) {
    const model = await db.collection("models").findOne({ id: mid });
    if (!model) return { ok: false, error: "invalid_model" };
    if (bid == null) bid = Number(model.brand_id);
    else if (Number(model.brand_id) !== bid) {
      return { ok: false, error: "model_brand_mismatch" };
    }
  }
  if (bid != null) {
    const brand = await db.collection("brands").findOne({ id: bid });
    if (!brand) return { ok: false, error: "invalid_brand" };
  }
  return { ok: true, brand_id: bid };
}

export function pickImagePath(product) {
  const images = asArray(product?.images);
  const primary = images.find((i) => i.is_primary === 1 || i.is_primary === true);
  if (primary?.image_path) return primary.image_path;
  if (images[0]?.image_path) return images[0].image_path;
  if (product.image_path) return product.image_path;
  const variants = asArray(product?.variants);
  const v = variants.find((x) => x.is_active && x.image_path);
  return v?.image_path ?? null;
}

export class MongoProductRepository {
  constructor() {
    this.variantIdColumn = null;
  }

  async getFeatured(limit) {
    const lim = Math.min(Math.max(Number(limit) || 8, 1), 50);
    const db = getDb();
    const rows = await db
      .collection("products")
      .aggregate([
        {
          $match: {
            is_featured: { $in: [1, true] },
            is_active: { $in: [1, true] },
          },
        },
        { $sort: { created_at: -1 } },
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
      .toArray();

    return rows.map((p) => {
      const cat = p.cat?.[0];
      const { cat: _drop, ...rest } = p;
      return {
        ...rest,
        category_name: cat?.name ?? null,
        category_slug: cat?.slug ?? null,
        image_path: pickImagePath(p),
      };
    });
  }

  async findById(id) {
    const p = await getDb().collection("products").findOne({ id: Number(id) });
    return p ?? null;
  }

  async findBySlug(slug) {
    const p = await getDb().collection("products").findOne({
      slug: String(slug),
      is_active: { $in: [1, true] },
    });
    return p ?? null;
  }

  async findRelatedByCategory(categoryId, excludeProductId, limit = 4) {
    if (categoryId == null) return [];
    const rows = await getDb()
      .collection("products")
      .find({
        category_id: Number(categoryId),
        id: { $ne: Number(excludeProductId) },
        is_active: { $in: [1, true] },
      })
      .sort({ created_at: -1 })
      .limit(Math.min(12, Math.max(1, Number(limit) || 4)))
      .toArray();
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      price: r.price,
      sale_price: r.sale_price,
      image_path: pickImagePath(r),
    }));
  }

  async findBySlugWithCategory(slug) {
    const p = await this.findBySlug(slug);
    if (!p) return null;
    const db = getDb();
    const cat = p.category_id != null ? await db.collection("categories").findOne({ id: p.category_id }) : null;
    const images = await this.getImages(p.id);
    const compatible_models = await loadCompatibleModelRows(db, p.compatible_model_ids);
    const related_products = await this.findRelatedByCategory(p.category_id, p.id, 4);
    return {
      product: {
        ...p,
        category_name: cat?.name ?? null,
        category_slug: cat?.slug ?? null,
        image_path: pickImagePath(p),
        compatible_model_ids: Array.isArray(p.compatible_model_ids) ? p.compatible_model_ids : [],
        compatible_models,
      },
      images,
      related_products,
    };
  }

  buildCategoryProductFilter(categoryId, filters = {}) {
    const f = {
      category_id: Number(categoryId),
      is_active: { $in: [1, true] },
    };
    const sid = parsePositiveInt(filters.subcategory_id);
    if (sid) f.subcategory_id = sid;
    const bid = parsePositiveInt(filters.brand_id);
    if (bid) f.brand_id = bid;
    const mid = parsePositiveInt(filters.model_id);
    if (mid) {
      f.$or = [{ model_id: mid }, { compatible_model_ids: mid }];
    }
    const minP = parsePriceBound(filters.min_price);
    const maxP = parsePriceBound(filters.max_price);
    if (minP != null) f.price = { ...(f.price || {}), $gte: minP };
    if (maxP != null) f.price = { ...(f.price || {}), $lte: maxP };
    return f;
  }

  async getCategoryFacets(categoryId, { brand_id } = {}) {
    const db = getDb();
    const cid = Number(categoryId);
    const base = { category_id: cid, is_active: { $in: [1, true] } };

    const subs = await db
      .collection("subcategories")
      .find({ category_id: cid, is_active: { $in: [1, true] } })
      .sort({ display_order: 1, name: 1 })
      .toArray();
    const subCountRows = await db
      .collection("products")
      .aggregate([{ $match: base }, { $group: { _id: "$subcategory_id", c: { $sum: 1 } } }])
      .toArray();
    const subCountMap = new Map(subCountRows.filter((r) => r._id != null).map((r) => [r._id, r.c]));
    const subcategories = subs.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      product_count: subCountMap.get(s.id) ?? 0,
    }));

    const brandAgg = await db
      .collection("products")
      .aggregate([
        { $match: { ...base, brand_id: { $ne: null } } },
        { $group: { _id: "$brand_id", product_count: { $sum: 1 } } },
      ])
      .toArray();
    const brandIds = brandAgg.map((b) => b._id).filter(Boolean);
    const brandDocs = brandIds.length
      ? await db
          .collection("brands")
          .find({ id: { $in: brandIds }, is_active: { $in: [1, true] } })
          .toArray()
      : [];
    const brandMap = new Map(brandDocs.map((b) => [b.id, b]));
    const brands = brandAgg
      .map(({ _id: id, product_count }) => ({
        id,
        name: brandMap.get(id)?.name ?? String(id),
        product_count,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    let models = [];
    const brandForModels = parsePositiveInt(brand_id);
    if (brandForModels) {
      const rows = await db
        .collection("products")
        .find(base, { projection: { model_id: 1, compatible_model_ids: 1 } })
        .toArray();
      const modelDocs = await db
        .collection("models")
        .find({ brand_id: brandForModels, is_active: { $in: [1, true] } })
        .toArray();
      const modelMap = new Map(modelDocs.map((m) => [Number(m.id), m]));
      const counts = new Map();
      for (const p of rows) {
        const used = new Set();
        const primary = Number(p.model_id);
        if (Number.isFinite(primary) && primary > 0 && modelMap.has(primary)) used.add(primary);
        for (const rawId of Array.isArray(p.compatible_model_ids) ? p.compatible_model_ids : []) {
          const id = Number(rawId);
          if (Number.isFinite(id) && id > 0 && modelMap.has(id)) used.add(id);
        }
        for (const id of used) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      models = [...counts.entries()]
        .map(([id, product_count]) => ({
          id,
          name: modelMap.get(id)?.name ?? String(id),
          product_count,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    return { subcategories, brands, models };
  }

  async listByCategorySlug(slug, options = {}) {
    const { page = 1, limit = 24, sort: sortIn, ...rawFilters } = options;
    const sort = normalizeProductListSort(sortIn);
    const db = getDb();
    const cat = await db.collection("categories").findOne({ slug: String(slug) });
    if (!cat) return { products: [], category: null, total: 0, appliedFilters: null };
    const lim = Math.min(48, Math.max(1, Number(limit) || 24));
    const pg = Math.max(1, Number(page) || 1);
    const col = db.collection("products");
    const filters = {
      subcategory_id: rawFilters.subcategory_id,
      brand_id: rawFilters.brand_id,
      model_id: rawFilters.model_id,
      min_price: rawFilters.min_price,
      max_price: rawFilters.max_price,
    };
    const filter = this.buildCategoryProductFilter(cat.id, filters);
    const sortSpec = mongoSortFromListParam(sort);
    const skip = (pg - 1) * lim;
    const [products, total] = await Promise.all([
      col.find(filter).sort(sortSpec).skip(skip).limit(lim).toArray(),
      col.countDocuments(filter),
    ]);
    const withCat = products.map((p) => ({
      ...p,
      category_name: cat.name,
      category_slug: cat.slug,
      image_path: pickImagePath(p),
    }));
    const minP = parsePriceBound(filters.min_price);
    const maxP = parsePriceBound(filters.max_price);
    const appliedFilters = {
      category_id: cat.id,
      subcategory_id: parsePositiveInt(filters.subcategory_id),
      brand_id: parsePositiveInt(filters.brand_id),
      model_id: parsePositiveInt(filters.model_id),
      min_price: minP != null ? String(minP) : "",
      max_price: maxP != null ? String(maxP) : "",
      sort,
    };
    return { products: withCat, category: cat, total, appliedFilters };
  }

  async listActive({ page = 1, limit = 24, sort: sortIn } = {}) {
    const sort = normalizeProductListSort(sortIn);
    const db = getDb();
    const col = db.collection("products");
    const filter = { is_active: { $in: [1, true] } };
    const lim = Math.min(48, Math.max(1, Number(limit) || 24));
    const pg = Math.max(1, Number(page) || 1);
    const skip = (pg - 1) * lim;
    const sortSpec = mongoSortFromListParam(sort);
    const [rows, total] = await Promise.all([
      col
        .aggregate([
          { $match: filter },
          { $sort: sortSpec },
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
    const products = rows.map((p) => {
      const c = p.cat?.[0];
      const { cat: _c, ...rest } = p;
      return {
        ...rest,
        category_name: c?.name ?? null,
        category_slug: c?.slug ?? null,
        image_path: pickImagePath(p),
      };
    });
    return { products, total };
  }

  async search(q, { limit = 24 } = {}) {
    const term = String(q ?? "").trim();
    if (!term) return [];
    const db = getDb();
    const re = new RegExp(escapeRegex(term), "i");
    const col = db.collection("products");
    const rows = await col
      .find({
        is_active: { $in: [1, true] },
        $or: [{ name: re }, { slug: re }, { sku: re }, { description: re }],
      })
      .sort({ created_at: -1 })
      .limit(Math.min(48, Math.max(1, Number(limit))))
      .toArray();
    const catIds = [...new Set(rows.map((p) => p.category_id).filter(Boolean))];
    const cats = await db
      .collection("categories")
      .find({ id: { $in: catIds } })
      .toArray();
    const cmap = new Map(cats.map((c) => [c.id, c]));
    return rows.map((p) => {
      const c = cmap.get(p.category_id);
      return {
        ...p,
        category_name: c?.name ?? null,
        category_slug: c?.slug ?? null,
        image_path: pickImagePath(p),
      };
    });
  }

  async listForAdmin(opts = {}) {
    const {
      page = 1,
      limit = 24,
      q,
      category_id: catIn,
      subcategory_id: subIn,
      brand_id: brandIn,
      model_id: modelIn,
      is_active: activeIn,
      is_featured: featIn,
      shop_id: shopIn,
      shop_unassigned_only = false,
      stock_min,
      stock_max,
      restricted_catalog_shop_ids: restrictedCatalogShopIdsIn,
      allow_shop_filter = true,
    } = opts;

    const col = getDb().collection("products");
    const db = getDb();
    const filter = {};
    const andParts = [];

    const term = String(q ?? "").trim();
    if (term) {
      const re = new RegExp(escapeRegex(term), "i");
      andParts.push({ $or: [{ name: re }, { slug: re }, { sku: re }] });
    }

    const catId = parsePositiveInt(catIn);
    if (catId) filter.category_id = catId;
    const subId = parsePositiveInt(subIn);
    if (subId) filter.subcategory_id = subId;
    const bid = parsePositiveInt(brandIn);
    if (bid) filter.brand_id = bid;
    const mid = parsePositiveInt(modelIn);
    if (mid) filter.model_id = mid;

    const active = parseTriStateBool(activeIn);
    if (active === true) filter.is_active = { $in: [1, true] };
    else if (active === false) filter.is_active = { $in: [0, false] };

    const feat = parseTriStateBool(featIn);
    if (feat === true) filter.is_featured = { $in: [1, true] };
    else if (feat === false) filter.is_featured = { $in: [0, false] };

    const smin = parsePriceBound(stock_min);
    const smax = parsePriceBound(stock_max);
    if (smin != null || smax != null) {
      filter.stock_quantity = {};
      if (smin != null) filter.stock_quantity.$gte = smin;
      if (smax != null) filter.stock_quantity.$lte = smax;
    }

    const restrictedIds = Array.isArray(restrictedCatalogShopIdsIn)
      ? [
          ...new Set(
            restrictedCatalogShopIdsIn
              .map((x) => Math.floor(Number(x)))
              .filter((n) => Number.isFinite(n) && n > 0)
          ),
        ]
      : [];

    const legacySharedShopClauses = [{ shop_id: null }, { shop_id: { $exists: false } }];

    if (restrictedIds.length > 0) {
      const pick = parsePositiveInt(shopIn);
      if (pick && restrictedIds.includes(pick)) {
        andParts.push({
          $or: [{ shop_id: pick }, ...legacySharedShopClauses],
        });
      } else {
        andParts.push({
          $or: [{ shop_id: { $in: restrictedIds } }, ...legacySharedShopClauses],
        });
      }
    } else if (allow_shop_filter) {
      const un =
        shop_unassigned_only === true ||
        shop_unassigned_only === 1 ||
        shop_unassigned_only === "1" ||
        shop_unassigned_only === "true";
      if (un) {
        andParts.push({ $or: [{ shop_id: null }, { shop_id: { $exists: false } }] });
      } else {
        const sid = parsePositiveInt(shopIn);
        if (sid) filter.shop_id = sid;
      }
    }

    if (andParts.length) {
      filter.$and = [...(Array.isArray(filter.$and) ? filter.$and : []), ...andParts];
    }

    const lim = Math.min(100, Math.max(1, Number(limit) || 24));
    const pg = Math.max(1, Number(page) || 1);
    const skip = (pg - 1) * lim;
    const [rows, total] = await Promise.all([
      col.find(filter).sort({ id: -1 }).skip(skip).limit(lim).toArray(),
      col.countDocuments(filter),
    ]);

    const catIds = [...new Set(rows.map((r) => r.category_id).filter((x) => x != null))];
    const cats =
      catIds.length > 0
        ? await db.collection("categories").find({ id: { $in: catIds } }, { projection: { id: 1, name: 1 } }).toArray()
        : [];
    const cmap = new Map(cats.map((c) => [c.id, c.name]));

    const shopIds = [...new Set(rows.map((r) => r.shop_id).filter((x) => x != null && !Number.isNaN(Number(x))))];
    const shops =
      shopIds.length > 0
        ? await db.collection("stores").find({ id: { $in: shopIds.map(Number) } }, { projection: { id: 1, name: 1 } }).toArray()
        : [];
    const smap = new Map(shops.map((s) => [s.id, s.name]));

    const products = rows.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      sku: p.sku ?? null,
      category_id: p.category_id,
      category_name: p.category_id != null ? cmap.get(p.category_id) ?? null : null,
      subcategory_id: p.subcategory_id ?? null,
      brand_id: p.brand_id ?? null,
      model_id: p.model_id ?? null,
      shop_id: p.shop_id != null && p.shop_id !== "" ? Number(p.shop_id) : null,
      shop_name:
        p.shop_id != null && p.shop_id !== "" && !Number.isNaN(Number(p.shop_id))
          ? smap.get(Number(p.shop_id)) ?? null
          : null,
      is_active: p.is_active,
      is_featured: p.is_featured,
      price: p.price,
      stock_quantity: p.stock_quantity,
      image_path: pickImagePath(p),
    }));

    return {
      products,
      total,
      page: pg,
      limit: lim,
      total_pages: Math.max(1, Math.ceil(total / lim)),
    };
  }

  async getImages(productId) {
    const p = await getDb().collection("products").findOne({ id: Number(productId) });
    const images = p?.images || [];
    return [...images].sort((a, b) => {
      const da = a.display_order ?? 0;
      const db_ = b.display_order ?? 0;
      if (da !== db_) return da - db_;
      return (a.id ?? 0) - (b.id ?? 0);
    });
  }

  async hasProductImageVariantIdColumn() {
    if (this.variantIdColumn !== null) return this.variantIdColumn;
    this.variantIdColumn = true;
    return true;
  }

  async addImage(input) {
    const pid = Number(input.productId);
    const db = getDb();
    const col = db.collection("products");
    const product = await col.findOne({ id: pid });
    if (!product) {
      throw new Error("product_not_found");
    }
    const imgId = await nextSeq("product_images");
    const images = [...(product.images || [])];
    if (input.isPrimary) {
      for (const im of images) {
        im.is_primary = 0;
      }
    }
    images.push({
      id: imgId,
      image_path: input.imagePath,
      is_primary: input.isPrimary ? 1 : 0,
      display_order: input.displayOrder,
      variant_id: input.variantId ?? null,
    });
    await col.updateOne({ id: pid }, { $set: { images } });
    return imgId;
  }

  async updateVariantImagePath(productId, variantId, imagePath) {
    const pid = Number(productId);
    const vid = Number(variantId);
    const url = String(imagePath ?? "").trim();
    if (!Number.isFinite(pid) || pid <= 0 || !Number.isFinite(vid) || vid <= 0 || !url) return;
    await getDb().collection("products").updateOne(
      { id: pid, variants: { $elemMatch: { id: vid } } },
      { $set: { "variants.$.image_path": url, updated_at: new Date() } }
    );
  }

  /**
   * Remove one row from embedded `images`. If it was tagged to a variant, refresh that variant’s
   * `image_path` from remaining rows (or null). Reassigns primary when the removed row was primary.
   */
  async removeProductImageById(productId, imageId) {
    const pid = parsePositiveInt(productId);
    const iid = parsePositiveInt(imageId);
    if (!pid || !iid) return { ok: false, error: "invalid_id" };

    const col = getDb().collection("products");
    const product = await col.findOne({ id: pid });
    if (!product) return { ok: false, error: "not_found" };

    const images = asArray(product.images);
    const idx = images.findIndex((im) => Number(im.id) === iid);
    if (idx < 0) return { ok: false, error: "image_not_found" };

    const removed = images[idx];
    const wasPrimary = removed.is_primary === 1 || removed.is_primary === true;
    const removedVariantId =
      removed.variant_id != null && !Number.isNaN(Number(removed.variant_id))
        ? Number(removed.variant_id)
        : null;

    let nextImages = images.filter((_, j) => j !== idx);

    if (wasPrimary && nextImages.length > 0) {
      const sorted = [...nextImages].sort((a, b) => {
        const da = a.display_order ?? 0;
        const db_ = b.display_order ?? 0;
        if (da !== db_) return da - db_;
        return (Number(a.id) || 0) - (Number(b.id) || 0);
      });
      const primaryId = sorted[0]?.id;
      nextImages = nextImages.map((im) => ({
        ...im,
        is_primary: primaryId != null && Number(im.id) === Number(primaryId) ? 1 : 0,
      }));
    }

    let variants = asArray(product.variants);
    if (removedVariantId != null && removedVariantId > 0) {
      const forVariant = nextImages
        .filter((im) => Number(im.variant_id) === removedVariantId)
        .sort((a, b) => {
          const da = a.display_order ?? 0;
          const db_ = b.display_order ?? 0;
          if (da !== db_) return da - db_;
          return (Number(a.id) || 0) - (Number(b.id) || 0);
        });
      const newPath = forVariant.length
        ? String(forVariant[forVariant.length - 1].image_path ?? "").trim() || null
        : null;
      variants = variants.map((v) =>
        Number(v.id) === removedVariantId ? { ...v, image_path: newPath } : v
      );
    }

    await col.updateOne({ id: pid }, { $set: { images: nextImages, variants, updated_at: new Date() } });
    return { ok: true, product: await this.findByIdForAdmin(pid) };
  }

  /** Drop all `images` rows for a variant and clear `variants[].image_path` (manual URL included). */
  async clearVariantImage(productId, variantId) {
    const pid = parsePositiveInt(productId);
    const vid = parsePositiveInt(variantId);
    if (!pid || !vid) return { ok: false, error: "invalid_id" };

    const col = getDb().collection("products");
    const product = await col.findOne({ id: pid });
    if (!product) return { ok: false, error: "not_found" };

    const variants = asArray(product.variants);
    if (!variants.some((v) => Number(v.id) === vid)) {
      return { ok: false, error: "variant_not_found" };
    }

    const nextImages = asArray(product.images).filter((im) => Number(im.variant_id) !== vid);
    const nextVariants = variants.map((v) => (Number(v.id) === vid ? { ...v, image_path: null } : v));

    await col.updateOne(
      { id: pid },
      { $set: { images: nextImages, variants: nextVariants, updated_at: new Date() } }
    );
    return { ok: true, product: await this.findByIdForAdmin(pid) };
  }

  async slugTaken(slug, excludeProductId = null) {
    const q = { slug: String(slug) };
    if (excludeProductId != null && !Number.isNaN(Number(excludeProductId))) {
      q.id = { $ne: Number(excludeProductId) };
    }
    const one = await getDb().collection("products").findOne(q);
    return one != null;
  }

  async skuTaken(sku, excludeProductId = null) {
    const s = sanitizeSku(sku);
    if (!s) return false;
    const q = { sku: s };
    if (excludeProductId != null && !Number.isNaN(Number(excludeProductId))) {
      q.id = { $ne: Number(excludeProductId) };
    }
    const one = await getDb().collection("products").findOne(q);
    return one != null;
  }

  async pickUniqueSlug(baseSlug, excludeProductId) {
    let slug = baseSlug;
    let n = 0;
    while (await this.slugTaken(slug, excludeProductId)) {
      n += 1;
      slug = `${baseSlug}-${n}`;
    }
    return slug;
  }

  async variantBarcodeTaken(barcode, { excludeProductId = null, excludeVariantId = null } = {}) {
    const bc = sanitizeVariantBarcode(barcode);
    if (!bc) return false;
    const docs = await getDb()
      .collection("products")
      .find({ variants: { $elemMatch: { barcode: bc } } })
      .project({ id: 1, variants: 1 })
      .toArray();
    const ep = excludeProductId != null ? Number(excludeProductId) : null;
    const ev = excludeVariantId != null ? Number(excludeVariantId) : null;
    for (const d of docs) {
      for (const v of d.variants || []) {
        if (sanitizeVariantBarcode(v.barcode) !== bc) continue;
        const pid = Number(d.id);
        const vid = Number(v.id);
        if (ep != null && ev != null && pid === ep && vid === ev) continue;
        return true;
      }
    }
    return false;
  }

  async generateRetailBarcode() {
    const prefix = String(env.BARCODE_PREFIX ?? "B")
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 4) || "B";
    for (let i = 0; i < 40; i++) {
      const seq = await nextSeq("variant_barcode_seq");
      const code = `${prefix}${String(seq).padStart(8, "0")}`;
      if (!(await this.variantBarcodeTaken(code))) return code;
    }
    throw new Error("variant_barcode_generation_failed");
  }

  async normalizeVariantsInput(existingProduct, variantsIn, opts = {}) {
    const mode = opts.mode || "create";
    const fillMissing = !!opts.fillMissing;
    const autoBarcode = opts.autoBarcode !== false;
    const fb = opts.pricingFallback || {};
    const prod = existingProduct || {};
    if (!Array.isArray(variantsIn)) return [];
    const existingById = new Map((existingProduct?.variants || []).map((v) => [Number(v.id), v]));
    const out = [];
    for (const raw of variantsIn) {
      const name = String(raw?.variant_name ?? "").trim();
      if (!name) continue;
      let vid = raw?.id != null && raw.id !== "" ? Number(raw.id) : null;
      let isNewVariant = false;
      if (vid != null && (Number.isNaN(vid) || !existingById.has(vid))) {
        vid = null;
      }
      if (vid == null) {
        vid = await nextSeq("product_variants");
        isNewVariant = true;
      }

      let barcode = sanitizeVariantBarcode(raw?.barcode);
      const prevBc = sanitizeVariantBarcode(existingById.get(vid)?.barcode);
      try {
        if (!barcode && mode === "create" && autoBarcode) {
          barcode = await this.generateRetailBarcode();
        } else if (!barcode && isNewVariant) {
          barcode = await this.generateRetailBarcode();
        } else if (!barcode && mode === "update" && fillMissing && !prevBc) {
          barcode = await this.generateRetailBarcode();
        }
      } catch {
        return null;
      }

      const qtyRaw = raw?.quantity;
      let qty;
      if (qtyRaw != null && qtyRaw !== "" && !Number.isNaN(Number(qtyRaw))) {
        qty = Number(qtyRaw);
      } else if (mode === "update" && existingById.has(vid)) {
        const prevQ = existingById.get(vid)?.quantity;
        qty =
          prevQ != null && prevQ !== "" && !Number.isNaN(Number(prevQ))
            ? Math.max(0, Math.floor(Number(prevQ)))
            : 0;
      } else {
        qty = mode === "create" ? 0 : null;
      }
      const prevRow = existingById.get(vid) || {};
      let variantSku = null;
      if (raw != null && Object.prototype.hasOwnProperty.call(raw, "sku")) {
        variantSku = sanitizeSku(raw.sku);
      } else if (prevRow.sku != null) {
        variantSku = sanitizeSku(prevRow.sku);
      }
      const attribute_name = pickVariantMetaString(raw, prevRow, "attribute_name", 64);
      const attribute_value = pickVariantMetaString(raw, prevRow, "attribute_value", 64);

      const priceVal = pickVariantPriceMoney(raw, prevRow, fb, prod);
      const saleVal = pickVariantSaleMoney(raw, prevRow, fb, prod, priceVal);

      let gstVal = parseGstPercent(prod.gst_percent);
      if (raw != null && Object.prototype.hasOwnProperty.call(raw, "gst_percent")) {
        gstVal = parseGstPercent(raw.gst_percent);
      } else if (prevRow?.gst_percent != null && prevRow.gst_percent !== "") {
        gstVal = parseGstPercent(prevRow.gst_percent);
      } else if (fb.gst_percent !== undefined && fb.gst_percent !== null && fb.gst_percent !== "") {
        gstVal = parseGstPercent(fb.gst_percent);
      }

      let costVal = null;
      if (raw != null && Object.prototype.hasOwnProperty.call(raw, "cost_price")) {
        if (raw.cost_price === null || raw.cost_price === "") costVal = null;
        else {
          const c = Number(raw.cost_price);
          costVal = Number.isFinite(c) && c >= 0 ? c : null;
        }
      } else if (prevRow?.cost_price != null && prevRow.cost_price !== "") {
        const c = Number(prevRow.cost_price);
        costVal = Number.isFinite(c) && c >= 0 ? c : null;
      } else if (fb.cost_price != null && fb.cost_price !== "") {
        const c = Number(fb.cost_price);
        costVal = Number.isFinite(c) && c >= 0 ? c : null;
      } else if (prod?.cost_price != null && prod.cost_price !== "") {
        const c = Number(prod.cost_price);
        costVal = Number.isFinite(c) && c >= 0 ? c : null;
      }

      let maxDiscVal = parseOptionalDiscountPct(prod.max_discount_percent);
      if (raw != null && Object.prototype.hasOwnProperty.call(raw, "max_discount_percent")) {
        maxDiscVal = parseOptionalDiscountPct(raw.max_discount_percent);
      } else if (
        prevRow?.max_discount_percent !== undefined &&
        prevRow?.max_discount_percent !== null &&
        prevRow.max_discount_percent !== ""
      ) {
        maxDiscVal = parseOptionalDiscountPct(prevRow.max_discount_percent);
      } else if (fb.max_discount_percent !== undefined) {
        maxDiscVal = parseOptionalDiscountPct(fb.max_discount_percent);
      }

      out.push({
        id: vid,
        variant_name: name,
        sku: variantSku,
        attribute_name,
        attribute_value,
        image_path: raw?.image_path != null ? String(raw.image_path).trim() || null : null,
        quantity: qty ?? 0,
        is_active: raw?.is_active === false || raw?.is_active === 0 ? 0 : 1,
        barcode,
        price: priceVal,
        sale_price: saleVal,
        gst_percent: gstVal,
        cost_price: costVal,
        max_discount_percent: maxDiscVal,
      });
    }
    return out;
  }

  async assertPersistableVariantBarcodes(productId, variants) {
    const dup = duplicateVariantBarcodeWithin(variants);
    if (dup) return { ok: false, error: "duplicate_variant_barcode", barcode: dup };
    const pid = productId != null ? Number(productId) : null;
    for (const v of variants) {
      const bc = sanitizeVariantBarcode(v.barcode);
      if (!bc) continue;
      const taken = await this.variantBarcodeTaken(bc, {
        excludeProductId: pid,
        excludeVariantId: v.id,
      });
      if (taken) return { ok: false, error: "variant_barcode_taken", barcode: bc };
    }
    return { ok: true };
  }

  /**
   * Admin TSPL / label printing — resolves barcode text and price line for thermal output.
   */
  async getPrintLabelContext(productId, variantId) {
    const pid = Number(productId);
    if (Number.isNaN(pid)) return null;
    const p = await this.findById(pid);
    if (!p) return null;

    let brand = String(p.brand_name ?? "").trim().toUpperCase() || "";
    const model = String(p.model_name ?? "").trim().toUpperCase() || "";
    if (model) brand = brand ? `${brand} ${model}` : model;
    if (!brand) brand = "BRAND";
    const variants = Array.isArray(p.variants) ? p.variants : [];
    const vid =
      variantId != null && variantId !== "" && !Number.isNaN(Number(variantId))
        ? Number(variantId)
        : null;

    let barcodeValue = sanitizeSku(p.sku);
    let vRow = null;
    if (vid != null) {
      vRow = variants.find((x) => Number(x.id) === vid);
      if (!vRow) return null;
      barcodeValue = sanitizeVariantBarcode(vRow.barcode) || barcodeValue || String(pid);
    } else if (variants.length === 1) {
      vRow = variants[0];
      barcodeValue =
        sanitizeVariantBarcode(variants[0].barcode) || barcodeValue || String(pid);
    } else if (variants.length > 1) {
      return null;
    }

    if (!barcodeValue) barcodeValue = String(pid);

    let itemName = String(p.name ?? "ITEM").trim() || "ITEM";
    const vn = vRow ? String(vRow.variant_name ?? "").trim() : "";
    if (vn) itemName = `${itemName} - ${vn}`;

    return {
      product_id: pid,
      variant_id: vid,
      itemName,
      brand,
      barcodeValue,
      unitPrice: unitPriceForLabel(p, vRow),
    };
  }

  async syncAggregatePricingFromVariants(productId) {
    const pid = Number(productId);
    if (Number.isNaN(pid)) return;
    const col = getDb().collection("products");
    const fresh = await col.findOne({ id: pid });
    if (!fresh) return;
    const named = (fresh.variants || []).filter((v) => String(v?.variant_name ?? "").trim());
    if (!named.length) return;
    const agg = syncProductAggregatePricing(fresh.variants, fresh);
    await col.updateOne(
      { id: pid },
      {
        $set: {
          price: agg.price,
          sale_price: agg.sale_price,
          gst_percent: agg.gst_percent,
          max_discount_percent: agg.max_discount_percent,
          cost_price: agg.cost_price,
          updated_at: new Date(),
        },
      }
    );
  }

  async getDeleteBlockers(productId) {
    const pid = Number(productId);
    const db = getDb();
    const [orders, cart, wishlist, reviews] = await Promise.all([
      db.collection("orders").countDocuments({ "items.product_id": pid }),
      db.collection("cart_items").countDocuments({ product_id: pid }),
      db.collection("wishlist_items").countDocuments({ product_id: pid }),
      db.collection("reviews").countDocuments({ product_id: pid }),
    ]);
    return { orders, cart, wishlist, reviews };
  }

  async findByIdForAdmin(id) {
    const p = await this.findById(id);
    if (!p) return null;
    const db = getDb();
    const compatible_models = await loadCompatibleModelRows(db, p.compatible_model_ids);
    return {
      ...stripMongoDoc(p),
      compatible_model_ids: Array.isArray(p.compatible_model_ids) ? p.compatible_model_ids : [],
      compatible_models,
    };
  }

  async createForAdmin(raw) {
    const db = getDb();
    const name = String(raw.name ?? "").trim();
    if (!name) return { ok: false, error: "validation_failed", field: "name" };
    const category_id = Number(raw.category_id);
    if (!Number.isFinite(category_id)) {
      return { ok: false, error: "validation_failed", field: "category_id" };
    }
    const vr = await validateProductRelations(db, {
      category_id,
      subcategory_id: raw.subcategory_id,
      brand_id: raw.brand_id,
      model_id: raw.model_id,
    });
    if (!vr.ok) return { ok: false, error: vr.error };
    const shopResolved = await resolveProductShopIdOrError(db, raw.shop_id);
    if (shopResolved.error === "validation_failed") {
      return { ok: false, error: shopResolved.error, field: shopResolved.field };
    }
    if (shopResolved.error === "invalid_shop") {
      return { ok: false, error: shopResolved.error, field: shopResolved.field };
    }
    const productShopId = shopResolved.shop_id !== undefined ? shopResolved.shop_id : null;

    const compatibleModelIds = normalizeCompatibleModelIds(raw.compatible_model_ids);
    if (compatibleModelIds === null) {
      return { ok: false, error: "validation_failed", field: "compatible_model_ids" };
    }
    if (compatibleModelIds.length > 0) {
      const validCount = await db.collection("models").countDocuments({ id: { $in: compatibleModelIds } });
      if (validCount !== compatibleModelIds.length) {
        return { ok: false, error: "invalid_compatible_model" };
      }
    }
    const pricingFallback = {
      price: Number(raw.price),
      sale_price: raw.sale_price != null && raw.sale_price !== "" ? Number(raw.sale_price) : null,
      gst_percent: raw.gst_percent,
      cost_price: raw.cost_price != null && raw.cost_price !== "" ? Number(raw.cost_price) : null,
      max_discount_percent: raw.max_discount_percent,
    };
    if (!Number.isFinite(pricingFallback.price) || pricingFallback.price < 0) {
      return { ok: false, error: "validation_failed", field: "price" };
    }
    if (
      pricingFallback.sale_price != null &&
      (!Number.isFinite(pricingFallback.sale_price) || pricingFallback.sale_price < 0)
    ) {
      return { ok: false, error: "validation_failed", field: "sale_price" };
    }
    if (
      pricingFallback.cost_price != null &&
      (!Number.isFinite(pricingFallback.cost_price) || pricingFallback.cost_price < 0)
    ) {
      return { ok: false, error: "validation_failed", field: "cost_price" };
    }
    const sku = sanitizeSku(raw.sku);
    if (sku && (await this.skuTaken(sku, null))) {
      return { ok: false, error: "sku_taken" };
    }
    const baseSlug = slugify(String(raw.slug ?? "").trim() || name);
    const slug = await this.pickUniqueSlug(baseSlug, null);
    const variants = await this.normalizeVariantsInput(null, raw.variants, {
      mode: "create",
      autoBarcode: raw.auto_variant_barcodes !== false && raw.autoVariantBarcodes !== false,
      pricingFallback,
    });
    if (variants === null) {
      return { ok: false, error: "variant_barcode_generation_failed" };
    }
    const vb = await this.assertPersistableVariantBarcodes(null, variants);
    if (!vb.ok) return vb;
    const aggLegacy = {
      ...raw,
      price: pricingFallback.price,
      sale_price: pricingFallback.sale_price,
      gst_percent: raw.gst_percent,
      cost_price: raw.cost_price,
      max_discount_percent: raw.max_discount_percent,
    };
    const agg = syncProductAggregatePricing(variants, aggLegacy);
    if (!Number.isFinite(agg.price) || agg.price < 0) {
      return { ok: false, error: "validation_failed", field: "price" };
    }
    const id = await nextSeq("products");
    const now = new Date();
    const { brand_name, model_name } = await loadBrandModelNames(db, vr.brand_id, toNumOrNull(raw.model_id));
    const variantStockSum = variants.reduce(
      (s, v) => s + Math.max(0, Math.floor(Number(v.quantity) || 0)),
      0
    );
    const doc = {
      id,
      name,
      slug,
      description: String(raw.description ?? "").trim(),
      category_id,
      subcategory_id: toNumOrNull(raw.subcategory_id),
      brand_id: vr.brand_id ?? null,
      model_id: toNumOrNull(raw.model_id),
      compatible_model_ids: compatibleModelIds,
      price: agg.price,
      sale_price: agg.sale_price,
      cost_price: agg.cost_price,
      sku,
      stock_quantity:
        variants.length > 0 ? variantStockSum : Math.max(0, Math.floor(Number(raw.stock_quantity) || 0)),
      is_active: raw.is_active === false || raw.is_active === 0 ? 0 : 1,
      is_featured: raw.is_featured === true || raw.is_featured === 1 ? 1 : 0,
      meta_title: raw.meta_title != null ? String(raw.meta_title).trim().slice(0, 500) : "",
      meta_description: raw.meta_description != null ? String(raw.meta_description).trim().slice(0, 2000) : "",
      gst_percent: agg.gst_percent,
      max_discount_percent: agg.max_discount_percent,
      hsn_code: parseHsnCode(raw.hsn_code),
      no_store_stock: parseNoStoreStock(raw.no_store_stock),
      brand_name,
      model_name,
      shop_id: productShopId,
      images: [],
      variants,
      created_at: now,
      updated_at: now,
    };
    try {
      await db.collection("products").insertOne(doc);
    } catch (err) {
      const mapped = mapProductWriteMongoError(err);
      if (mapped) return mapped;
      throw err;
    }
    return { ok: true, id };
  }

  async updateForAdmin(productId, raw) {
    const db = getDb();
    const col = db.collection("products");
    const id = Number(productId);
    if (Number.isNaN(id)) return { ok: false, error: "invalid_id" };
    const existing = await col.findOne({ id });
    if (!existing) return { ok: false, error: "not_found" };
    const $set = { updated_at: new Date() };
    let category_id = existing.category_id;
    if (raw.category_id !== undefined) {
      category_id = Number(raw.category_id);
      if (!Number.isFinite(category_id)) {
        return { ok: false, error: "validation_failed", field: "category_id" };
      }
      $set.category_id = category_id;
    }
    let subcategory_id = existing.subcategory_id ?? null;
    if (raw.subcategory_id !== undefined) {
      subcategory_id = toNumOrNull(raw.subcategory_id);
      $set.subcategory_id = subcategory_id;
    }
    let brand_id = existing.brand_id ?? null;
    if (raw.brand_id !== undefined) {
      brand_id = toNumOrNull(raw.brand_id);
      $set.brand_id = brand_id;
    }
    let model_id = existing.model_id ?? null;
    if (raw.model_id !== undefined) {
      model_id = toNumOrNull(raw.model_id);
      $set.model_id = model_id;
    }
    if (raw.compatible_model_ids !== undefined) {
      const ids = normalizeCompatibleModelIds(raw.compatible_model_ids);
      if (ids === null) {
        return { ok: false, error: "validation_failed", field: "compatible_model_ids" };
      }
      if (ids.length > 0) {
        const validCount = await db.collection("models").countDocuments({ id: { $in: ids } });
        if (validCount !== ids.length) {
          return { ok: false, error: "invalid_compatible_model" };
        }
      }
      $set.compatible_model_ids = ids;
    }
    const vr = await validateProductRelations(db, {
      category_id,
      subcategory_id,
      brand_id,
      model_id,
    });
    if (!vr.ok) return { ok: false, error: vr.error };
    if (raw.brand_id !== undefined) $set.brand_id = vr.brand_id ?? null;
    if (raw.name !== undefined) {
      const name = String(raw.name).trim();
      if (!name) return { ok: false, error: "validation_failed", field: "name" };
      $set.name = name;
    }
    if (raw.slug !== undefined) {
      const s = String(raw.slug).trim();
      const nameForSlug = $set.name !== undefined ? $set.name : existing.name;
      const nextSlug = slugify(s || nameForSlug);
      if (nextSlug !== existing.slug && (await this.slugTaken(nextSlug, id))) {
        return { ok: false, error: "slug_taken" };
      }
      $set.slug = nextSlug;
    }
    if (raw.description !== undefined) {
      $set.description = String(raw.description ?? "").trim();
    }
    if (raw.shop_id !== undefined) {
      const shopResolved = await resolveProductShopIdOrError(db, raw.shop_id);
      if (shopResolved.error === "validation_failed") {
        return { ok: false, error: shopResolved.error, field: shopResolved.field };
      }
      if (shopResolved.error === "invalid_shop") {
        return { ok: false, error: shopResolved.error, field: shopResolved.field };
      }
      if (shopResolved.shop_id !== undefined) {
        $set.shop_id = shopResolved.shop_id;
      }
    }
    if (raw.price !== undefined) {
      const price = Number(raw.price);
      if (!Number.isFinite(price) || price < 0) {
        return { ok: false, error: "validation_failed", field: "price" };
      }
      $set.price = price;
    }
    if (raw.sale_price !== undefined) {
      const sale = raw.sale_price === null || raw.sale_price === "" ? null : Number(raw.sale_price);
      if (sale != null && (!Number.isFinite(sale) || sale < 0)) {
        return { ok: false, error: "validation_failed", field: "sale_price" };
      }
      $set.sale_price = sale;
    }
    if (raw.cost_price !== undefined) {
      const cost = raw.cost_price === null || raw.cost_price === "" ? null : Number(raw.cost_price);
      if (cost != null && (!Number.isFinite(cost) || cost < 0)) {
        return { ok: false, error: "validation_failed", field: "cost_price" };
      }
      $set.cost_price = cost;
    }
    if (raw.sku !== undefined) {
      const sku = sanitizeSku(raw.sku);
      if (sku && (await this.skuTaken(sku, id))) {
        return { ok: false, error: "sku_taken" };
      }
      $set.sku = sku;
    }
    const hadNamedVariants = (existing.variants || []).some((v) => String(v?.variant_name ?? "").trim());
    if (raw.stock_quantity !== undefined && !hadNamedVariants && raw.variants === undefined) {
      $set.stock_quantity = Math.max(0, Math.floor(Number(raw.stock_quantity) || 0));
    }
    if (raw.is_active !== undefined) {
      $set.is_active = raw.is_active === false || raw.is_active === 0 ? 0 : 1;
    }
    if (raw.is_featured !== undefined) {
      $set.is_featured = raw.is_featured === true || raw.is_featured === 1 ? 1 : 0;
    }
    if (raw.meta_title !== undefined) {
      $set.meta_title = String(raw.meta_title ?? "").trim().slice(0, 500);
    }
    if (raw.meta_description !== undefined) {
      $set.meta_description = String(raw.meta_description ?? "").trim().slice(0, 2000);
    }
    if (raw.gst_percent !== undefined) {
      $set.gst_percent = parseGstPercent(raw.gst_percent);
    }
    if (raw.max_discount_percent !== undefined) {
      $set.max_discount_percent = parseOptionalDiscountPct(raw.max_discount_percent);
    }
    if (raw.hsn_code !== undefined) {
      $set.hsn_code = parseHsnCode(raw.hsn_code);
    }
    if (raw.no_store_stock !== undefined) {
      $set.no_store_stock = parseNoStoreStock(raw.no_store_stock);
    }
    if (raw.variants !== undefined) {
      const pricingFallback = {
        price: raw.price !== undefined ? Number(raw.price) : Number(existing.price ?? 0),
        sale_price:
          raw.sale_price !== undefined
            ? raw.sale_price === null || raw.sale_price === ""
              ? null
              : Number(raw.sale_price)
            : existing.sale_price != null && existing.sale_price !== ""
              ? Number(existing.sale_price)
              : null,
        gst_percent: raw.gst_percent !== undefined ? raw.gst_percent : existing.gst_percent,
        cost_price:
          raw.cost_price !== undefined
            ? raw.cost_price === null || raw.cost_price === ""
              ? null
              : Number(raw.cost_price)
            : existing.cost_price,
        max_discount_percent:
          raw.max_discount_percent !== undefined ? raw.max_discount_percent : existing.max_discount_percent,
      };
      const variants = await this.normalizeVariantsInput(existing, raw.variants, {
        mode: "update",
        fillMissing:
          raw.generate_missing_barcodes === true || raw.generateMissingBarcodes === true,
        pricingFallback,
      });
      if (variants === null) {
        return { ok: false, error: "variant_barcode_generation_failed" };
      }
      const vb = await this.assertPersistableVariantBarcodes(id, variants);
      if (!vb.ok) return vb;
      $set.variants = variants;
      if (variants.length > 0) {
        $set.stock_quantity = variants.reduce(
          (s, v) => s + Math.max(0, Math.floor(Number(v.quantity) || 0)),
          0
        );
      } else if (raw.stock_quantity !== undefined) {
        $set.stock_quantity = Math.max(0, Math.floor(Number(raw.stock_quantity) || 0));
      } else {
        $set.stock_quantity = 0;
      }
    }
    const names = await loadBrandModelNames(
      db,
      $set.brand_id !== undefined ? $set.brand_id : existing.brand_id,
      $set.model_id !== undefined ? $set.model_id : existing.model_id
    );
    $set.brand_name = names.brand_name;
    $set.model_name = names.model_name;
    try {
      await col.updateOne({ id }, { $set });
    } catch (err) {
      const mapped = mapProductWriteMongoError(err);
      if (mapped) return mapped;
      throw err;
    }
    await this.syncAggregatePricingFromVariants(id);
    return { ok: true, id };
  }

  async deleteForAdmin(productId) {
    const id = Number(productId);
    if (Number.isNaN(id)) return { ok: false, error: "invalid_id" };
    const blockers = await this.getDeleteBlockers(id);
    const sum = blockers.orders + blockers.cart + blockers.wishlist + blockers.reviews;
    if (sum > 0) {
      return { ok: false, error: "product_in_use", blockers };
    }
    const r = await getDb().collection("products").deleteOne({ id });
    if (r.deletedCount === 0) return { ok: false, error: "not_found" };
    return { ok: true };
  }

  activeVariants(p) {
    return asArray(p?.variants).filter((v) => v.is_active !== 0 && v.is_active !== false);
  }

  posLineUnitPrice(p, variantId = null) {
    const vid =
      variantId != null && variantId !== "" && !Number.isNaN(Number(variantId))
        ? Number(variantId)
        : null;
    if (vid != null) {
      const v = asArray(p?.variants).find((x) => Number(x.id) === vid);
      if (v && String(v.variant_name ?? "").trim()) return variantEffectiveSelling(v, p);
    }
    const named = this.activeVariants(p).filter((v) => String(v.variant_name ?? "").trim());
    if (named.length === 1) return variantEffectiveSelling(named[0], p);
    return variantEffectiveSelling({}, p);
  }

  posAvailableQty(p, variantId) {
    if (variantId != null && !Number.isNaN(Number(variantId))) {
      const v = asArray(p?.variants).find((x) => Number(x.id) === Number(variantId));
      if (v) {
        const raw = v.quantity ?? v.stock_quantity;
        if (raw != null && raw !== "") return Math.max(0, Math.floor(Number(raw)));
      }
      return Math.max(0, Math.floor(Number(p.stock_quantity) || 0));
    }
    return Math.max(0, Math.floor(Number(p.stock_quantity) || 0));
  }

  /**
   * POS product search: name/SKU match, in-stock at line.
   * When `storeId > 0` and `lineQtyAtStore` is provided, availability uses per-store rows
   * (`variant_store_stock` / `store_stock`) with the same rules as stock transfer; otherwise
   * embedded `stock_quantity` / variant `quantity` are used (legacy single-store).
   */
  async searchProductsForPos(q, { limit = 30, storeId = 0, lineQtyAtStore = null } = {}) {
    const term = String(q ?? "").trim();
    if (term.length < 2) return [];
    const db = getDb();
    const re = new RegExp(escapeRegex(term), "i");
    const lim = Math.min(48, Math.max(1, Number(limit) || 30));
    const sid = Math.floor(Number(storeId) || 0);
    const useStore = sid > 0 && typeof lineQtyAtStore === "function";

    const nameSku = { $or: [{ name: re }, { sku: re }] };
    const embeddedInStock = {
      $or: [
        { stock_quantity: { $gt: 0 } },
        {
          variants: {
            $elemMatch: {
              quantity: { $gt: 0 },
              is_active: { $nin: [0, false] },
            },
          },
        },
      ],
    };
    const match = useStore
      ? { $and: [{ is_active: { $in: [1, true] } }, nameSku] }
      : { $and: [{ is_active: { $in: [1, true] } }, nameSku, embeddedInStock] };

    const scanCap = useStore ? Math.min(200, lim * 5) : lim;
    const rows = await db.collection("products").find(match).sort({ name: 1 }).limit(scanCap).toArray();

    const out = [];
    for (const p of rows) {
      if (Number(p.no_store_stock) === 1) continue;
      const vars = this.activeVariants(p);
      const baseName = String(p.name ?? "").trim() || "Item";

      if (vars.length === 0) {
        let available;
        if (useStore) {
          available = await lineQtyAtStore(sid, p.id, null, p);
        } else {
          available = this.posAvailableQty(p, null);
        }
        if (available <= 0) continue;
        out.push({
          id: p.id,
          product_id: p.id,
          variant_id: null,
          name: baseName,
          price: this.posLineUnitPrice(p, null),
          gst_percent: variantGstPercent({}, p),
          max_discount_percent: variantMaxDiscountPercent({}, p),
          available,
          image_path: pickImagePath(p),
        });
        if (out.length >= lim) break;
        continue;
      }

      for (const v of vars) {
        const variantId = Number(v.id);
        let available;
        if (useStore) {
          available = await lineQtyAtStore(sid, p.id, variantId, p);
        } else {
          available = this.posAvailableQty(p, variantId);
        }
        if (available <= 0) continue;
        const variantLabel = String(v.variant_name ?? "").trim();
        const displayName = variantLabel ? `${baseName} — ${variantLabel}` : baseName;
        const rowImg = v.image_path ? String(v.image_path).trim() || null : null;
        out.push({
          id: p.id,
          product_id: p.id,
          variant_id: variantId,
          name: displayName,
          price: this.posLineUnitPrice(p, variantId),
          gst_percent: variantGstPercent(v, p),
          max_discount_percent: variantMaxDiscountPercent(v, p),
          available,
          image_path: rowImg || pickImagePath(p),
        });
        if (out.length >= lim) break;
      }
      if (out.length >= lim) break;
    }
    return out;
  }

  /**
   * Resolve barcode/SKU or direct product id for POS add line.
   */
  async resolvePosProductLine({ barcode = "", product_id: productId = 0, variant_id: variantIdReq = null } = {}) {
    const input = String(barcode ?? "").trim();
    const pidParam = Math.floor(Number(productId) || 0);
    const db = getDb();
    const col = db.collection("products");
    const active = { is_active: { $in: [1, true] } };

    if (pidParam > 0 && !input) {
      const p = await col.findOne({ id: pidParam, ...active });
      if (!p) return { ok: false, error: "product_not_found" };
      const vidExplicit =
        variantIdReq != null && variantIdReq !== ""
          ? Math.floor(Number(variantIdReq))
          : NaN;
      if (Number.isFinite(vidExplicit) && vidExplicit > 0) {
        const vars = this.activeVariants(p);
        const v = vars.find((x) => Number(x.id) === vidExplicit);
        if (!v) return { ok: false, error: "variant_not_found" };
        return this._buildPosLine(p, vidExplicit, null);
      }
      return this._buildPosLine(p, null, null);
    }
    if (!input) return { ok: false, error: "product_not_found" };

    const bc = sanitizeVariantBarcode(input);
    if (bc) {
      const p = await col.findOne({
        ...active,
        variants: { $elemMatch: { barcode: bc, is_active: { $nin: [0, false] } } },
      });
      if (p) {
        const v = asArray(p?.variants).find(
          (x) => sanitizeVariantBarcode(x.barcode) === bc && x.is_active !== 0 && x.is_active !== false
        );
        if (v) return this._buildPosLine(p, Number(v.id), bc);
      }
    }

    const pSku = await col.findOne({ ...active, sku: input });
    if (pSku) return this._buildPosLine(pSku, null, input);

    return { ok: false, error: "product_not_found" };
  }

  _buildPosLine(p, forcedVariantId, scanBarcode) {
    const vars = this.activeVariants(p);
    let variantId = forcedVariantId != null ? Number(forcedVariantId) : null;
    let variantName = null;
    if (variantId != null) {
      const v = vars.find((x) => Number(x.id) === variantId);
      if (!v) return { ok: false, error: "variant_not_found" };
      variantName = v.variant_name;
    } else if (vars.length === 1) {
      variantId = Number(vars[0].id);
      variantName = vars[0].variant_name;
    } else if (vars.length > 1) {
      const def = vars.find((x) => String(x.variant_name).trim() === "Default");
      if (def) {
        variantId = Number(def.id);
        variantName = def.variant_name;
      }
    }

    let imagePath = pickImagePath(p);
    if (variantId != null) {
      const v = vars.find((x) => Number(x.id) === variantId);
      if (v?.image_path) imagePath = v.image_path;
    }

    const displayBase = String(p.name ?? "").trim() || "Item";
    const displayName = variantName ? `${displayBase} - ${variantName}` : displayBase;

    let vForPricing = {};
    if (variantId != null) {
      vForPricing = vars.find((x) => Number(x.id) === Number(variantId)) ?? {};
    } else if (vars.length === 1) {
      vForPricing = vars[0];
    }

    return {
      ok: true,
      product_id: p.id,
      variant_id: variantId,
      variant_barcode: scanBarcode,
      name: displayName,
      image_path: imagePath,
      price: this.posLineUnitPrice(p, variantId),
      gst_percent: variantGstPercent(vForPricing, p),
      max_discount_percent: variantMaxDiscountPercent(vForPricing, p),
      available: this.posAvailableQty(p, variantId),
      no_store_stock: 0,
      product_store_id: 0,
    };
  }

  async _syncStockQuantityFromVariants(productId) {
    const pid = Number(productId);
    const p = await getDb().collection("products").findOne({ id: pid });
    if (!p?.variants?.length) return;
    const sum = this.activeVariants(p).reduce(
      (s, v) => s + Math.max(0, Math.floor(Number(v.quantity) || 0)),
      0
    );
    await getDb().collection("products").updateOne({ id: pid }, { $set: { stock_quantity: sum } });
  }

  /**
   * Deduct stock after POS checkout. When `storeId` and `stockTransfer` are set, uses
   * `variant_store_stock` / `store_stock` (same as admin stock transfer); otherwise legacy
   * embedded `variants.$.quantity` / `stock_quantity` updates.
   */
  async decrementPosStock(storeId, productId, variantId, qty, stockTransfer = null) {
    const q = Math.floor(Number(qty));
    const pid = Number(productId);
    const sid = Math.floor(Number(storeId) || 0);
    if (!Number.isFinite(pid) || pid <= 0 || q <= 0) return { ok: false, error: "invalid" };
    if (sid > 0 && stockTransfer) {
      if (variantId != null && !Number.isNaN(Number(variantId))) {
        return stockTransfer.adjustStoreVariantQuantity(sid, pid, Number(variantId), -q);
      }
      return stockTransfer.adjustStoreProductQuantity(sid, pid, -q);
    }
    const col = getDb().collection("products");
    if (variantId != null && !Number.isNaN(Number(variantId))) {
      const vid = Number(variantId);
      const r = await col.updateOne(
        { id: pid, variants: { $elemMatch: { id: vid, quantity: { $gte: q } } } },
        { $inc: { "variants.$.quantity": -q } }
      );
      if (r.matchedCount === 0) return { ok: false, error: "insufficient_stock" };
      await this._syncStockQuantityFromVariants(pid);
      return { ok: true };
    }
    const r2 = await col.updateOne({ id: pid, stock_quantity: { $gte: q } }, { $inc: { stock_quantity: -q } });
    if (r2.matchedCount === 0) return { ok: false, error: "insufficient_stock" };
    return { ok: true };
  }
}
