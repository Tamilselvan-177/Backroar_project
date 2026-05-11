# MongoDB schema (Backroar Node API)

The Node API uses **MongoDB only** (no SQL in application code). Collections mirror the legacy MySQL tables from `backroarWebstieWIthBillingSystem/database/*.sql`, with these conventions:

- **Numeric `id`** on business documents (not `_id`) for stable public API identifiers; `_id` is a normal `ObjectId`.
- **`_counters`** collection with `{ _id: "<name>", seq: <number> }` for monotonic ids via `nextSeq()`.
- **Booleans / flags** often stored as `1` / `0` like MySQL `TINYINT(1)` for easier import or payload comparison.
- **Embedded arrays** where it simplifies reads: `products.images[]` instead of a separate `product_images` collection (admin upload worker writes here).

Run `npm run migrations -w api` (from repo root) or `npm run migrations` inside `apps/api` to create indexes (`src/scripts/ensureMongoIndexes.js`).

## Core storefront

### `users`

| Field | Type | Notes |
|-------|------|--------|
| `id` | number | unique |
| `name`, `email`, `phone` | string | `email` unique index |
| `password` | string | bcrypt hash |
| `role` | string | `customer`, `staff`, `admin`, … |
| `is_active` | number | 1 / 0 |
| `shop_id` | number \| null | multi-shop parity |
| `created_at`, `updated_at` | Date | |

### `categories`

| Field | Type | Notes |
|-------|------|--------|
| `id` | number | unique |
| `name`, `slug` | string | `slug` unique |
| `description` | string | optional |
| `image_path` | string | optional |
| `is_active` | number | |
| `display_order` | number | |
| `created_at` | Date | |

### `subcategories`

| Field | Type | Notes |
|-------|------|--------|
| `id` | number | |
| `category_id` | number | → `categories.id` |
| `name`, `slug` | string | compound unique `(category_id, slug)` |
| `description` | string | optional |
| `is_active`, `display_order` | number / mixed | |
| `created_at` | Date | |

### `brands` / `models`

Same shape as SQL: `id`, `name`, `slug`, `brand_id` on models, `logo_path`, `is_active`, etc.

### `products`

| Field | Type | Notes |
|-------|------|--------|
| `id` | number | unique |
| `category_id`, `subcategory_id`, `brand_id`, `model_id` | number \| null | |
| `name`, `slug` | string | `slug` unique |
| `description` | string | |
| `price`, `sale_price`, `cost_price` | number | decimals as double |
| `sku` | string \| null | unique when present (sparse unique index via `npm run migrations`) |
| `stock_quantity` | number | |
| `is_featured`, `is_active` | number | 1 / 0 |
| `meta_title`, `meta_description` | string | optional |
| `brand_name`, `model_name` | string | optional denormalized for cart list speed |
| `images` | array | `{ id, image_path, is_primary, display_order, variant_id? }` |
| `variants` | array | `{ id, variant_name, image_path?, quantity?, is_active, barcode? }` — `barcode` unique when set (multikey sparse index); auto-generated with prefix `BARCODE_PREFIX` |
| `created_at`, `updated_at` | Date | |

### `cart_items`

| Field | Type | Notes |
|-------|------|--------|
| `id` | number | unique |
| `user_id`, `product_id` | number | index `(user_id, product_id, variant_id)` |
| `quantity` | number | |
| `variant_id` | number \| null | |
| `created_at` | Date | |

### `wishlist_items`

| Field | Type | Notes |
|-------|------|--------|
| `id` | number | from `nextSeq("wishlist_items")` |
| `user_id`, `product_id` | number | unique pair (index); optional `notes`, `created_at` |

### `reviews`

| Field | Type | Notes |
|-------|------|--------|
| `id` | number | `nextSeq("reviews")` |
| `user_id`, `product_id` | number | compound unique `(user_id, product_id)` |
| `rating` | number | 1–5 |
| `title`, `comment` | string | |
| `status` | string | `pending`, `approved`, `rejected` (case-insensitive match for approved) |
| `is_verified_purchase` | number | 1 / 0 |
| `created_at`, `updated_at` | Date | |

### `orders`

| Field | Type | Notes |
|-------|------|--------|
| `id` | number | `nextSeq("orders")`, unique |
| `order_number` | string | unique, human-facing (e.g. `ORD-YYYYMMDD-XXXXXX`) |
| `user_id` | number | owner |
| `subtotal`, `shipping_charge`, `total_amount`, `discount_amount` | number | checkout totals snapshot |
| `coupon_id`, `coupon_code` | number \| null, string \| null | optional |
| `payment_method` | string | e.g. `COD` |
| `payment_status`, `order_status` | string | e.g. `Pending` |
| `shipping_name`, `shipping_phone`, `shipping_address`, `shipping_city`, `shipping_state`, `shipping_pincode` | string | snapshot at checkout |
| `items` | array | embedded lines: `product_id`, `variant_id?`, `product_name`, `price`, `quantity`, `subtotal` |
| `created_at`, `updated_at` | Date | |

## RBAC (optional; matches `2026_01_17_rbac_system.sql`)

- `roles` — `id`, `name`, `description`, …
- `permissions` — `id`, `key_name`, …
- `user_roles` — `user_id`, `role_id`
- `role_permissions` — `role_id`, `permission_id`

## POS / stock / admin (planned)

Map remaining SQL migrations to collections, for example:

- `pos_sessions`, `pos_orders`, `pos_order_items`
- `stock_transfers`, `stock_movements`
- `stores`, `counters`, `staff_credit`, `returns`, `coupons`, `attendance_*`, `income_expense_*`

Each should keep a numeric `id` where the UI or reports reference integer ids.

## Import strategy

1. One-off ETL script (not bundled in API runtime) reads MySQL and writes Mongo documents using the shapes above, or  
2. Re-seed from JSON exports per collection.

After import, run index creation (`npm run migrations -w api`).
