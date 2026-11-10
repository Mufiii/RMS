# Architecture – Sree Krishna Motors Rental Management System

Status: **APPROVED** (2026-11-06). No application code exists yet.

---

## 1. Style: modular monolith

One Next.js application contains the UI, the server logic and the PDF generation, backed by one PostgreSQL database. There is no separate API service and no FastAPI.

**Why:** there is one shop with a handful of users and a small data volume. A single deployable unit is the easiest thing to install on a shop PC, back up, and hand over. Business logic lives in modules with clear boundaries, so a separate service could still be split off later if a genuine need appears (none is expected).

## 2. Technology stack (final)

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router) + TypeScript (strict) | `output: "standalone"`. **Cache Components is off**: every screen is per-user and must show live stock and money, so request-time rendering is the safer model. |
| UI | Tailwind CSS + shadcn/ui | Mobile-first layouts |
| Backend | Server Actions (all mutations from forms), Route Handlers (PDF download, health check) | |
| Database | PostgreSQL 18 | Same major version in dev, shop PC and VPS |
| ORM | Prisma 7 (driver adapter `@prisma/adapter-pg`) | Migrations via `prisma migrate`; raw SQL only where Prisma cannot express something (row locks, CHECK constraints, partial indexes) |
| Auth | Own small session layer: username + password, signed JWT (`jose`, HS256) in an httpOnly cookie | bcrypt hashes (`bcryptjs`, cost 12). Chosen over Auth.js v5, which is still beta and discourages the Credentials provider (decided 2026-11-06). |
| Validation | Zod | One schema per input, shared by the form and the server action |
| i18n | next-intl, **without** locale URL prefixes | The locale comes from the user's preference (stored on the user, mirrored in a cookie). Internal app, no SEO concerns. |
| PDF | HTML print pages rendered by Playwright (headless Chromium) | Correct Malayalam shaping; the same page can also be printed from the browser |
| Fonts | Noto Sans Malayalam + Inter, **self-hosted** | Works offline on a LAN |
| Unit tests | Vitest | Billing engine, permissions, services (against a test database) |
| E2E tests | Playwright | Login, issue → return → invoice → payment flows |

Deliberately **not** used: Docker (not installed, and adds operational weight on a shop PC), Redis, a separate API server, a state-management library, or an external PDF service.

## 3. Layering inside a module

```
UI (Server Components / client forms)
   │  calls
   ▼
actions.ts   ← Server Actions: authenticate → authorize → Zod-validate → call service → revalidate
   │
   ▼
service.ts   ← Business rules + database transactions. Takes (tx, actor). No HTTP or UI concerns.
   │
   ├── billing/engine.ts  ← PURE functions (no DB, no clock): days, rent, invoice totals, balances
   ▼
Prisma (PostgreSQL)
```

Rules:
1. **Only services write to the database.** Pages read through each module's `queries.ts`.
2. **Every server action checks permissions on the server.** Hiding a button is never the security boundary.
3. **The billing engine is pure.** "Today" is passed in as an argument, which makes rent calculations fully unit-testable.
4. **Domain errors** (e.g. `InsufficientStockError`) are typed and mapped to translated messages. Raw database errors never reach the user.

## 4. Folder structure

```
rental-management-system/
├─ docs/                          # requirements, architecture, database, deployment, module docs
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/                 # includes hand-written SQL for CHECKs / partial indexes
│  └─ seed.ts
├─ public/fonts/                  # self-hosted Noto Sans Malayalam, Inter
├─ src/
│  ├─ app/
│  │  ├─ (auth)/login/
│  │  ├─ (app)/                   # authenticated shell (sidebar / bottom nav)
│  │  │  ├─ dashboard/            # admin only
│  │  │  ├─ customers/
│  │  │  ├─ products/             # incl. units & stock adjustments
│  │  │  ├─ orders/               # order detail: issue, return, statement, invoice, payments
│  │  │  ├─ payments/
│  │  │  ├─ reports/              # admin only
│  │  │  ├─ users/                # admin only
│  │  │  └─ settings/             # admin only
│  │  ├─ print/                   # bare print layouts: invoice, statement, receipt
│  │  └─ api/
│  │     ├─ pdf/[doc]/[id]/       # Playwright renders /print/... → PDF
│  │     └─ health/
│  ├─ modules/
│  │  ├─ auth/  users/  customers/  products/  inventory/
│  │  ├─ orders/  returns/  billing/  invoices/  payments/
│  │  ├─ reports/  settings/  audit/
│  │  └─ <module>/{schema.ts, service.ts, actions.ts, queries.ts, components/, *.test.ts}
│  ├─ lib/
│  │  ├─ db.ts            # Prisma client singleton
│  │  ├─ action.ts        # form-state helpers, error → translated message
│  │  ├─ permissions.ts   # role → permission map, requirePermission()
│  │  ├─ money.ts         # Decimal ⇄ paise, formatting (₹1,23,456.00)
│  │  ├─ dates.ts         # Asia/Kolkata "business date", financial year
│  │  ├─ sequences.ts     # gap-free document numbers
│  │  ├─ tx.ts            # transaction helper + row-lock helpers
│  │  └─ errors.ts
│  ├─ components/ui/       # shadcn
│  └─ i18n/  messages/en.json  messages/ml.json
├─ tests/e2e/
├─ scripts/                # backup / restore (bash + PowerShell), create-admin
├─ .env.example
└─ package.json
```

