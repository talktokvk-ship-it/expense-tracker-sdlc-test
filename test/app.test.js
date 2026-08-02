const test = require('node:test');
const assert = require('node:assert/strict');

const {
  toCents,
  centsToDecimalString,
  formatCurrency,
  validateCategoryName,
  validateExpenseInput,
  expenseMatchesMonth,
  calculateCategoryTotals,
  categoryHasExpenses,
  getCategoryDeleteErrorMessage,
  getCategoryInsertErrorMessage,
  CATEGORY_DELETE_BLOCKED_MESSAGE,
  GENERIC_ERROR_MESSAGE,
} = require('../app.js');

// ---------------------------------------------------------------------------
// Money helpers
// ---------------------------------------------------------------------------

test('toCents parses plain decimal amounts', () => {
  assert.equal(toCents('12.50'), 1250);
  assert.equal(toCents('0'), 0);
  assert.equal(toCents('0.00'), 0);
  assert.equal(toCents('100'), 10000);
  assert.equal(toCents('  9.05  '), 905);
});

test('toCents rounds amounts with more than 2 decimal places', () => {
  assert.equal(toCents('1.005'), 101); // rounds up
  assert.equal(toCents('1.004'), 100); // rounds down
});

test('toCents returns null for invalid input', () => {
  assert.equal(toCents('abc'), null);
  assert.equal(toCents(''), null);
  assert.equal(toCents(null), null);
  assert.equal(toCents(undefined), null);
  assert.equal(toCents('1.2.3'), null);
});

test('toCents preserves negative amounts (rejection happens in validation)', () => {
  assert.equal(toCents('-5.00'), -500);
});

test('centsToDecimalString and formatCurrency round-trip correctly', () => {
  assert.equal(centsToDecimalString(1250), '12.50');
  assert.equal(centsToDecimalString(5), '0.05');
  assert.equal(centsToDecimalString(0), '0.00');
  assert.equal(formatCurrency(1250), '€12.50');
  assert.equal(formatCurrency(0), '€0.00');
});

// ---------------------------------------------------------------------------
// Validation logic
// ---------------------------------------------------------------------------

test('validateCategoryName rejects empty/whitespace names', () => {
  assert.equal(validateCategoryName('', []), 'Category name is required.');
  assert.equal(validateCategoryName('   ', []), 'Category name is required.');
});

test('validateCategoryName rejects duplicate names', () => {
  const existing = [{ id: 1, name: 'Groceries' }];
  assert.equal(
    validateCategoryName('Groceries', existing),
    'A category with this name already exists.'
  );
});

test('validateCategoryName accepts a valid, unique name', () => {
  const existing = [{ id: 1, name: 'Groceries' }];
  assert.equal(validateCategoryName('Utilities', existing), null);
});

test('validateExpenseInput requires a valid category, amount, and date', () => {
  const categories = [{ id: 1, name: 'Groceries' }];

  const missingEverything = validateExpenseInput(
    { categoryId: '', amount: '', expenseDate: '' },
    categories
  );
  assert.equal(missingEverything.valid, false);
  assert.ok(missingEverything.errors.categoryId);
  assert.ok(missingEverything.errors.amount);
  assert.ok(missingEverything.errors.expenseDate);

  const invalidCategory = validateExpenseInput(
    { categoryId: '999', amount: '10.00', expenseDate: '2026-01-01' },
    categories
  );
  assert.equal(invalidCategory.valid, false);
  assert.ok(invalidCategory.errors.categoryId);
});

test('validateExpenseInput rejects negative amounts but allows zero', () => {
  const categories = [{ id: 1, name: 'Groceries' }];

  const negative = validateExpenseInput(
    { categoryId: '1', amount: '-1.00', expenseDate: '2026-01-01' },
    categories
  );
  assert.equal(negative.valid, false);
  assert.equal(negative.errors.amount, 'Amount must be zero or greater.');

  const zero = validateExpenseInput(
    { categoryId: '1', amount: '0', expenseDate: '2026-01-01' },
    categories
  );
  assert.equal(zero.valid, true);
});

test('validateExpenseInput rejects an invalid date', () => {
  const categories = [{ id: 1, name: 'Groceries' }];
  const result = validateExpenseInput(
    { categoryId: '1', amount: '5.00', expenseDate: 'not-a-date' },
    categories
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.expenseDate);
});

test('validateExpenseInput accepts fully valid input', () => {
  const categories = [{ id: 1, name: 'Groceries' }];
  const result = validateExpenseInput(
    { categoryId: '1', amount: '12.34', expenseDate: '2026-01-15' },
    categories
  );
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
});

// ---------------------------------------------------------------------------
// Totals calculation logic
// ---------------------------------------------------------------------------

