# Module: Billing engine & invoices (Step 6)

Status: **built 2026-11-07**, awaiting demo sign-off.

## Screens

| Where | Who | What |
|---|---|---|
| **Running statement** (order page, open orders) | admin, staff | "How much do I owe so far?" Items still out, each as `qty × rate × days so far = rent` (counted to today), returned batches with their dates, days, rent and charges, then the totals: rent on returned items, rent so far on items out, damage/loss charges, **total so far** |
| **Final invoice** (order page, once everything is back) | admin, staff | Shows the total and a **Generate final invoice** button. Admins also get **Discount (₹)** and **Reason for the discount** |
| **Invoices** list (order page) | everyone | Every invoice of the order, live and cancelled (struck through, with the reason) |
| Closed banner (order page) | | "Closed with final invoice INV/…, total ₹…" links to the invoice |
| **Invoice page** `/invoices/[id]` | admin, staff | Rendered **only from the stored snapshot**: customer, site, order, one line per returned batch (issue → return date, `qty × rate × days`, rent, condition, damage charge and note), rent, charges, subtotal and discount (with reason) when there is one, total, who generated it. Cancelled invoices show who cancelled them, when and why |
| **Cancel invoice** (invoice page) | admin | Reason required. **Cancel and reissue** issues a new invoice at once (optionally with a discount). **Cancel and re-open order** re-opens the order so a return can be corrected first |

Printing and PDFs of the statement and invoice come in Step 7, together with receipts.

## Rules

- **Statement:** returned batches carry the rent recorded at return time. Pieces still out accrue `qty × snapshot rate × days(issue date, today)`. Voided returns and voided lines are ignored. Payments and advances are added in Step 7.
- **Final invoice** (docs/02 §6): the order must be OPEN, have no live invoice, have at least one active line, and have **every active line fully returned** (lost counts as returned). Otherwise: "N pieces are still out". An order where everything was voided has nothing to bill, so it is cancelled instead.
- **Snapshot:** customer name, phone and address, site, order number, and one line per returned batch (product name in en/ml, serial, quantity, dates, days, rate, rent, condition, charge, note). Later changes to customers, products or rates never change an issued invoice. Lines are sorted by issue date, product, serial and return date.
- **Totals** in exact paise: `total = Σ rent + Σ damage − discount`. Lost pieces are charged rent up to the day they were reported lost, plus the loss charge.
- **Discount:** admin only. One fixed amount per invoice, with a mandatory reason, between 0 and the subtotal (a full waiver is allowed). Audited as `INVOICE_DISCOUNT`, with the amounts before and after.
- **Numbers:** `INV/2026-27/0001`, gap-free per financial year (invoice date = today, Asia/Kolkata). The prefix comes from Settings. Concurrent clicks give exactly one invoice.
- Generating the invoice **closes the order**. Nothing more can be issued or returned.
- **Cancel** (admin, reason): never deletes. The invoice is marked CANCELLED and the order re-opens. A reissue gets a **new number**; the cancelled one keeps its own. Cancel + reissue run in one transaction, so if the reissue fails (e.g. the discount is too large), the cancel is rolled back too.
- **Returns on a live invoice can't be voided** ("cancel the invoice first"). This finishes the Step 5 follow-up.

## Billing engine (`src/modules/billing/engine.ts`, pure)

`days`, `lineRent` (Step 5), plus `accruedRent(qtyOut, rate, issueDate, today)`, `invoiceTotals(lines, discount)`, `statementTotals(returned, out, today)` and `balance(due, received, refunded)` (used in Step 7). "Today" is always passed in.

## Permissions

`invoice.create` and `statement.print` for admin and staff. `invoice.discount` and `record.cancel` for admin only. All of them are checked in the server actions, and the discount rule is checked again in the service.

## Audit actions

`INVOICE_CREATE` (number, line count, totals), `INVOICE_DISCOUNT` (reason, before/after), `INVOICE_CANCEL` (reason, number, total). All are recorded on the order, so they show in its activity list.

## Database (migration `*_invoices`)

Tables `invoices` and `invoice_lines` as in docs/03, plus `order_no` and `site_address` snapshots on the invoice.
- **One live invoice per order:** partial unique index `(order_id) WHERE status = 'ISSUED'`.
- CHECKs: totals ≥ 0; `0 ≤ discount ≤ rent + damage`; a discount needs a reason; **`total = rent_total + damage_total − discount_amount`**; cancel fields; line quantity > 0, rate > 0, damage ≥ 0, **`days = return_date − issue_date + 1`**, **`rent = qty × rate × days`**.
- **Immutability triggers:** invoice lines can never be updated or deleted. An invoice can never be deleted, and the only update allowed is ISSUED → CANCELLED with the cancel fields set.

## Tests

- Vitest (+29): the engine (accrual, totals, discount limits, exact paise, statement, balance); the invoice service (snapshot lines and totals, statement = invoice, still-out / nothing-to-bill / not-open refusals, one live invoice + DB backstop, concurrent generation with gap-free numbering, Settings prefix, discount permission, reason and limits, snapshot unaffected by later edits, DB immutability and arithmetic CHECKs, cancel → re-open → void return → new number, cancel + reissue with discount, failed reissue rolls back, double cancel); statements ignoring voided returns.
- Playwright (+5, `settlement.spec.ts`): running statement with accrual to today; staff generate the invoice (no discount field) and the order closes; admin cancel + reissue with a discount (reason required); cancel + re-open, discount over the total refused, new invoice; cancelled invoice still viewable.
- Dev-mode smoke (fresh cache, test DB): order, invoice and closed-order pages, and a cancel + reissue write. It found a hydration mismatch in the Step 4 items editor (module-level line counter), now fixed.
