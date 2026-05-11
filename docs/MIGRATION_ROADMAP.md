# Backroar — Node + React + Mongo rollout roadmap

This document is a **phase checklist** for evolving `backroarWebstieWIthBillingSystem` into `apps/api` (Fastify, MongoDB) and `apps/web` (React). Work **in phase order**; each phase should be shippable (deploy + test) before starting the next.

**Goal:** Every storefront URL, admin module, POS/billing path, variant images, barcode/TSPL flows, stock/coupons/returns, and HR/finance features land here — tracked phase-by-phase (not everything ships in one step).

## Conventions

- **URLs:** defined by React Router in `apps/web` and route modules under `apps/api/src/routes/`.
- **Data:** Mongo collections described in `docs/MONGODB_SCHEMA.md`; SQL dumps under `backroarWebstieWIthBillingSystem/database/` are reference for ETL only.
- **Numeric `id`** on Mongo documents for stable public API identifiers (monotonic via `_counters`).
- **ETL:** one-off import scripts (not in API hot path); then `npm run migrations` for indexes.

---

## Phase 0 — Foundation (done / maintain)

| Item | Status |
|------|--------|
| Mongo connection, `MONGODB_URI`, env loading from repo root | Done |
| Redis sessions, CSRF, cookie auth | Done |
| Indexes `npm run migrations` | Done |
| Storefront: home, categories, category PLP, products list, product detail, search, cart, checkout shell | Partial |
| Admin shell + sidebar + catalog CRUD (categories, subcategories, brands, models) + admin product list + image upload route | Done |

---

## Phase 1 — Storefront account & engagement

| Previous UI | Node / React | Status |
|------------|----------------|--------|
| Wishlist index + add/remove | `GET/POST /api/wishlist*` + `Wishlist.jsx` + product heart | **Done** |
| Reviews POST | `POST /api/reviews` + product detail + approved list + rating stats | **Done** |
| Account profile | `/api/auth/me` + `AccountProfile.jsx` (etc.) | Partial |
| Orders list + detail | `GET /api/orders`, `GET /api/order/:orderNumber` + `Orders.jsx`, `OrderDetail.jsx` | **Done** |

---

## Phase 2 — Checkout & orders (storefront + admin)

| Previous | Node / React | Status |
|-----|----------------|--------|
| Checkout, order create | `MongoCheckoutRepository.placeOrder` + `POST /api/checkout` + `Checkout.jsx` | **Done** (COD, shipping form, cart clear, stock decrement) |
| Customer orders | `GET /api/orders`, `GET /api/order/:orderNumber` + `Orders.jsx`, `OrderDetail.jsx`, `CheckoutSuccess.jsx` | **Done** |
| Admin orders | `GET/PATCH /api/admin/orders`, `GET/PATCH /api/admin/orders/:id` + `AdminOrdersPage` / `AdminOrderDetailPage` | **Done** (list, search, filters, detail, status patch) |

---

## Phase 3 — Admin catalog depth

| Previous | Node / React | Status |
|-----|----------------|--------|
| Admin product CRUD, variants, barcodes, stock | Products CRUD + variant **barcode** + **`GET /api/admin/print/tspl`** + TSPL download + network send + printer preference APIs | **Partial** (no per-variant serial barcode pool / USB/Windows bridge yet; image reorder UI next) |
| Admin images reorder/primary | Extend upload worker + routes | Partial upload |

---

## Phase 4 — POS

| Previous POS module | Node + React | Status |
|--------------------------|--------------|--------|
| Session, billing, cart ops, checkout, GST report | New collections + REST + dedicated POS UI | Placeholder |

---

## Phase 5 — Stock & returns

Stock transfer, stock management, returns → Mongo collections + `/api/admin/stock*` + React.

---

## Phase 6 — Multi-shop & HR

Stores, counters, staff, roles/RBAC UI, attendance → Mongo + admin APIs + React.

---

## Phase 7 — Finance & analytics

Income/expense, dashboards, coupons (full), analytics → Mongo + routes + React.

---

## Phase 8 — Cutover

- Data freeze + final ETL
- Point DNS / reverse proxy to Node + static React
- Decommission previous monolith

---

## How to use this doc

1. Pick the **lowest phase** that still has “Todo”.
2. For each row: implement **API + repository + React page** in one PR-sized chunk.
3. Update the **Status** column when merged.
4. For a live **feature coverage** matrix in the admin app, open **Admin → Feature coverage** (`/admin/feature-coverage`).
