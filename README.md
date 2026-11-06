# Sree Krishna Motors – Rental Management System

Web app for equipment rentals: customers, inventory, rental orders, returns, billing and payments. English and Malayalam.

Design docs are in [`docs/`](docs/), starting with [`01-requirements.md`](docs/01-requirements.md).

## Development setup (Windows)

Requirements: Node.js 24+, PostgreSQL 18.

```sh
npm install                      # also generates the Prisma client
cp .env.example .env             # then fill in DATABASE_URL, AUTH_SECRET, SEED_ADMIN_*
npx prisma migrate dev           # create/upgrade the database schema
npm run db:seed                  # first admin + settings row
npm run dev                      # http://localhost:3000
```

Log in with `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`. You'll be asked to choose a new password.
With `SEED_DEV_DATA=true` there is also a demo staff user, `staff` / `staff1234`.

## Checks

```sh
npm run typecheck
npm run lint
npm test                         # Vitest, uses TEST_DATABASE_URL (wiped per test)
npm run test:e2e                 # Playwright, builds the app and uses TEST_DATABASE_URL
```

Other devices on the same Wi-Fi can open `http://<this-pc-ip>:3000` when the dev server runs with `npx next dev -H 0.0.0.0`.
