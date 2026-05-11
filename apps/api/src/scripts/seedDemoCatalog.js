import { closeMongo, connectMongo, getDb } from "../db/mongo.js";
import { slugify } from "../lib/slug.js";
import { nextSeq } from "../repositories/mongo/counter.js";
import { createRepositories } from "../repositories/registry.js";

const DEMO_TAG = "demo_catalog_v1";

const CATEGORY_SEEDS = [
  {
    name: "Mobile Backcases",
    slug: "mobile-backcases",
    description: "Demo phone cases for storefront testing.",
    image_path: "/public/images/categories/backcase.png",
    display_order: 1,
  },
  {
    name: "Mobile Phones",
    slug: "mobile-phones",
    description: "Demo smartphone listings for storefront testing.",
    image_path: "/public/images/categories/phone.png",
    display_order: 2,
  },
  {
    name: "Tempered Glass",
    slug: "tempered-glass",
    description: "Demo screen protection products for storefront testing.",
    image_path: "/public/images/categories/tempered.png",
    display_order: 3,
  },
  {
    name: "Gadgets",
    slug: "gadgets",
    description: "Demo accessories and gadgets for storefront testing.",
    image_path: "/public/images/categories/gadgets.png",
    display_order: 4,
  },
];

const BRAND_SEEDS = [
  { name: "Apple", slug: "apple", display_order: 1 },
  { name: "Samsung", slug: "samsung", display_order: 2 },
  { name: "OnePlus", slug: "oneplus", display_order: 3 },
  { name: "Xiaomi", slug: "xiaomi", display_order: 4 },
  { name: "Backroar", slug: "backroar", display_order: 5 },
];

const MODEL_SEEDS = [
  { brand: "Apple", name: "iPhone 15", slug: "iphone-15" },
  { brand: "Apple", name: "iPhone 15 Pro", slug: "iphone-15-pro" },
  { brand: "Samsung", name: "Galaxy S24", slug: "galaxy-s24" },
  { brand: "OnePlus", name: "12R", slug: "oneplus-12r" },
  { brand: "Xiaomi", name: "Redmi Note 13", slug: "redmi-note-13" },
];

const SUBCATEGORY_SEEDS = [
  { category: "mobile-backcases", name: "Clear Cases", slug: "clear-cases", display_order: 1 },
  { category: "mobile-backcases", name: "Shockproof Cases", slug: "shockproof-cases", display_order: 2 },
  { category: "mobile-phones", name: "5G Phones", slug: "5g-phones", display_order: 1 },
  { category: "tempered-glass", name: "Edge to Edge Glass", slug: "edge-to-edge-glass", display_order: 1 },
  { category: "gadgets", name: "Chargers & Cables", slug: "chargers-cables", display_order: 1 },
];

