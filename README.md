# Expense Tracker — AI-Driven SDLC Pipeline Stress Test

This repo is a stress test of an automated software delivery pipeline where
[Claude](https://claude.com) writes the code, runs the tests, and reviews
the pull request — with GitHub Actions as the automation layer and a human
(me) as the person defining requirements and approving merges.

It follows on from a simpler proof-of-concept
([`todo-app-sdlc-test`](https://github.com/talktokvk-ship-it/todo-app-sdlc-test)),
which proved the same pipeline end-to-end on a single-file to-do app. This
repo tests whether the same pipeline holds up on a more realistic,
relational app with a real database, foreign keys, and business logic.

## What this app does

A single-user expense tracker:

- Log expenses against categories (Food, Transport, Entertainment, etc.)
- See running totals per category, filterable by month
- Categories can't be deleted while expenses are still linked to them
- Single currency (EUR assumed), no login/auth, no multi-user support

Full functional and validation rules are defined in
[`requirements.md`](./requirements.md) — that file, not this README, is the
source of truth for what the app should do.

## Why this repo exists

The goal isn't the expense tracker itself — it's answering a specific
question: **can an AI agent be trusted to build, test, and review real
application code inside a governed pipeline, with a human only in the loop
at the requirements and merge-approval stages?**

The to-do app proved this works for something trivial. This repo adds the
complexity that makes that trust harder to earn:

- A real relational database (Supabase/Postgres) instead of in-memory data
- A foreign key constraint with real delete-blocking behavior to get right
- Decimal-accurate currency math (no floating-point rounding errors)
- Multi-file app structure instead of one file
- Actual automated tests that have to pass before a merge is allowed

## How the pipeline works

1. **An issue is opened** describing the work, tagging `@claude`
2. **`claude.yml`** picks up the `@claude` mention and opens a pull request
   with the implementation
3. **`test.yml`** runs the automated test suite (Node's built-in test
   runner) against the PR — check name `test`
4. **`claude-review.yml`** has Claude independently review the PR's code
   against `requirements.md` — check name `review`, shows in GitHub as
   "Claude Code Review"
5. Both checks must pass before the PR can be merged into `main`
   (enforced via a branch protection Ruleset — no direct pushes, no
   force-pushes, no self-merge without a passing PR)
6. A human reviews and merges

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Plain HTML / CSS / JavaScript (no framework) |
| Database | [Supabase](https://supabase.com) (Postgres), EU region |
| Auth | None — RLS policies are intentionally open (`using (true)`) |
| CI/CD | GitHub Actions |
| App logic + tests + review | Claude, via `@claude` in issue/PR comments |

`supabase-config.js` in the repo root holds the Supabase project URL and
**anon/public key only** — never the `service_role` key. The anon key is
designed to be exposed client-side; row-level security is the actual
security boundary here, not key secrecy.

## Database schema

**`categories`**
| Column | Type | Notes |
|---|---|---|
| `id` | int8 | PK, auto |
| `created_at` | timestamptz | auto |
| `name` | text | required, unique |

**`expenses`**
| Column | Type | Notes |
|---|---|---|
| `id` | int8 | PK, auto |
| `created_at` | timestamptz | auto |
| `updated_at` | timestamptz | required, app must set on edit |
| `category_id` | int8 | FK → `categories.id`, `ON DELETE RESTRICT` |
| `amount` | numeric | not float — avoids currency rounding errors; €0.00 allowed, negative not |
| `description` | text | optional |
| `expense_date` | date | required |

Row Level Security is enabled on both tables with a fully open policy —
intentional, since this app has no authentication layer.

## Status

✅ **Pipeline proven end-to-end.** Database schema, workflows, and app code
are all live. The first real application PR ran both the `test` and
`review` checks successfully, was merged into `main`, and `main` is now
protected by a Ruleset requiring both checks to pass (plus PR-only merges,
no force pushes) before any future change can land.

**Live app:** https://talktokvk-ship-it.github.io/expense-tracker-sdlc-test/

Manual in-browser verification (totals accuracy, delete-restrict behavior,
edge cases) is the current/next step.

## Explicitly out of scope

Multi-currency support, authentication/multi-user, recurring expenses,
budgets, data export, and category renaming. See `requirements.md` for the
full list and reasoning.

## Related

- [`todo-app-sdlc-test`](https://github.com/talktokvk-ship-it/todo-app-sdlc-test) — the original, simpler proof-of-concept this pipeline was first proven on
