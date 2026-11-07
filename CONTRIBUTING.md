# Contributing & release workflow

## Branches

| Branch | Purpose | Who writes to it |
|---|---|---|
| `main` | **Production.** What runs at the shop / on the VPS. Every commit on it is a tagged release. | Only through a release PR from `develop`, or a hotfix PR |
| `develop` | **Integration.** The next release, demo-ready at all times. | Only through PRs from work branches |
| `feature/<topic>` | New work, e.g. `feature/step-7-payments` | You |
| `fix/<topic>` | A bug found before release, e.g. `fix/statement-days` | You |
| `chore/<topic>` | Tooling, CI, docs, dependencies | You |
| `hotfix/<version>-<topic>` | An urgent fix for production, branched from `main`, e.g. `hotfix/0.6.1-invoice-total` | You |

`main` and `develop` are protected. Nobody pushes to them directly, force pushes and deletion are blocked, and a PR can merge only when CI is green.

```
feature/step-7-payments ──PR──▶ develop ──release PR──▶ main ── tag v0.7.0
                                   ▲                       │
                                   └──── merge back ───────┤
                                            hotfix/0.7.1-x ◀┘ (PR into main, then main → develop)
```

## Day-to-day

```bash
git switch develop && git pull
git switch -c feature/step-7-payments
# … work, commit …
git push -u origin feature/step-7-payments
gh pr create --base develop --fill
```

- Keep a branch to one topic. One build step means one feature branch.
- **Squash merge** into `develop`, so each feature becomes one clean commit. The PR title becomes the commit message, so write it as a commit message.
- Delete the branch after merging (GitHub does this automatically).

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/) style:

```
feat(payments): record advances and final payments
fix(returns): reject return dates before the issue date
chore(ci): cache Playwright browsers
docs(billing): explain discounts
```

Types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `chore`, `ci`, `build`. Use `feat!:` (or a `BREAKING CHANGE:` footer) for a change that needs a data migration or a change in how the shop works.

## Releases

Versions follow [SemVer](https://semver.org/): `v0.<step>.<patch>` until go-live (`v0.6.0` = Steps 1–6), then `v1.0.0` at go-live.

1. When `develop` is signed off after a demo, open a PR **`develop` → `main`** titled `release: v0.7.0`.
2. CI must pass. Merge it with a **merge commit** (not a squash), so `main` and `develop` share history.
3. Tag and publish: `gh release create v0.7.0 --target main --generate-notes`.
4. Deploy from the tag (docs/04-deployment.md). Back up the database before `prisma migrate deploy`.

## Hotfixes

1. `git switch main && git pull && git switch -c hotfix/0.7.1-<topic>`
2. Fix it, add a test, then open a PR into `main`. After CI passes, merge and tag `v0.7.1`.
3. Merge `main` back into `develop` (PR `main` → `develop`), so the fix is not lost.

## Rules that never bend

- **Never edit an applied migration.** Add a new one.
- **Never commit secrets.** `.env` is git-ignored; `.env.example` holds placeholders only.
- **Never force-push** `main` or `develop`.
- Money and stock changes need tests for the failure cases, not just the happy path.
