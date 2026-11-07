# Module: Payments, receipts & printing (Step 7)

Status: **released in v0.7.0** (2026-11-07).

## Screens

| Where | Who | What |
|---|---|---|
| **Payments** card (order page) | everyone | Every payment and refund: receipt number (opens the receipt), type, mode, reference, date, who took it, note. Voided ones are struck through with who and why. Then a summary: rent so far (open) or invoice total (closed), received, refunded, **balance due** / **excess paid** / **fully paid** |
| **Record advance / payment** (order page) | admin, staff | Amount, paid by (cash, UPI, bank transfer, cheque), reference, note. Open orders: "Record advance", any amount. Invoiced orders: "Record payment", with the balance due shown. Hidden once fully paid. After saving, a banner shows the receipt number with **Print** and **PDF** |
| **Refund excess** (order page) | admin, staff | Shown only when the invoice exists and more than the total was paid. Up to the excess |
| **Void a payment** (order page) | admin | Pick the payment, give a reason |
| **Running statement** (order page) | everyone | Now also shows money received and the balance, with **Print** and **PDF** |
| **Invoice page** | everyone | **Print** / **PDF** buttons. Received, refunded and balance against the live invoice |
| **Customer page → Outstanding balance** | everyone | **Billed, still due** (final invoices), **open orders so far** (rent to today − advances), **paid in excess** (refundable), with a line per order |
| **Payments** (menu) | admin, staff | One day's collections (today by default, any past day can be picked): totals in and out per mode, the net, and every receipt and refund with customer and order |
| **Print slips** `/print/invoice/[id]`, `/print/statement/[orderId]`, `/print/receipt/[id]` | as above | Thermal roll slips (80 mm, or 58 mm from Settings), **bilingual labels** (Malayalam + English) whatever the screen language, the business header from Settings, terms, and a "CANCELLED" / "VOID" banner when relevant. The invoice prints from its snapshot |
| **PDF** `/api/pdf/{invoice,statement,receipt}/[id]` | as above | The same slip as a PDF, sized to the roll and as long as the content, for sharing on WhatsApp |

## Rules

- **Type is automatic.** Before the final invoice (including after an invoice is cancelled and the order re-opens), money in is an **ADVANCE** and isn't limited. Once the invoice exists, it is a **PAYMENT** and can't exceed the balance due. A fully paid order takes no more.
- **Refunds** (staff and admin) only when the final invoice exists and the money received exceeds it, and never more than the excess. They get their own number series.
- **Numbers:** receipts `RCP/2026-27/0001`, refunds `RFD/2026-27/0001`. Each series is gap-free per financial year, with prefixes from Settings.
- **Dates:** always today (Asia/Kolkata). Payments are never backdated (docs/01 §8).
- **Cheques** need the cheque number in Reference (form, and a DB CHECK).
- **Void** (admin, reason): never deletes. Money in can't be voided while a refund depends on it (the refunds would exceed the excess): void the refund first.
- **Concurrency:** the order row is locked, so two payments at once can never together exceed the balance.
- **With other modules:** an order with active payments can't be cancelled (void them first). Payments survive an invoice cancel and count against the reissued invoice; a discount on reissue can create an excess to refund.
- **Balance:** `balance = (invoice total, or rent so far while open) − received + refunded`, computed by the pure engine, never stored.

## Permissions

`payment.create`, `refund.create` and `receipt.print` for admin and staff; `record.void` for admin only. Print pages and PDFs check the same permissions as the document they show.

## PDFs: how it works

One shared headless Chromium (Playwright) opens our own print page **over loopback** (`http://127.0.0.1:$PORT`, or `INTERNAL_BASE_URL`), forwarding the caller's session cookie so the page runs its normal permission checks. It then measures the slip and saves a PDF of exactly that size. The URL is never taken from the request's `Host` header (that would allow SSRF). The server needs `npx playwright install chromium` (docs/04).

## Audit actions

`PAYMENT_CREATE`, `REFUND_CREATE` (receipt number, type, mode, amount) and `PAYMENT_VOID` (reason), all recorded on the order.

## Database (migration `*_payments`)

Table `payments` as in docs/03. CHECKs: amount > 0; void fields; cheques carry a reference. A trigger blocks deletes, and allows only one change: ACTIVE → VOIDED, with the void fields set.

## Tests

- Vitest (+15): advances unlimited, dated today, numbered; payment ≤ balance and nothing-due; cancelled order; concurrent payments; input rules; refunds only after the invoice and ≤ excess, own series; void frees the balance; void-refund-first rule (incl. partial cases); order cancel blocked by payments; payments across invoice cancel/reissue; advance after re-open; DB backstops; customer outstanding across orders.
- Playwright (+7, `takings.spec.ts`): advance → statement balance → bilingual receipt; over-balance and cheque-number errors, UPI payment → fully paid; admin void → reissue with discount → refund limits → refund; day's collections per mode; customer outstanding; bilingual invoice and statement slips and a real PDF download; signed-out PDF refused.
- Dev-mode smoke (fresh cache, test DB): every new page, an advance, a statement PDF; no errors or reloads.
