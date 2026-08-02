# Expense Tracker — Requirements

## 1. App Overview

A simple expense tracking web app with categories and expenses. Single-page app,
single currency (EUR assumed — no currency selection or conversion). No user
authentication — this is a single-user demo app.

Data is stored in Supabase (PostgreSQL). The app connects directly to Supabase
using the project URL and public anon key.

## 2. Data Model

### `categories` table
| Column       | Type        | Notes                          |
|--------------|-------------|---------------------------------|
| id           | int8        | Primary key, auto-increment     |
| created_at   | timestamptz | Auto-set on insert               |
| name         | text        | Required, unique                 |

### `expenses` table
| Column        | Type        | Notes                                          |
|---------------|-------------|-------------------------------------------------|
| id            | int8        | Primary key, auto-increment                     |
| created_at    | timestamptz | Auto-set on insert                              |
| updated_at    | timestamptz | Must be updated by the app whenever a row is edited |
| category_id   | int8        | Required. Foreign key → categories.id            |
| amount        | numeric     | Required. See validation rules below             |
| description   | text        | Optional                                         |
| expense_date  | date        | Required                                         |

### Relationship
One category can have many expenses (1-to-many). Each expense must belong to
exactly one category.

**Delete behavior:** The foreign key uses `ON DELETE RESTRICT`. Deleting a
category that still has one or more expenses referencing it must be blocked
at the database level. The app must not attempt to delete a category without
first checking whether it has expenses, and if the delete is attempted and
fails, the UI must show a clear, user-friendly error message (e.g. "This
category still has expenses and can't be deleted. Reassign or delete its
expenses first.") — never show a raw database/SQL error to the user.

## 3. Validation Rules

- **amount**: required, must be a valid number, must be **zero or greater**
  (negative amounts are not allowed; €0.00 is allowed).
- **category name**: required, must be unique (case-sensitive uniqueness is
  acceptable — do not over-engineer case-insensitive matching).
- **expense_date**: required, must be a valid date.
- **category_id** (on an expense): required, must reference an existing
  category. The UI must present a dropdown/select of existing categories
  rather than a free-text field, so invalid category references are
  prevented at the UI level, not just relied upon via the database
  constraint.
- **description**: optional, no format restrictions.

## 4. Category Deletion

- Attempting to delete a category with zero linked expenses must succeed.
- Attempting to delete a category with one or more linked expenses must be
  blocked, with a clear in-app error message as described in Section 2.
- The UI should ideally indicate to the user (e.g. via a disabled state or
  tooltip) that a category has expenses before they attempt deletion, though
  this is a nice-to-have, not a hard requirement — the hard requirement is
  that deletion is blocked and the failure is communicated clearly.

## 5. Running Totals Feature

- The app must display a running total of expenses **per category**.
- The app must support filtering totals **by month** (i.e., show total spend
  per category for a selected month).
- Totals must recalculate and update immediately whenever an expense is
  added, edited, or deleted — no stale totals, no manual refresh required.
- A category with zero expenses (or zero expenses in the selected month)
  must display a total of **€0.00** — never blank, never an error, never
  "undefined" or "NaN".
- All total calculations must use exact decimal arithmetic appropriate for
  currency (matching the `numeric` column type in the database). Floating-
  point arithmetic that could introduce rounding drift (e.g. plain JavaScript
  `Number` addition of many decimal values) must be avoided or explicitly
  handled to prevent cent-level errors accumulating across many expenses.

## 6. Empty States

- **No categories exist yet**: the app must show a clear empty-state message
  (e.g. "No categories yet — create one to get started") rather than a blank
  screen or error. The "add expense" flow should not be usable until at
  least one category exists.
- **No expenses exist yet** (globally, or within a selected category/month):
  the app must show a clear empty-state message (e.g. "No expenses yet")
  rather than a blank list or error.

## 7. Out of Scope

The following are explicitly **not** required for this app. Do not build
these — keep the implementation focused:

- Multi-currency support or currency conversion
- User authentication or accounts
- Multi-user support or per-user data isolation
- Recurring/scheduled expenses
- Budgets, spending limits, or alerts
- Data export (CSV, PDF, etc.)
- Editing category names after creation (create/delete only is sufficient)
