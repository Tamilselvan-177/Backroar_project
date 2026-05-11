# POS and stock — manual test plan (Node API + React)

Use this to validate POS billing, stock transfer, and variant stock behaviour after changes.

## Preconditions

- MongoDB seeded with test products, variants, and store stock for at least two stores.
- RBAC roles and assignments for test staff users.
- Two test products with variants and known per-store quantities.

## POS billing

1. Start a POS session as staff user A on counter C1.
2. Add line items (product with variant, quantity 2); apply discount and service charge where supported.
3. Complete checkout; capture `pos_order` id and printed totals (subtotal, GST, grand total).
4. Re-open the bill in POS order history and confirm line amounts and header totals.
5. Verify stock decrements: variant/store quantities and movement records match expectations (no negative stock).

## Stock transfer

1. Create a transfer from store S1 → S2 for known SKUs.
2. Execute the transfer; verify `stock_transfer` (or equivalent) and both stores’ on-hand quantities.

## Concurrency

1. Two parallel sessions attempt to sell the last unit of the same variant; one must fail or resolve consistently (no negative stock).

## Sign-off

- Finance: GST report totals for a sample date range match exports used for reconciliation.
- Ops: barcode / TSPL print flows match printer integration assumptions.
