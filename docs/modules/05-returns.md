# Module: Returns (Step 5)

Status: **built 2026-11-06**, awaiting demo sign-off.

## Screens (on the order page, `/orders/[id]`)

| Part | Who | What |
|---|---|---|
| **Record return** | admin, staff | One box per item still out. For counted items, type how many came back **Good / Damaged / Lost**. For a serial unit, choose Not returned / Good / Damaged / Lost. Damaged or lost pieces show a **charge (₹)** and a **note** field. "All back in good condition" fills everything in one tap. Admins also get a **Return date** (backdating) |
| **Returns** history | everyone | Every return: date, who received it, each piece with its condition, days, **rent** and charge, notes. Voided returns are struck through with who and why |
| **Void a return** | admin | Pick the return, give a reason |
| Banner | | "Everything on this order has been returned" once nothing is out. The final invoice is generated from here (Step 6) |

## Rules

- **Partial returns** over any number of visits. Each returned batch is charged for its own days: `days = return date − issue date + 1` (calendar-inclusive, same day = 1, Sundays count) and `rent = quantity × the line's snapshot rate × days`, in exact paise. The database re-checks `rent_amount = quantity × daily_rate × days`.
- **Never more than is out:** checked under row locks, with the DB CHECK `qty_returned ≤ quantity` as backstop. Concurrent returns of the same pieces can't over-return. A return is all-or-nothing: if one line fails, nothing is saved.
- **Condition → stock** (docs/01 §9):
  - **Good:** back to available (`qty_out −= n`; unit → AVAILABLE)
  - **Damaged:** to repair (`qty_out −= n`, `qty_repair += n`, ledger row `RETURN_DAMAGED`; unit → UNDER_REPAIR). Optional damage charge, **note required**. The admin later uses "Repair done" (Step 3) to bring it back
  - **Lost:** written off (`qty_out −= n`, `qty_owned −= n`, ledger row `RETURN_LOST`; unit → LOST). Loss charge (may be ₹0, e.g. if replaced), **note required**
  - Good pieces can't carry a charge (DB CHECK). Return ledger rows always point at their return line (DB CHECK).
- **Dates:** staff use today. Admins may backdate (audited as `BACKDATE`). Never a future date, never before the line's issue date.
- **Void a return** (admin, reason): while the order is open and has no live invoice (Step 6). It reverses everything: quantities go back onto the issue lines, units back to RENTED, and **reversing ledger rows** are appended (the ledger is append-only). It is **refused if the pieces have moved on since**, i.e. re-issued to someone else, repaired, scrapped or written off, so a unit can never be counted twice. Voided returns are kept.
- An issue line that has returns can't be voided (Step 4). Void its returns first.

## Billing engine (started here, `src/modules/billing/engine.ts`)

Pure functions, no database, no clock: `days(issueDate, returnDate)` and `lineRent(qty, ratePaise, days)`. Step 6 adds accrual for running statements, invoice totals, discounts and balances.

## Audit actions

`RETURN_CREATE` (lines with condition, days, rent, charge, plus the rent total), `BACKDATE`, `RETURN_VOID`.

## Database (migration `*_returns`)

Tables `returns` and `return_lines` as in docs/03, plus `stock_movements.return_line_id`. CHECKs: void fields; quantity > 0; days ≥ 1; rate > 0; the **rent formula**; charge ≥ 0; good means no charge, damaged/lost need a note; return-type ledger rows ⇔ return line link.

## Tests

- Vitest (25 new): the engine (day counting incl. month, year and leap boundaries, Sundays, the requirements' 5 → 7 Nov = 3 days example; exact paise); partial returns with their own days; mixed good/damaged/lost and the ledger rows; serial unit statuses; over-return and all-or-nothing; notes and charges; DB arithmetic and over-return backstops; date rules; voided or foreign lines; concurrent returns; void reversal with a re-return; void refused after re-issue, repair or write-off; void-return-then-void-issue-line.
- Playwright (7 new, `returns.spec.ts`): mixed return with charges; server over-return check; stock effects; "all back in good"; admin void; backdated return with rent for 3 days and the before-issue rule; stock check.
- Dev-mode smoke (fresh cache, test DB): record → void → pages → stock check, no reloads, no errors. Read-only check on the user's server after the schema change.
