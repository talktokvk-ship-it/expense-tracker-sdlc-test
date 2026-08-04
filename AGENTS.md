# AGENTS.md

Instructions for AI agents (developer agent, reviewer agent, test gate) working in this repository.

## Before you write any code

1. Read `requirements.md` in full. It is the source of truth for scope, validation rules, and edge cases. If a task conflicts with it, `requirements.md` wins — flag the conflict instead of silently deviating.
2. Check "Out of Scope" (Section 7) before adding anything. If a task seems to require something listed there, stop and ask rather than building it.
3. This repo has no build step and no framework. Don't introduce one (React, a bundler, TypeScript, etc.) without being explicitly asked. Keep it vanilla HTML/CSS/JS.

## Money and currency rules

- **Never use floating-point arithmetic for currency.** All amounts must be converted to integer cents via `toCents()` before any addition/summation, and back to a display string via `centsToDecimalString()` or `formatCurrency()`. This is not a style preference — it's required by `requirements.md` Section 5 to avoid rounding drift.
- If you add a new place where amounts are summed, compared, or displayed, reuse the existing helpers in `app.js` rather than writing new arithmetic.

## Error handling

- Never show a raw Supabase/Postgres error to the user. Every Supabase call that can fail must map its error through a user-facing message.
- Postgres error codes are already mapped in `app.js` (`PG_FOREIGN_KEY_VIOLATION`, `PG_UNIQUE_VIOLATION`). If a new constraint is added to the schema, add its SQLSTATE code and a corresponding friendly message using the same pattern — don't fall back to a generic message for errors that have a known, better-worded case.
- Default fallback for unmapped errors is `GENERIC_ERROR_MESSAGE`. Keep using this constant rather than inlining new generic strings.

## Code structure conventions

- `app.js` is intentionally split into two halves:
  1. **Pure functions** (money math, validation, totals, error mapping) — no DOM, no Supabase. These are unit-testable and exported via `module.exports` for Node's test runner.
  2. **Browser/DOM/Supabase wiring** — guarded behind `if (typeof document !== 'undefined')` so pure functions can be tested in Node without a browser.
  - New logic should default to the pure-function half unless it genuinely requires the DOM or a live Supabase call. This keeps the surface area covered by `test.yml` as large as possible.
- Every new pure function that's meaningfully testable should be added to the `module.exports` block at the bottom of `app.js`.
- DOM element lookups go through the existing `el(id)` helper — don't call `document.getElementById` directly elsewhere.
- Render functions (`renderCategories`, `renderExpenses`, `renderTotals`, etc.) fully rebuild their container's `innerHTML` rather than patching individual nodes. Follow this same rebuild pattern for consistency — don't mix in incremental DOM patching for only one feature.

## Empty states and UI guardrails

- Every list/total in the UI must have a defined empty state — never blank, `undefined`, or `NaN`. Check `requirements.md` Section 6 for exact wording expectations before inventing new copy.
- The expense form must stay unusable (`hidden`) until at least one category exists — see `updateExpenseFormAvailability()`. If you add a new form or flow, replicate this same guard for any dependency on category data existing first.

## Supabase / schema changes

- `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `supabase-config.js` are intentionally public — protection is via Row Level Security policies on the tables, not by hiding these values. Don't move them to a `.env` file or treat them as secrets; that would be inconsistent with the existing design and wouldn't add real security.
- If a task requires a schema change (new column, new table, new constraint), state the exact SQL needed and flag it clearly in the PR description — do not assume the agent has already applied it. Schema changes happen manually in the Supabase dashboard, not via migration files in this repo (there are none yet).
- Foreign key delete behavior is `ON DELETE RESTRICT` on `expenses.category_id`. Any new foreign key added to the schema should default to the same behavior unless the task explicitly calls for cascading deletes.

## Testing expectations

- `test.yml` runs `node --test`. Any new pure function added to `app.js` should have a corresponding test. Look at existing test file(s) under `test/` for the pattern before adding new ones.
- Do not write tests that depend on a live Supabase connection — pure logic only, matching the existing split described above.

## Pull request expectations

- The reviewer agent (`claude-review.yml`) checks PRs against `requirements.md` for completeness and correctness. A PR that satisfies `AGENTS.md` conventions but misses a `requirements.md` rule will still be flagged — this file supplements the spec, it doesn't replace it.
- Keep PRs scoped to one requirement or one bug at a time where possible. Don't bundle unrelated changes.
- If a task is ambiguous or under-specified relative to `requirements.md`, prefer asking (via PR/issue comment) over guessing — especially near the edges called out in Section 7 (Out of Scope).