const PRODUCT_SEEDS = [
  {
    name: "Crystal Clear Case for iPhone 15",
    slug: "crystal-clear-case-iphone-15",
    category: "mobile-backcases",
    subcategory: "clear-cases",
    brand: "Apple",
    model: "iphone-15",
    image_path: "/public/images/categories/backcase.png",
    price: 799,
    sale_price: 599,
    cost_price: 320,
    sku: "DEMO-CASE-IP15-CLR",
    stock_quantity: 35,
    is_featured: 1,
    gst_percent: 18,
    description: "Anti-yellow clear case demo product for testing category pages, cart, and checkout.",
  },
  {
    name: "Armor Shield Case for Galaxy S24",
    slug: "armor-shield-case-galaxy-s24",
    category: "mobile-backcases",
    subcategory: "shockproof-cases",
    brand: "Samsung",
    model: "galaxy-s24",
    image_path: "/public/images/categories/backcase.png",
    price: 999,
    sale_price: 749,
    cost_price: 420,
    sku: "DEMO-CASE-S24-ARMOR",
    stock_quantity: 28,
    is_featured: 1,
    gst_percent: 18,
    description: "Shockproof case demo product with raised edge protection.",
  },
  {
    name: "Edge Guard Tempered Glass for iPhone 15",
    slug: "edge-guard-tempered-glass-iphone-15",
    category: "tempered-glass",
    subcategory: "edge-to-edge-glass",
    brand: "Apple",
    model: "iphone-15",
    image_path: "/public/images/categories/tempered.png",
    price: 499,
    sale_price: 349,
    cost_price: 150,
    sku: "DEMO-TG-IP15-E2E",
    stock_quantity: 60,
    is_featured: 1,
    gst_percent: 18,
    description: "Full coverage tempered glass demo product for testing filters and search.",
  },
  {
    name: "Premium Tempered Glass for OnePlus 12R",
    slug: "premium-tempered-glass-oneplus-12r",
    category: "tempered-glass",
    subcategory: "edge-to-edge-glass",
    brand: "OnePlus",
    model: "oneplus-12r",
    image_path: "/public/images/categories/tempered.png",
    price: 449,
    sale_price: 299,
    cost_price: 140,
    sku: "DEMO-TG-12R-PREM",
    stock_quantity: 52,
    is_featured: 1,
    gst_percent: 18,
    description: "Smooth-touch demo screen guard to verify pricing blocks and listing cards.",
  },
  {
    name: "Backroar 25W Type-C Fast Charger",
    slug: "backroar-25w-type-c-fast-charger",
    category: "gadgets",
    subcategory: "chargers-cables",
    brand: "Backroar",
    model: null,
    image_path: "/public/images/categories/gadgets.png",
    price: 1299,
    sale_price: 999,
    cost_price: 560,
    sku: "DEMO-CHARGER-25W",
    stock_quantity: 18,
    is_featured: 1,
    gst_percent: 18,
    description: "Demo fast charger for gadgets section and checkout testing.",
  },
  {
    name: "Xiaomi Turbo Cable 1m",
    slug: "xiaomi-turbo-cable-1m",
    category: "gadgets",
    subcategory: "chargers-cables",
    brand: "Xiaomi",
    model: "redmi-note-13",
    image_path: "/public/images/categories/gadgets.png",
    price: 399,
    sale_price: 249,
    cost_price: 110,
    sku: "DEMO-CABLE-XIAOMI-1M",
    stock_quantity: 44,
    is_featured: 0,
    gst_percent: 18,
    description: "Demo cable product for accessory browsing and cart calculations.",
  },
  {
    name: "Apple iPhone 15 Demo Listing",
    slug: "apple-iphone-15-demo-listing",
    category: "mobile-phones",
    subcategory: "5g-phones",
    brand: "Apple",
    model: "iphone-15",
    image_path: "/public/images/categories/phone.png",
    price: 72999,
    sale_price: 69999,
    cost_price: 65000,
    sku: "DEMO-PHONE-IP15",
    stock_quantity: 8,
    is_featured: 1,
    gst_percent: 18,
    description: "Demo phone listing to verify high-value product display and featured carousels.",
  },
  {
    name: "Samsung Galaxy S24 Demo Listing",
    slug: "samsung-galaxy-s24-demo-listing",
    category: "mobile-phones",
    subcategory: "5g-phones",
    brand: "Samsung",
    model: "galaxy-s24",
    image_path: "/public/images/categories/phone.png",
    price: 68999,
    sale_price: 65999,
    cost_price: 61200,
    sku: "DEMO-PHONE-S24",
    stock_quantity: 6,
    is_featured: 1,
    gst_percent: 18,
    description: "Demo premium phone product for storefront browsing and search verification.",
  },
];

function pickNow(existing) {
  return existing?.created_at ?? new Date();
}

async function ensureCategory(repos, db, seed) {
  const slug = slugify(seed.slug || seed.name);
  const existing = await db.collection("categories").findOne({ slug });
  if (!existing) {
    const id = await repos.categories.create({ ...seed, slug, is_active: true });
    return db.collection("categories").findOne({ id });
  }
  await db.collection("categories").updateOne(
    { id: existing.id },
    {
      $set: {
        name: seed.name,
        slug,
        description: seed.description ?? null,
        image_path: seed.image_path ?? null,
        is_active: 1,
        display_order: Number(seed.display_order) || 0,
        seed_tag: DEMO_TAG,
        updated_at: new Date(),
      },
    }
  );
  return db.collection("categories").findOne({ id: existing.id });
}

async function ensureBrand(repos, db, seed) {
  const slug = slugify(seed.slug || seed.name);
  const existing = await db.collection("brands").findOne({ slug });
  if (!existing) {
    const id = await repos.brands.create({ ...seed, slug, is_active: true });
    return db.collection("brands").findOne({ id });
  }
  await db.collection("brands").updateOne(
    { id: existing.id },
    {
      $set: {
        name: seed.name,
        slug,
        logo_path: seed.logo_path ?? null,
        is_active: 1,
        display_order: Number(seed.display_order) || 0,
        seed_tag: DEMO_TAG,
      },
    }
  );
  return db.collection("brands").findOne({ id: existing.id });
}

async function ensureModel(repos, db, seed, brandsBySlug) {
  const brand = brandsBySlug.get(slugify(seed.brand));
  if (!brand) throw new Error(`Missing brand for model seed: ${seed.brand}`);
  const slug = slugify(seed.slug || seed.name);
  const existing = await db.collection("models").findOne({ brand_id: brand.id, slug });
  if (!existing) {
    const id = await repos.models.create({
      brand_id: brand.id,
      name: seed.name,
      slug,
      model_number: seed.model_number ?? null,
      is_active: true,
    });
    return db.collection("models").findOne({ id });
  }
  await db.collection("models").updateOne(
    { id: existing.id },
    {
      $set: {
        brand_id: brand.id,
        name: seed.name,
        slug,
        model_number: seed.model_number ?? null,
        is_active: 1,
        seed_tag: DEMO_TAG,
      },
    }
  );
  return db.collection("models").findOne({ id: existing.id });
}