test('calculateCategoryTotals sums expenses per category using exact cent arithmetic', () => {
  const categories = [
    { id: 1, name: 'Groceries' },
    { id: 2, name: 'Transport' },
  ];
  const expenses = [
    { category_id: 1, amount: '0.10', expense_date: '2026-01-01' },
    { category_id: 1, amount: '0.20', expense_date: '2026-01-02' },
    { category_id: 2, amount: '5.00', expense_date: '2026-01-03' },
  ];

  const totals = calculateCategoryTotals(categories, expenses, '');
  // 0.10 + 0.20 must equal exactly 0.30 (30 cents), not 0.30000000000000004
  assert.equal(totals[1], 30);
  assert.equal(totals[2], 500);
});

test('calculateCategoryTotals avoids floating-point drift across many small values', () => {
  const categories = [{ id: 1, name: 'Misc' }];
  const expenses = Array.from({ length: 10 }, () => ({
    category_id: 1,
    amount: '0.10',
    expense_date: '2026-01-01',
  }));

  const totals = calculateCategoryTotals(categories, expenses, '');
  // Naive float addition of ten 0.10s can drift away from 1.00; cents math must not.
  assert.equal(totals[1], 100);
  assert.equal(formatCurrency(totals[1]), '€1.00');
});

test('calculateCategoryTotals respects the month filter', () => {
  const categories = [{ id: 1, name: 'Groceries' }];
  const expenses = [
    { category_id: 1, amount: '10.00', expense_date: '2026-01-15' },
    { category_id: 1, amount: '20.00', expense_date: '2026-02-15' },
  ];

  const januaryTotals = calculateCategoryTotals(categories, expenses, '2026-01');
  assert.equal(januaryTotals[1], 1000);

  const februaryTotals = calculateCategoryTotals(categories, expenses, '2026-02');
  assert.equal(februaryTotals[1], 2000);
});

test('expenseMatchesMonth matches by YYYY-MM prefix and is permissive when no filter is set', () => {
  const expense = { expense_date: '2026-03-05' };
  assert.equal(expenseMatchesMonth(expense, '2026-03'), true);
  assert.equal(expenseMatchesMonth(expense, '2026-04'), false);
  assert.equal(expenseMatchesMonth(expense, ''), true);
});

// ---------------------------------------------------------------------------
// Zero-expense category edge case
// ---------------------------------------------------------------------------

test('a category with zero expenses totals exactly €0.00, never blank/NaN/undefined', () => {
  const categories = [{ id: 1, name: 'Empty Category' }];
  const totals = calculateCategoryTotals(categories, [], '');
  assert.equal(totals[1], 0);
  assert.equal(formatCurrency(totals[1]), '€0.00');
});

test('a category with zero expenses in the selected month totals €0.00', () => {
  const categories = [{ id: 1, name: 'Groceries' }];
  const expenses = [{ category_id: 1, amount: '10.00', expense_date: '2026-01-15' }];

  const totals = calculateCategoryTotals(categories, expenses, '2026-02');
  assert.equal(totals[1], 0);
  assert.equal(formatCurrency(totals[1]), '€0.00');
});

test('categoryHasExpenses is false for an unused category and true once it has an expense', () => {
  const expenses = [{ category_id: 2, amount: '5.00' }];
  assert.equal(categoryHasExpenses(1, expenses), false);
  assert.equal(categoryHasExpenses(2, expenses), true);
});

test('deleting a zero-expense category succeeds (no RESTRICT error to map)', () => {
  // No expenses reference this category, so the app should never even
  // attempt to surface a delete error for it.
  const expenses = [];
  assert.equal(categoryHasExpenses(1, expenses), false);
});

test('getCategoryDeleteErrorMessage maps a foreign-key RESTRICT violation to a friendly message', () => {
  const dbError = { code: '23503', message: 'update or delete on table "categories" violates foreign key constraint' };
  assert.equal(getCategoryDeleteErrorMessage(dbError), CATEGORY_DELETE_BLOCKED_MESSAGE);
});

test('getCategoryDeleteErrorMessage falls back to a generic message for other errors', () => {
  assert.equal(getCategoryDeleteErrorMessage({ code: '99999' }), GENERIC_ERROR_MESSAGE);
  assert.equal(getCategoryDeleteErrorMessage(null), GENERIC_ERROR_MESSAGE);
});

test('getCategoryInsertErrorMessage maps a unique-constraint violation to a friendly message', () => {
  const dbError = { code: '23505', message: 'duplicate key value violates unique constraint' };
  assert.equal(getCategoryInsertErrorMessage(dbError), 'A category with this name already exists.');
});
