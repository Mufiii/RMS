## What and why

<!-- One or two sentences. Link the issue: "Closes #12". -->

## Type

- [ ] Feature (build step / new screen)
- [ ] Fix
- [ ] Hotfix (production, branched from `main`)
- [ ] Release (`develop` → `main`)
- [ ] Chore / docs / CI

## Checklist

- [ ] Server-side permission check on every new action
- [ ] Zod validation, errors translated in **both** `en.json` and `ml.json`
- [ ] Stock and money changes run in one transaction, with an audit row
- [ ] Migration is new (never edit an applied one) and has the hand-written constraints
- [ ] Vitest covers the business rules, including the failure cases
- [ ] Playwright covers the screen flow
- [ ] `docs/modules/<module>.md` updated
- [ ] Checked on the dev server (no error overlay, no reload loop)

## How to test

<!-- Steps for the reviewer / demo. -->