async function ensureSubcategory(repos, db, seed, categoriesBySlug) {
  const category = categoriesBySlug.get(seed.category);
  if (!category) throw new Error(`Missing category for subcategory seed: ${seed.category}`);
  const slug = slugify(seed.slug || seed.name);
  const existing = await db.collection("subcategories").findOne({ category_id: category.id, slug });
  if (!existing) {
    const id = await repos.subcategories.create({
      category_id: category.id,
      name: seed.name,
      slug,
      description: seed.description ?? null,
      display_order: seed.display_order ?? 0,
      is_active: true,
    });
    return db.collection("subcategories").findOne({ id });
  }
  await db.collection("subcategories").updateOne(
    { id: existing.id },
    {
      $set: {
        category_id: category.id,
        name: seed.name,
        slug,
        description: seed.description ?? null,
        is_active: 1,
        display_order: Number(seed.display_order) || 0,
        seed_tag: DEMO_TAG,
      },
    }
  );
  return db.collection("subcategories").findOne({ id: existing.id });
}

function productDoc(seed, existing, refs) {
  const now = new Date();
  return {
    id: existing?.id,
    name: seed.name,
    slug: seed.slug,
    description: seed.description,
    category_id: refs.category.id,
    subcategory_id: refs.subcategory?.id ?? null,
    brand_id: refs.brand?.id ?? null,
    model_id: refs.model?.id ?? null,
    compatible_model_ids: [],
    price: Number(seed.price),
    sale_price: seed.sale_price != null ? Number(seed.sale_price) : null,
    cost_price: seed.cost_price != null ? Number(seed.cost_price) : null,
    sku: seed.sku,
    stock_quantity: Number(seed.stock_quantity) || 0,
    is_active: 1,
    is_featured: seed.is_featured ? 1 : 0,
    meta_title: seed.name,
    meta_description: seed.description,
    gst_percent: Number(seed.gst_percent) || 0,
    max_discount_percent: null,
    hsn_code: null,
    no_store_stock: 0,
    brand_name: refs.brand?.name ?? null,
    model_name: refs.model?.name ?? null,
    shop_id: null,
    image_path: seed.image_path,
    images: [
      {
        id: 1,
        image_path: seed.image_path,
        is_primary: 1,
        display_order: 1,
      },
    ],
    variants: [],
    seed_tag: DEMO_TAG,
    created_at: pickNow(existing),
    updated_at: now,
  };
}

async function ensureProduct(db, seed, refs) {
  const existing = await db.collection("products").findOne({ slug: seed.slug });
  const doc = productDoc(seed, existing, refs);
  if (!existing) {
    doc.id = await nextSeq("products");
    await db.collection("products").insertOne(doc);
    return doc;
  }
  await db.collection("products").updateOne(
    { id: existing.id },
    {
      $set: {
        ...doc,
        id: existing.id,
        created_at: existing.created_at ?? doc.created_at,
      },
    }
  );
  return { ...doc, id: existing.id, created_at: existing.created_at ?? doc.created_at };
}

async function main() {
  await connectMongo();
  const db = getDb();
  const repos = createRepositories();

  const categoriesBySlug = new Map();
  for (const seed of CATEGORY_SEEDS) {
    const category = await ensureCategory(repos, db, seed);
    categoriesBySlug.set(seed.slug, category);
  }

  const brandsBySlug = new Map();
  for (const seed of BRAND_SEEDS) {
    const brand = await ensureBrand(repos, db, seed);
    brandsBySlug.set(seed.slug, brand);
  }

  const modelsBySlug = new Map();
  for (const seed of MODEL_SEEDS) {
    const model = await ensureModel(repos, db, seed, brandsBySlug);
    modelsBySlug.set(seed.slug, model);
  }

  const subcategoriesBySlug = new Map();
  for (const seed of SUBCATEGORY_SEEDS) {
    const subcategory = await ensureSubcategory(repos, db, seed, categoriesBySlug);
    subcategoriesBySlug.set(seed.slug, subcategory);
  }

  const products = [];
  for (const seed of PRODUCT_SEEDS) {
    const refs = {
      category: categoriesBySlug.get(seed.category),
      subcategory: subcategoriesBySlug.get(seed.subcategory),
      brand: seed.brand ? brandsBySlug.get(slugify(seed.brand)) : null,
      model: seed.model ? modelsBySlug.get(seed.model) : null,
    };
    if (!refs.category) throw new Error(`Missing category for product seed: ${seed.slug}`);
    const product = await ensureProduct(db, seed, refs);
    products.push(product);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        seed: DEMO_TAG,
        categories: categoriesBySlug.size,
        brands: brandsBySlug.size,
        models: modelsBySlug.size,
        subcategories: subcategoriesBySlug.size,
        products: products.length,
        featured: products.filter((p) => p.is_featured === 1).length,
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await closeMongo();
  });
