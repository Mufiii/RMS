# Module: Products & inventory (Step 3)

Status: **built 2026-11-06**, awaiting demo sign-off.

## Screens

| Path | Who | What |
|---|---|---|
| `/products` | admin, staff | Availability view: owned / out / in repair / **available** per product, rate per day. Search by name, Malayalam name, code or serial number; category filter; "show inactive". Available = 0 is shown in red |
| `/products/[id]` | admin, staff | Stock figures, daily rate, units with colour-coded status (serialised), stock history (every movement with who, when and reason), changes (create, edit, rate change with old → new) |
| `/products/new` | admin | Category, optional code, name (+ Malayalam), tracking type, daily rate, description, **opening stock** (a count, or serial numbers one per line) |
| `/products/[id]/edit` | admin | Same fields. Tracking type is locked once the product has any stock history |
| `/products/categories` | admin | Add, rename (English + Malayalam), deactivate / reactivate |
| `/products/reconcile` | admin | **Stock check**: recomputes every product's counts from the stock ledger and unit statuses and flags any mismatch |

Admins see the stock forms on the product page:
- **Quantity products, "Adjust stock":** Opening stock, Purchase, Write-off, Send to repair, Repair done, Scrap from repair, Correction (add or remove).
- **Serialised products, "Add units":** serials, as Purchase or Opening stock. **"Unit action":** send a unit to repair, mark repair done, write off (retire), or scrap from repair. Only the actions that fit the unit's current status are offered.

## Rules

- `available = owned − out − in repair`. The database refuses `out + in repair > owned` (CHECK), so overselling is impossible even if the code has a bug.
- Every manual stock change: locks the product row → checks the rule → updates the counters → appends a `stock_movements` row → writes an audit row, all in one transaction. 6 concurrent write-offs of 3 against 10 in stock: exactly 3 succeed.
- Write-off, Scrap and Correction need a **reason** (enforced by the form, the server and the database).
- What each movement does to the counts: write-off and send-to-repair can only use available stock; repair done and scrap only what is in repair; a correction downwards only available stock.
- Serialised units: `AVAILABLE → UNDER_REPAIR → AVAILABLE`, `AVAILABLE → RETIRED` (write-off), `UNDER_REPAIR → RETIRED` (scrap). `RENTED` and `LOST` are set by issue and return in Steps 4 and 5. Serial numbers are unique per product, ignoring case.
- **Product code** is optional, capital letters, digits and `-`, unique when present.
- **Tracking type** can only change while the product has no stock history. This is stricter than "no issues yet", because units or counts would stop making sense.
- **Rate change:** audited as `RATE_CHANGE` with old → new. It applies to new rentals only; issue lines snapshot the rate (Step 4).
- Products and categories are never deleted. A product with items out can't be deactivated. Inactive categories can't be chosen for new or edited products, but existing products keep them.
- **Staff** can see everything (availability is useful at the counter) but can't change products, rates or stock.

## Audit actions

`CATEGORY_CREATE / UPDATE / DEACTIVATE / REACTIVATE`, `PRODUCT_CREATE`, `PRODUCT_UPDATE` (changed fields only), `RATE_CHANGE`, `PRODUCT_DEACTIVATE / REACTIVATE`, `STOCK_ADJUST`, `UNITS_ADD`.

## Database (migration `*_products_inventory`)

Tables `categories`, `products`, `product_units`, `stock_movements` as in docs/03, plus:
- the category name is unique ignoring case
- code format CHECK, non-blank name and serial CHECKs, `lower(name)` index
- `stock_movements` is **append-only** (a trigger rejects UPDATE and DELETE), like the audit log
- `stock_movements.return_line_id` will be added in Step 5 with the `return_lines` table

Dev seed (`SEED_DEV_DATA=true`): 3 categories, 3 serialised products (generator, breaker, mixer) and 3 quantity products (props, clamps, plates), created through the real services.

## Tests

- Vitest (25 new): the pure stock rules, including a sequence that can never break the balance; create with opening stock (count or serials); duplicate code or serial; inactive category; rate-change audit; no-op edits; tracking lock; every movement type and its limits; reason required; the DB CHECK backstop; concurrent write-offs; append-only ledger; unit transitions; deactivate/reactivate; reconciliation agrees and detects tampering.
- Playwright (7 new): categories, including case-insensitive duplicates; quantity product repair and write-off limits; rate change shown as ₹8.00 → ₹10.00 with tracking locked; serialised units (add, duplicate serial, repair, write-off with required reason); stock check; staff read-only access with 403 on admin pages; search by serial and filter by category.
