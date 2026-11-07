# Module: Dashboard & reports (Step 8)

Status: **released in v0.8.0** (2026-11-07).

Admin only. Staff have no dashboard and no reports: pages show the 403 page, and the CSV endpoint answers 403. Staff land on Orders.

## Dashboard `/dashboard`

| Part | What |
|---|---|
| **Items out now** | Pieces out across open orders, and how many open orders. Opens the open-orders list |
| **Collected today** | Net money today (money in − refunds), the number of receipts and the refunds. Opens Payments |
| **Billed, still due** | Unpaid balance on final invoices, and how many customers owe. Shows "paid in excess (refundable)" when any |
| **Open orders so far** | Rent accrued to today on open orders, minus their advances |
| **Long rentals: 30+ days out** | Every item out for the threshold or more, **oldest first**: customer (links to the customer), product, quantity or serial, days out (issue day = day 1, as for rent), order, rent so far, and a tap-to-call phone number. Rentals have no due date, so age is the signal to follow up |
| **Collections, last 7 days** | Net per day as plain bars (no chart library), with a link to the Collections report |

The **threshold** is `settings.long_rental_days` (default **30**, CHECK 1–365; confirmed with the client 2026-11-07). Its edit screen comes with Settings in Step 9.

## Reports `/reports`

One tab per report. Each shows a table with a totals line and has a **Download CSV** button with exactly the same data.

| Report | Range | Columns |
|---|---|---|
| **Inventory** | now | Category, product, code, tracking, active, rate, owned, out, in repair, available, out % (+ totals) |
| **Customers** | as of today | No., name, phone, active, orders, open orders, items out, billed due, open so far, excess paid, last order (+ totals) |
| **Rentals** | orders opened in the range | Order, opened, customer, phone, status, pieces issued, still out, invoice, invoice total, received (net) |
| **Payments** | payment date in the range | Date, receipt, type, mode, customer, order, reference, in, out, status, by. **Voided rows are listed (struck through) but never totalled** |
| **Collections** | per day in the range | Cash, UPI, bank, cheque, refunds, net. Days without money are skipped |

- **Range:** `From` / `To`. The default is this month so far. It is never in the future and covers at most a year; out-of-order dates are corrected.
- **CSV:** UTF-8 with a BOM, so Excel shows ₹ and Malayalam correctly. Amounts are plain numbers (`1234.50`) and dates DD-MM-YYYY, with headers in the user's language. Text starting with `= + - @` gets a leading `'`, so a typed name can never run as a spreadsheet formula (CSV injection). Status, type and mode codes are translated; people's and products' names never are.
- The money figures come from the same pure billing engine and the same balance queries as the order and customer pages, so the numbers always agree.

## Database (migration `*_long_rental_days`)

`settings.long_rental_days INT NOT NULL DEFAULT 30`, `CHECK (long_rental_days BETWEEN 1 AND 365)`.

## Tests

- Vitest (+15): CSV formatting, quoting, BOM, formula neutralising, Malayalam; date helpers; the long-rental boundary (day 30 flagged, day 29 not) and partial returns; dashboard sums and the Settings threshold; each report's rows and totals (voided money listed but not counted, refunds off the net); range parsing.
- Playwright (+4, `views.spec.ts`): a 35-day rental flagged with a tel: link, and today's ₹700 net; every report tab including a date range; CSV download (file name, BOM, headers, plain-number totals); staff locked out of pages and CSV.
- Dev-mode smoke (fresh cache, test DB): the dashboard, all five reports and CSVs; no errors or reloads.
