@AGENTS.md

# Sree Krishna Motors – Rental Management System

Next.js 16 (App Router) + Prisma 7 + PostgreSQL 18, one modular monolith for one shop.
Read the docs before changing behaviour: [requirements](docs/01-requirements.md),
[architecture](docs/02-architecture.md), [database](docs/03-database-design.md),
[plan](docs/05-implementation-plan.md), per-step specs in [docs/modules/](docs/modules/),
Malayalam terms in [glossary-ml.md](docs/glossary-ml.md).

## Commands

- `npm run dev` · `npm run lint` · `npm run typecheck` · `npm test` (Vitest) · `npm run test:e2e` (Playwright)
- `npm run db:migrate` after editing `prisma/schema.prisma`; the client is generated into `src/generated/prisma` (don't edit it).
- CI runs lint, typecheck, unit tests and e2e on every PR; all must pass.

## Layout and conventions

- `src/modules/<area>/`: `schema.ts` (Zod), `service.ts` (writes, in `withTx`), `queries.ts` (reads, `server-only`), `actions.ts` (server actions). Pages in `src/app/(app)/` stay thin.
- **Permissions:** every page calls `requirePagePermission`, every action `requireActionPermission`, using the map in `src/lib/permissions.ts`. Never trust the UI.
- **Audit:** every write calls `writeAudit` inside the same transaction.
- **Errors:** throw `DomainError("area.code")`; the message is `errors.area.code` in the i18n files.
- **Money** is integer paise (`src/lib/money.ts`); show it with `formatINR`. **Dates** are ISO business days in Asia/Kolkata (`businessToday()` in `src/lib/dates.ts`).
- **i18n:** every UI string goes in both `src/i18n/messages/en.json` and `ml.json`.
- **UI:** follow [DESIGN.md](DESIGN.md) (black rail, one blue accent, shared `PageHeader` top bar, work cards). shadcn/ui on Base UI (`render` prop, not `asChild`); reuse `src/components/` (stat-tile, notice, empty-state, filter-tabs, list-controls, slip-no, quick-actions) instead of hand-styling.
- **Nothing with history is hard-deleted.** Orders, invoices and payments are cancelled or voided with a reason (admin). Customers and products are deactivated; the only exception is an admin deleting a customer with no orders or payments.
- Concurrency-sensitive checks lock rows with `SELECT … FOR UPDATE / FOR SHARE` (see existing services).

## Testing gotchas

- Unit and e2e tests share the `rms_test` database. **Vitest wipes it**, so run e2e again before using that data for a manual check.
- E2E specs run in alphabetical order, one worker, and **depend on each other's data** (e.g. `rentals.spec` uses customers from `customers.spec`). New tests should create their own throwaway records.
- E2E builds into `.next-e2e` on port 3100. For a manual check against test data, run `next dev -p 3300` with `NEXT_DIST_DIR=.next-devsmoke` and `DATABASE_URL` set to the test DB; delete that folder first.
- If the dev server on 3000 starts reloading endlessly after test runs, stop it, delete `.next` and start it again (a tooling artifact, not an app bug).

## Git

- Branch from `develop` (`feature/…`, `fix/…`, `chore/…`); `main` and `develop` are protected and only change through PRs, which are squash-merged.
- Don't commit or push unless asked.