## 5. Authentication & authorization

- **Login:** username + password, hashed with bcrypt (cost 12). Login attempts are rate-limited per username and IP (in-memory, which is enough for a single instance).
- **Session:** a signed JWT (`{ uid, sv }`) in an httpOnly cookie with an 8-hour lifetime. On **every request** the server reloads the user and checks `is_active` and `session_version`. A password reset, password change, role change or deactivation bumps `session_version`, so that user's existing sessions end immediately.
- **Authorization:** one permission map in `lib/permissions.ts`, for example:

| Permission | Admin | Staff |
|---|---|---|
| `customer.read/write` | ✅ | ✅ |
| `order.create`, `issue.create`, `return.create` | ✅ | ✅ |
| `invoice.create` (no discount), `statement.print` | ✅ | ✅ |
| `payment.create`, `refund.create`, `receipt.print` | ✅ | ✅ |
| `product.write`, `rate.write`, `stock.adjust` | ✅ | ❌ |
| `invoice.discount`, `*.void`, `*.cancel` | ✅ | ❌ |
| `date.backdate` (issue and return dates only) | ✅ | ❌ |
| `dashboard.view`, `report.view`, `user.manage`, `settings.write` | ✅ | ❌ |

- **Enforcement points:** `proxy.ts` (optimistic: session cookie present?) → page guard (`requirePagePermission`, else the 403 page) → server action guard (`requireActionPermission`, always). Staff land on Orders, not the Dashboard.
- **Bootstrap:** the first admin account comes from the seed script, using env vars for the username and initial password. It must be changed on first login.

## 6. Transactions & concurrency

The principle is that **every stock or money change happens inside one PostgreSQL transaction, together with its audit row.** Correctness is guaranteed in three layers:

1. **Row locks.** `SELECT … FOR UPDATE` on the rows being changed, always locked in ascending id order to avoid deadlocks.
2. **Application checks** run after locking, so error messages can be friendly (e.g. "Only 3 Props available").
3. **Database CHECK constraints and unique indexes are the final backstop.** Even a bug cannot oversell stock or over-return an item.

Isolation level: READ COMMITTED (the PostgreSQL default) is enough, because of the explicit locks.

| Operation | Inside the transaction |
|---|---|
| **Issue items** | Lock the order (must be OPEN) → lock product rows → check `available ≥ qty` → for serialised items, lock unit rows and require `AVAILABLE` → insert Issue + IssueLines (with the rate snapshot) → `qty_out += n`; units → `RENTED` → audit |
| **Record return** | Lock the order → lock issue lines → check `returned + qty ≤ issued` → the billing engine computes days and rent → insert Return + ReturnLines → `issue_line.qty_returned += n` → stock by condition (GOOD: `qty_out −= n`; DAMAGED: `qty_out −= n`, `qty_repair += n`; LOST: `qty_out −= n`, `qty_owned −= n`, plus a LOST stock movement) → unit status → audit |
| **Final invoice** | Lock the order → require OPEN and every line fully returned → take the next number from `number_sequence` (row-locked, so numbering is gap-free) → snapshot customer + lines + totals → order → CLOSED → audit |
| **Payment / refund** | Lock the order → validate (amount > 0; after the invoice, payment ≤ balance; refund ≤ excess) → next receipt number → insert Payment → audit |
| **Void / cancel** (admin) | Lock the target + order → require a reason → set status VOIDED/CANCELLED (never delete) → reverse the stock effects where relevant → audit |
| **Stock adjustment** (admin) | Lock the product → insert StockMovement → update counters (CHECK enforced) → audit |

