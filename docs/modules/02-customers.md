# Module: Customers (Step 2)

Status: **built 2026-11-06**, awaiting demo sign-off.

## Screens

| Path | Who | What |
|---|---|---|
| `/customers` | admin, staff | Search box (name, phone or customer number), Active / Inactive / All filter, 30 per page, a tap-to-call button on every row. If nothing is found for a phone number, "New customer" opens with that number filled in |
| `/customers/new` | admin, staff | Name and phone (required); alternate phone, address, ID proof type and number, notes (optional) |
| `/customers/[id]` | admin, staff | Details, call button, rental history (orders, items out and outstanding are placeholders until Steps 4 and 7), list of changes, deactivate / reactivate |
| `/customers/[id]/edit` | admin, staff | Same form as New |

## Rules

- **Customer number** = the database id, shown as `#12`. Search accepts `#12` or `12`.
- **Phone numbers** are stored as digits only. `+91`, `91`, `091` and the leading `0` of a mobile number are removed, so `+91 98470-12345`, `098470 12345` and `9847012345` are all the same number. Landlines keep their STD code (`04842345678`). 6–15 digits are allowed. Indian mobiles are displayed as `98470 12345`.
- **Duplicate phone warning:** if the main or alternate number is already used by another customer (in either field, active or inactive), the form lists the matches and saves only after "It's a different person — save anyway" is ticked. Phone numbers are not unique, because family members share them (docs/03 §customers). When editing, only numbers that are new on that customer are checked.
- **ID proof** types: Aadhaar, Driving licence, Voter ID, PAN card, Passport, Other. Optional (confirmed 2026-11-06). A number can't be entered without a type.
- **Never deleted, only deactivated.** Staff and admins can deactivate or reactivate, with an optional reason. Inactive customers stay in search under the Inactive / All filters and keep their history. Planned follow-ups for Step 4: an inactive customer can't be given a new order, and a customer with items still out can't be deactivated.
- Search: name matches any part, case-insensitively. Phone matches any part of either number (at least 3 digits), typed with or without spaces or `+91`.

## Audit actions

`CUSTOMER_CREATE` (records whether a duplicate phone was confirmed), `CUSTOMER_UPDATE` (only the changed fields, before and after; nothing is written if nothing changed), `CUSTOMER_DEACTIVATE`, `CUSTOMER_REACTIVATE` (with the reason).

## Database

Table `customers` (migration `*_customers`): indexes on `phone`, `alt_phone` and `lower(name)`. CHECK constraints: the name is not blank, phones are 6–15 digits, and an ID proof number needs a type. The creator foreign key is `ON DELETE RESTRICT`.

## Tests

- Vitest: phone normalisation, schema validation (translation keys), create with audit, the duplicate warning and confirmation, updates audit only changed fields, no-op edits write nothing, deactivate/reactivate, search by name/phone/number/status. Also a check that English and Malayalam have the same keys and no untranslated values.
- Playwright: add a customer, validation keeps typed values, the duplicate-phone confirmation, search plus prefilled new customer, edit, deactivate/reactivate with filters, Malayalam detail page.
