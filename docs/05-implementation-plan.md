# Implementation Plan & Workflow Coverage

Status: **APPROVED** (2026-11-06)

Working agreement: **demo after every step.** Each module is stopped and shown in the browser, and the next step starts only after the user's go-ahead.

## 1. Build order (approved, with gaps found during review folded in)

| Step | Module | Includes (★ = added after the workflow review) |
|---|---|---|
| 1 | Setup, auth, roles | Next.js, Prisma, PostgreSQL, Auth.js, permission map, ★ user management (admin creates staff, resets passwords, deactivates), ★ audit log, ★ document number sequences, env vars, migrations, seed |
| 2 | Customers | Create/edit/deactivate, search by name or phone, duplicate-phone warning, history page (orders, items out, outstanding) |
| 3 | Products & inventory | Categories, products (serialised or quantity), units, ★ stock adjustments (purchase, write-off, repair in/out), availability view, rate change with audit, ★ reconciliation check |
| 4 | Rental orders & issue | Create order, issue items (multi-product), ★ add items to an active order later, ★ admin backdating, ★ admin void of a wrongly entered issue line, order cancel |
| 5 | Returns | Partial/full returns across several events, condition (good/damaged/lost), damage/loss charge + note, ★ admin void of a return before invoicing |
| 6 | Billing engine & invoices | Pure engine, running statement (accrued to today), final invoice with snapshot, admin discount, ★ admin cancel and reissue |
| 7 | Payments & receipts | Advances, partial and final payments, refunds of excess, receipts, admin void, ★ customer outstanding across orders, PDFs (invoice, statement, receipt) |
| 8 | Dashboard & reports (admin) | Items out now, overdue-style long rentals, today's collections, outstanding; reports for inventory, customers, rentals, payments and collections |
| 9 | Localisation & settings | Complete the Malayalam translation, bilingual print labels, business settings, prefixes, terms, logo |
| 10 | Hardening & deployment | Security review, E2E suite, backup and restore scripts and a restore drill, deployment scripts for both options, handover guide |

i18n plumbing (next-intl, the language switch) is set up in Step 1, so every module is built with translation keys from the start. Step 9 completes and reviews the Malayalam text.

## 2. Workflow coverage check

| Daily workflow | Covered by |
|---|---|
| New customer walks in and takes items | 2 → 4 (+ advance in 7) |
| Existing customer takes more items while others are still out | 4 (add items to an open order, or open a new order) |
| Customer returns some items | 5 |
| Customer returns the remaining items, settles the bill | 5 → 6 → 7 |
| Item comes back damaged / lost | 5 (condition + charge), 3 (repair back to stock) |
| Customer asks "how much do I owe so far?" | 6 (running statement) |
| Customer pays part now, the rest later | 7 |
| Advance exceeded the bill | 7 (refund) |
| Wrong entry made by staff | 4/5/7 (admin void with reason, audit) |
| New stock purchased / item scrapped | 3 (stock adjustments) |
| Register entry done next morning | 4/5 (admin backdating of issues and returns; payments use the entry date) |
| Go-live with running paper rentals | 4 + 7 (admin backdated orders; advances recorded on the go-live day with the original date in the note) |
| Owner checks business at end of day | 8 |
| PC crash / data loss | 10 (backups, restore drill) |

## 3. Definition of done (every module)
- Server-side permission checks on every action.
- Zod validation, with errors translated (en/ml).
- Stock and money changes inside transactions, each with an audit row.
- Vitest coverage of the business operations, including the failure cases.
- `docs/modules/<module>.md` updated (screens, rules, permissions).
