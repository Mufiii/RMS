# Module: Localisation & settings (Step 9)

Status: **built 2026-11-07** on branch `feature/step-9-settings`, awaiting demo sign-off. The Malayalam glossary (`docs/glossary-ml.md`) awaits the owner's confirmation.

## Settings `/settings` (admin only)

| Section | Fields | Where it shows |
|---|---|---|
| **Business** | Name (English, required) and Malayalam; address in both; phone numbers (as they should print); email | Top of every print slip, Malayalam first |
| **Document numbers** | Prefixes for orders, invoices, receipts, refunds, each with a live example (`ORD-0001`, `INV/2026-27/0001`) | New numbers only. Existing ones keep theirs; the count carries on without a gap. Invoice, receipt and refund numbers restart each financial year; order numbers never do |
| **Printing** | Paper width **80 mm** (standard) or **58 mm**; invoice terms in English and Malayalam | Slip width (screen, print and PDF); terms at the bottom of slips |
| **Dashboard** | Long rental after N days (1–365, default 30) | Dashboard "Long rentals" |
| **Logo** | PNG or JPEG, ≤ 300 KB; upload, replace, remove | Top of slips, in black and white for thermal paper |

A **"Last changed by … on …"** line sits under the title.

## Rules

- **Prefixes:** 1–10 letters, digits or hyphens, typed in any case and saved in upper case. "/" is not allowed, because it separates the parts of a number. **All four must differ**: receipts and refunds share one number column, so equal prefixes would collide. Checked in the form and by a database CHECK.
- **Logo:** the file type is decided from the file's **own bytes** (PNG/JPEG signatures), never from its name or the browser. An SVG renamed `.png` is refused. Oversized files are refused before they are read into memory.
  - The logo is **stored in the database**, so the nightly backup includes it, with nothing extra to copy.
  - It is served from `/api/logo` to signed-in users only, with `nosniff` and a locked-down CSP. Links carry `?v=<time>`, so a new logo shows at once.
- **Audit:** `SETTINGS_UPDATE` records exactly the fields that changed (before → after); saving with no change writes nothing. `LOGO_UPDATE` and `LOGO_REMOVE` are recorded too.

## Malayalam

- Every string has a Malayalam text (751 of 751). The i18n test fails the build if one is missing, empty or still English.
- A consistency scan keeps one word per idea, e.g. **ഉൽപ്പന്നം** (catalogue product) vs **സാധനം** (a piece out on rent). Five newer strings were corrected.
- `docs/glossary-ml.md` lists the key words, printed ones first, for the owner to confirm. Any corrections are a one-line change each.

## Database

- Migration `*_settings_screen`: replaces the unused `logo_path` with `logo_data` (bytea), `logo_mime` and `logo_updated_at`. It adds CHECKs: prefix format, all four prefixes distinct, business name not blank, logo type and size.
- Migration `*_settings_logo_check_fix`: tightens the logo CHECK. In the first version, logo bytes with a NULL type passed the check (a NULL `IN (...)` lets a CHECK through); a test caught it.

## Tests

- Vitest (+9): schema rules (prefix case, format, length, duplicates incl. case clashes, widths, thresholds, email, blank name); the audit records only changed fields; no-op saves write nothing; a new prefix applies to new numbers while the count continues; DB CHECKs without the form; logo type detection from bytes (SVG and GIF refused), size limit, replace and remove with audit; DB logo CHECKs.
- Playwright (+3, `workspace-settings.spec.ts`, runs last): prefix example and duplicate error; save → dashboard threshold follows; logo upload refuses a fake PNG, accepts a real one, prints on the receipt with the Malayalam name and phone, then is removed; staff get 403; signed-out visitors can't fetch the logo.
- Dev-mode smoke: settings save, logo upload, statement PDF with logo, logo removal, dashboard; no errors or reloads.
