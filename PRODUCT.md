# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Counter staff** at Sree Krishna Motors, an equipment-rental shop in Kerala. They issue items (generators, breakers, props, pipes, clamps), record returns, and take payments while the customer waits. They are not technical users.
- **The owner (admin)**, who checks the dashboard and reports, manages products, rates, users and settings, and handles cancellations, discounts and backdated entries.
- **Main device: a shop PC at the counter** (confirmed). Phones are for quick checks only. The app must still work on a phone.

## Product Purpose
Replaces the shop's paper rental register. It tracks what is out with whom, bills rent correctly (per day, calendar days inclusive), records advances, payments and refunds, and prints bilingual invoices, statements and receipts. Success means staff finish a counter transaction quickly without mistakes, and the owner can see at a glance what is out, what came in and who owes money.

## Operating Context
- Busy counter work: the customer is standing at the desk, so speed and clarity matter more than features.
- Printed slips (invoice, statement, receipt) go to customers, with Malayalam and English labels on every document.
- Hosting is undecided: a shop PC on the LAN or a cloud VPS. It must work offline on a LAN, so fonts are self-hosted.

## Capabilities and Constraints
- Customers, products (serialised and by-quantity), rental orders, issues, returns (good, damaged, lost), final invoices, payments (Cash, UPI, Bank Transfer, Cheque), refunds, a dashboard, reports with CSV export, users, settings and an audit trail.
- Roles: Admin and Staff (docs/01-requirements.md §6). Staff have no dashboard and land on Orders.
- Nothing with history is hard-deleted. Records are cancelled, voided or deactivated with a reason.
- Money is INR in exact paise, shown with Indian grouping (₹1,23,456.00). There is no GST.
- Full business rules: docs/01-requirements.md. Malayalam terms: docs/glossary-ml.md.

## Brand Commitments
- Business name: **Sree Krishna Motors**. There is no logo yet; a logo can be uploaded in Settings and appears on printed slips.
- Interface direction set by the owner (2026-11-07): **black sidebar, light pages, blue as the single accent colour**, modern and visually rich but user-friendly for local staff.

## Evidence on Hand
- Real shop data only. Never invent sample customers, figures or testimonials in the UI.

## Product Principles
1. The counter transaction comes first: the next step is always obvious, and staff should never have to hunt.
2. Use plain words in English and Malayalam that match the shop's own vocabulary.
3. Money and stock must be unmistakable: amounts, statuses and who owes what are readable at a glance.
4. Nothing is lost: history stays visible, and destructive actions are confirmed and explained.

## Accessibility & Inclusion
- **Malayalam must read well** (confirmed). Malayalam labels are often longer and taller than English, so layouts must allow wrapping without truncation and use a generous line-height (Noto Sans Malayalam).
- Standard WCAG AA contrast; full keyboard use on the PC.
