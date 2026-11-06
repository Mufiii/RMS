# Module: Setup, authentication, users, audit (Step 1)

Status: **built 2026-11-06**, awaiting demo sign-off.

## Screens

| Path | Who | What |
|---|---|---|
| `/login` | everyone | Username + password, with an EN / മലയാളം switch |
| `/change-password` | signed-in users | Forced on first login and after an admin resets the password; the user can't reach any other page until it's done |
| `/dashboard` | admin | Placeholder (Step 8). Admins land here after login |
| `/orders` | admin, staff | Placeholder (Step 4). Staff land here after login |
| `/customers`, `/products`, `/payments` | admin, staff | Placeholders (Steps 2, 3, 7) |
| `/reports`, `/settings` | admin | Placeholders (Steps 8, 9) |
| `/users` | admin | List of users with role, status, "must change password" flag and last login |
| `/users/new` | admin | Create a user (name, username, role, initial password) |
| `/users/[id]` | admin | Edit name and role, reset password, deactivate or reactivate (with a reason) |
| `/audit` | admin | Append-only audit log, newest first, 50 per page |
| `/forbidden` | everyone | 403 page shown when a user opens a page their role can't use |
| `/api/health` | anyone | `{"status":"ok"}` when the database is reachable (for monitoring) |

Layout: a sidebar on desktop. On mobile, a top bar plus a bottom navigation bar with 4 items and a "More" menu. Menu items are filtered by role.

## Rules

- Usernames are lowercase, 3–32 characters (`a-z 0-9 . _ -`) and unique. Passwords are at least 8 characters.
- Login errors never reveal whether the username exists or the account is inactive ("Wrong username or password").
- 5 failed logins within 15 minutes lock that username, and separately that IP address, for the rest of the window.
- Sessions last 8 hours. Every request re-checks the user in the database.
- **These end a user's sessions immediately:** password reset by an admin, the user changing their own password (other devices only), a role change, deactivation.
- New users and reset passwords must be changed at the next login.
- An admin cannot demote or deactivate themselves. **There is always at least one active admin.** This is enforced with row locks, so two admins acting at the same moment can't both succeed.
- Deactivating or reactivating a user requires a reason, which is stored in the audit log.
- Users are never deleted, only deactivated.
- The audit log is append-only. A database trigger rejects any UPDATE or DELETE on it.

## Audit actions written

`USER_CREATE`, `USER_UPDATE`, `USER_ROLE_CHANGE`, `PASSWORD_RESET`, `PASSWORD_CHANGE`, `USER_DEACTIVATE`, `USER_REACTIVATE`.

## Shared foundations built in this step

- `lib/permissions.ts`: the permission map (docs/01-requirements.md §6)
- `lib/dates.ts`: Asia/Kolkata business date, Indian financial year, DD-MM-YYYY formatting
- `lib/money.ts`: exact paise arithmetic, ₹ formatting with Indian grouping
- `lib/sequences.ts`: gap-free document numbers per type and financial year (`INV/2026-27/0001`)
- `lib/audit.ts`, `lib/tx.ts`, `lib/errors.ts`, `lib/action.ts`
- i18n: `src/i18n/messages/{en,ml}.json`. The language choice is saved per user.

## Tests

- Vitest (69 tests): dates and financial years, money, the permission map, sequences (rollback leaves no gap, 15 concurrent requests get contiguous numbers), the append-only audit log, login and lockout, session invalidation, password change, user create/update/reset/deactivate, the last-admin guard under concurrency.
- Playwright E2E (7 tests, production build, `rms_test` database): redirect when signed out, wrong password, forced password change, admin creates staff, staff-only menu and 403 on admin pages, deactivation ends the open staff session, audit entries, admin self-protection, language switch, mobile bottom navigation.

Run: `npm test` (unit/service), `npm run test:e2e` (browser).