Invoice, receipt and refund numbers use a `number_sequences` row per (document type, financial year); order numbers use one all-time row (`ORDER`, `ALL`) so `ORD-0001` is never repeated. Each is upserted with `RETURNING` inside the same transaction. A rollback also rolls back the number, so there are never gaps.

**Why stock counters rather than computing availability every time:** counters on `product` (`qty_owned`, `qty_out`, `qty_repair`) are updated only inside these transactions and protected by `CHECK (qty_out + qty_repair <= qty_owned)`. That gives a hard database guarantee and fast queries. The full history stays in the issue, return and stock-movement tables, and a reconciliation test (and a hidden admin check) recomputes the counters from that history to prove they agree.

## 7. Billing engine (pure)

```
days(issueDate, returnDate)        = (returnDate − issueDate) + 1        // calendar-inclusive, min 1
lineRent(qty, ratePaise, days)     = qty × ratePaise × days              // integer, exact
accruedRent(openLine, today)       = qtyOutstanding × rate × days(issueDate, today)   // statements only
invoiceTotal                       = Σ rent + Σ damage − discount
balance                            = invoiceTotal − Σ payments + Σ refunds
```

- There is no Sunday logic, by explicit requirement.
- The rate comes from the issue-line snapshot, never from the current product.
- Return dates before the issue date are rejected. Future dates are rejected.
- The engine works in integer paise (a JS `number`, which is exact up to ₹90 trillion). Conversion to and from `NUMERIC(12,2)` happens only at the database boundary.

## 8. Documents (PDF)

- **Output format: thermal roll slips.** All three documents (final invoice, running statement, payment receipt) print on a thermal receipt printer. The default is **80 mm (3 inch) paper, about 72 mm printable**, single column, with continuous length (a long invoice is just a longer slip). The paper width is a **business setting** (`print.paperWidthMm`, default 80), so 58 mm or an A4 layout can be added later without code restructuring.
- `/print/invoice/[id]`, `/print/statement/[orderId]` and `/print/receipt/[id]` are plain, print-optimised React pages with bilingual labels. CSS uses `@page { size: <width>mm auto; margin: 0 }` and a fixed content width. Item rows are laid out to fit the narrow width: name on one line, then qty × rate × days = amount on the next.
- **Printing goes through the OS printer driver** (Windows or Android system printing), never raw ESC/POS, because ESC/POS cannot render Malayalam script. This works whether the printer is USB, Bluetooth or network attached; the connection type is not decided yet and does not affect the code.
- `/api/pdf/[doc]/[id]` checks permissions, then reuses one shared Playwright browser that opens the print page (forwarding the user's session cookie) and returns `page.pdf()` at the configured roll width (for sharing on WhatsApp, etc.). Users normally just press Print in the browser.
- Invoices are rendered from their **stored snapshot**, so an old invoice always reprints exactly as it was issued.

## 9. Internationalisation

- `messages/en.json` and `messages/ml.json`. Each user picks a language, and it is switchable from the header.
- Numbers and currency always use Indian grouping (`en-IN`). Dates use DD-MM-YYYY.
- Printed documents use bilingual labels, independent of the UI language.
- Customer and product names are stored as typed (no translation). Products get an optional `name_ml` field for the Malayalam display name.

## 10. Audit trail

The `audit_log` table records actor, action, entity, entity id, a before/after JSON summary, the reason and a timestamp. It is written in the same transaction as the change, for every create, void, cancel, backdate, discount, stock adjustment, rate change and user change. Admins can view it.

## 11. Testing strategy

| Layer | What | Tool |
|---|---|---|
| Billing engine | Day counting (same day, month and year boundaries, leap day), partial returns, accrual, discounts, refunds, balances | Vitest (pure) |
| Services | Issue/return/invoice/payment against a **real PostgreSQL test database**: overselling blocked, over-return blocked, concurrent issues on the last unit (exactly one succeeds), gap-free numbering, voids reverse stock, permissions enforced | Vitest + test DB, truncated per test |
| E2E | Login per role, staff cannot reach admin pages, the full rental cycle, PDF download | Playwright |

## 12. Deployment

See `04-deployment.md`.
