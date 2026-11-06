# Module: Rental orders & issue (Step 4)

Status: **built 2026-11-06**, awaiting demo sign-off.

## Screens

| Path | Who | What |
|---|---|---|
| `/orders` | admin, staff | Orders with Open / Closed / Cancelled / All filter. Search by order number (a short number such as `12` matches `…/0012`), customer name or phone. Open orders show how many pieces are out |
| `/orders/new` | admin, staff | Step 1: pick an active customer (search, or "New customer" with the phone pre-filled). Step 2: items, site address, notes and, for admins only, a date. Creates the order and issues the items in one go |
| `/orders/[id]` | admin, staff | Items out (product, serial, quantity out/returned, issue date, rate snapshot); **Add items** (new issue on the same order); issue history incl. voided lines with who and why; activity log |
| | admin only | **Void a line** (with reason), **Cancel order** (with reason), **date field** (backdating) |
| `/customers/[id]` | | Now lists the customer's orders and every item they still have, plus a **New order** button |

**Items editor:** choose a product (grouped by category, showing availability). Then either type a quantity (max = available) or tick the available serial units. Add more lines as needed. Each product can be picked once per issue.

## Rules

- Order number `ORD/<FY>/NNNN`, gap-free per financial year of the opening date. The prefix comes from Settings.
- **Issue** (one transaction): lock the order (must be OPEN) → lock the products in id order → check each is active and `available ≥ qty` → lock the units in id order, each must be AVAILABLE → insert the issue and its lines with the **daily rate copied from the product** → `qty_out += n`, units → RENTED → audit.
- The rate is snapshotted per line. A later product rate change never touches items already out.
- Over-issuing is impossible: there is a server check under row locks, and the DB CHECK `qty_out + qty_repair ≤ qty_owned` backs it up. **One unit can't be on two active lines** (partial unique index). Tested with 4 simultaneous attempts on the last generator: exactly one succeeds.
- **Backdating** (docs/01 §8): staff always use today (Asia/Kolkata). Admins may pick an earlier date for the order opening or a later issue. **Never a future date**, never before the order's opening date. Every backdated issue is flagged and written to the audit log as `BACKDATE` (date entered + entry day) on the order.
- **Go-live:** admins enter paper-register rentals as normal orders with their real past dates. The register number goes in Notes.
- **Void a line** (admin, reason required): only while the order is OPEN and nothing has been returned against that line. The line is kept (status VOIDED, who/when/why) and the stock goes back (`qty_out −= n`, unit → AVAILABLE).
- **Cancel an order** (admin, reason required): only an OPEN order with no active lines (void them first). Step 7 adds: and no active payments.
- **Customers:** an inactive customer can't get a new order. A customer with an OPEN order can't be deactivated (order creation locks the customer row, so the two can't race).
- **Products:** inactive products can't be issued. The products list and stock check now count "out" from the issue lines.

## Audit actions

`ORDER_CREATE`, `ISSUE_CREATE` (lines, quantities, serials, rates, date, backdated flag), `BACKDATE`, `ISSUE_LINE_VOID`, `ORDER_CANCEL`.

## Database (migration `*_orders_issues`)

Tables `rental_orders`, `issues`, `issue_lines` as in docs/03, plus CHECKs: cancel needs a reason, who and when; CLOSED needs `closed_at`; quantity > 0; a unit line has quantity 1; `qty_returned` between 0 and quantity; rate > 0; a voided line has no returns and has who, when and reason. Also the partial unique "unit out once" index and an index on items out per product.

## Also fixed in this step

- **Duplicate form field ids:** two forms on one page with the same field name (e.g. "Reason" in Void and in Cancel, or in Adjust stock and Deactivate product) shared one HTML id, so a label could focus the other form's field. Fields now use React `useId`.

## Tests

- Vitest (17 new): entry-date rules, numbering, rate snapshot unaffected by a later rate change, merging repeated products, stock limits with full rollback, unit availability and input-shape errors, inactive customer/product, concurrent last-unit and quantity races, the DB unique index, backdating and the issue-before-opening rule, void (stock back, unit reusable), void blocked after returns, cancel rules, the customer guard, order search.
- Playwright (7 new, `rentals.spec.ts`): staff create an order with props and a generator; add items and the server-side stock limit; stock, customer page and the deactivation guard; admin void and the cancel rule; a backdated go-live order (marked + audited) and a refused future date; cancelling and filtering; the stock check.
- Dev-mode smoke check (second dev server against the test DB): create → add items → void → stock check, no reload loop, no page errors.
