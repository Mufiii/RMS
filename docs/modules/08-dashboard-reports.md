# Module: Dashboard & reports (Step 8)

Status: **released in v0.8.0** (2026-11-07).

Admin only. Staff have no dashboard and no reports: pages show the 403 page, and the CSV endpoint answers 403. Staff land on Orders.

## Dashboard `/dashboard`

Five summary tiles, three charts, then two tables.

| Tile | Figure | Sub-lines |
|---|---|---|
| **Total Rental Items** | Pieces owned | available · on rent; rent so far on open orders |
| **Total Customers** | Active customers | new since the 1st of this month (IST), as `+N this month` |
| **Active Rentals** | Open orders | orders with an overdue line (out at least the threshold); billed unpaid |
| **Today's Collection** | Money in − refunds today | invoices issued today and their billed total; refunds when any |
| **This Month's Collection** | Money in − refunds, month to date | % vs **the same number of days** of last month (shows "No last-month data" when last month had nothing) |

Tile sub-lines are kept to about three words each so they never wrap into long text.

| Chart | What |
|---|---|
| **Rental status** | Every piece owned: available, on rent, out too long (the threshold), under repair |
| **Money collected, last 6 months** | Net per month (money in − refunds), current month highlighted |
| **Revenue by item** | Rent + damage billed on **issued** invoices in the last 6 months, per product (snapshot name), top 4 + Others. **Before discounts**; the discount total is shown under it |

| Table | What |
|---|---|
| **Recent rentals** | Latest 6 issue lines: order, customer, item, from, to, state (out, part returned, returned, too long) |
| **Overdue rentals** | Items out for the threshold or more, **oldest first**: customer, item, out since, days out (issue day = day 1, as for rent), rent so far, and a Call link. Rentals have no due date, so age is the signal to follow up |

Revenue means money collected everywhere except the item chart, which can only be traced to invoices.

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
