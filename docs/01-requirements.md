# Sree Krishna Motors – Rental Management System
## Confirmed Business Requirements

Status: all rules confirmed with the client on 2026-11-05 (two rounds). No open assumptions remain except those listed in §9.

Change control: none of the rules below may be changed without the client's explicit approval. Record every change in §10.

---

### 1. Rates & billing

| Rule | Decision |
|---|---|
| Rate type | **Per day only.** Each product has one daily rate. |
| Day counting | **Calendar days, inclusive.** Issued 5 Nov, returned 7 Nov = 3 days. Same-day return = 1 day. Dates are in Asia/Kolkata. |
| Sundays | **No special handling.** Sundays are billed like any other day. |
| Rate override | **Never.** The product's standard rate is always used, with no per-order or per-customer rates. |
| Rate change during an active rental | **Confirmed:** the daily rate is snapshotted on the issue line when the item is issued. Later product rate changes do not affect existing rentals. |
| Rent formula | `rent = quantity × daily_rate × days` for each returned batch. |
| Partial returns | Each returned quantity is charged for its own days (from its issue date to its return date). |
| Extra charges | **Damage/loss only.** Staff enter a manual amount with a note. There are no transport, labour or fuel charges. |
| Discounts | **Confirmed:** one fixed amount per invoice, with a mandatory reason. Admin only. |
| GST / tax | **None.** Plain bills with no tax fields. |
| Currency | INR. Stored as exact `NUMERIC(12,2)`, and all arithmetic is done in integer paise, so there is never floating-point rounding. Rates have at most 2 decimals, so rent never needs rounding. |

### 2. Advance & payments

- Customers pay **advance rent** when they take items. The advance is deducted from the final bill.
- Payments (advance, partial, final) are **tied to one rental order**. The balance is tracked per order, and the customer's total outstanding is the sum across their orders.
- A customer can pay several times. Each payment produces a **receipt**.
- **Confirmed:** payment modes are Cash, UPI, Bank Transfer and Cheque.
- **Confirmed:** any excess advance after final billing is recorded as a refund. A refund cannot exceed the excess. Staff and admin can record refunds.

### 3. Invoices

- A **running statement** for an open order can be printed at any time. It shows rent accrued to date (for items still out, counted up to today), advances and the balance.
- A **final invoice** is generated when the order is closed (all items returned and charges finalised).
- Historical invoices, payments and transactions are never hard-deleted. Cancellations are recorded with a reason (admin only).

### 4. Inventory

- **Mixed model:**
  - **Serialised products** (e.g. generators, breakers): each unit has its own ID or serial and is issued and returned individually.
  - **Quantity products** (e.g. props, pipes, clamps): tracked by count only.
- Available stock updates automatically on issue and return.
- Unit statuses: Available, Rented, Under repair, Lost/Retired.

### 5. Orders

- One customer can have many orders, and one order can contain many products.
- Items can be added to an active order later (a new issue, with its own issue date).
- Items can be returned partially or fully, across several return events.

### 6. Users & roles

| Capability | Admin | Staff |
|---|---|---|
| Add/edit customers, view customer details & history | ✅ | ✅ |
| Create orders, issue items, record returns | ✅ | ✅ |
| Record payments & refunds, generate receipts, print statements | ✅ | ✅ |
| Edit products, rates, settings | ✅ | ❌ |
| Apply discounts / waive amounts | ✅ | ❌ |
| Cancel/void orders, issue lines, invoices, payments (never hard-deleted) | ✅ | ❌ |
| Backdate issue / return dates | ✅ | ❌ |
| Dashboard | ✅ | ❌ (no dashboard at all) |
| Reports | ✅ | ❌ |
| Manage users | ✅ | ❌ |

### 7. Platform

- Responsive web app for desktop and mobile, in Malayalam and English.
- Hosting is **not decided yet**. The app must deploy either on a shop PC (LAN) or on a cloud VPS without code changes.
- PDF invoices and receipts, plus database backup and restore.

### 8. Additional confirmed decisions (round 3, 2026-11-05)

| Topic | Decision |
|---|---|
| Go-live data | Running rentals from the paper register are entered as **normal orders with their real past issue dates**, by the admin (this uses backdating). Advances already paid are recorded as payments **dated on the go-live day**, with the original payment date and register reference in the payment note. |
| Backdating | **Admin only.** Staff entries always use today's date (Asia/Kolkata). Every backdated entry is written to the audit log. Future dates are never allowed. |
| Backdating scope | **Issue and return dates only.** Payment dates are never backdated; every payment uses today's date (Asia/Kolkata). |
| Refunds | **Staff and admin.** Allowed only when the order's final invoice exists and the amount paid exceeds the invoice total; refund ≤ excess. |
| Printed documents | **Bilingual** (Malayalam + English labels) on invoices, statements and receipts, whatever language the interface is in. |

### 9. Derived rules (follow from the confirmed rules; listed for transparency)

- Each return line records a condition. **Good:** back to available stock. **Damaged:** goes to "under repair" stock and an optional damage charge can be added. **Lost:** removed from owned stock; staff enter the loss charge (manual amount) and a note is required.
- Under-repair stock is moved back to available by the admin (stock adjustment).
- A final invoice can be generated only when every issued item is returned (or marked lost).
- Staff generate final invoices without a discount. To add a discount after an invoice exists, the admin cancels the invoice (with a reason) and issues a new one, which gets a new number. Cancelled invoices remain visible.
- After the final invoice, an incoming payment cannot exceed the balance due. Before the invoice, advances are not limited.
- Customers and products are never deleted, only deactivated. Inactive records stay in history.
- Invoice and receipt numbers are sequential and gap-free per Indian financial year (April–March), e.g. `INV/2026-27/0001`, `RCP/2026-27/0001`. Prefixes can be changed in Settings.
- Out of scope for v1 unless requested: advance bookings/reservations for future dates, GST, per-customer rates, transport/labour/fuel charges.

### 10. Change log

| Date | Change | Approved by |
|---|---|---|
| 2026-11-05 | Initial rules (rounds 1–2), 5 assumptions confirmed | Client |
| 2026-11-05 | Go-live data, backdating, refunds, document language | Client |
| 2026-11-06 | Backdating limited to issue and return dates. Payments always use today's date; go-live advances are recorded on the go-live day with the original date in the note | Client |
