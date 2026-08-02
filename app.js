// Expense Tracker — application logic
//
// This file contains both:
//  1. Pure logic (money math, validation, totals) — exported for Node tests.
//  2. Browser/DOM/Supabase wiring — only runs when loaded in a browser
//     (guarded so `require('./app.js')` in Node tests is side-effect free).

// ---------------------------------------------------------------------------
// Money helpers
//
// Currency math is done in integer cents to avoid floating-point rounding
// drift when summing many decimal values (see requirements.md section 5).
// ---------------------------------------------------------------------------

const AMOUNT_PATTERN = /^-?\d+(\.\d+)?$/;

// Converts a decimal amount (string or number) into integer cents.
// Returns null if the input is not a valid decimal number.
function toCents(input) {
  if (input === null || input === undefined) return null;
  const trimmed = String(input).trim();
  if (!AMOUNT_PATTERN.test(trimmed)) return null;

  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPart, fracPart = ''] = unsigned.split('.');

  let cents;
  if (fracPart.length <= 2) {
    cents = parseInt(intPart, 10) * 100 + parseInt(fracPart.padEnd(2, '0'), 10);
  } else {
    const keep = fracPart.slice(0, 2);
    const nextDigit = fracPart.charCodeAt(2) - 48;
    cents = parseInt(intPart, 10) * 100 + parseInt(keep, 10);
    if (nextDigit >= 5) cents += 1;
  }

  return negative ? -cents : cents;
}

// Converts integer cents back into a plain decimal string, e.g. "12.50".
function centsToDecimalString(cents) {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const intPart = Math.floor(abs / 100);
  const fracPart = String(abs % 100).padStart(2, '0');
  return (negative ? '-' : '') + intPart + '.' + fracPart;
}

// Formats integer cents as a EUR currency string, e.g. "€12.50".
function formatCurrency(cents) {
  return '€' + centsToDecimalString(cents);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateCategoryName(name, existingCategories) {
  if (typeof name !== 'string' || name.trim() === '') {
    return 'Category name is required.';
  }
  const trimmed = name.trim();
  const exists = (existingCategories || []).some((c) => c.name === trimmed);
  if (exists) {
    return 'A category with this name already exists.';
  }
  return null;
}

function validateExpenseInput({ categoryId, amount, expenseDate }, categories) {
  const errors = {};

  if (categoryId === null || categoryId === undefined || categoryId === '') {
    errors.categoryId = 'Please select a category.';
  } else if (!(categories || []).some((c) => String(c.id) === String(categoryId))) {
    errors.categoryId = 'Please select a valid category.';
  }

  if (amount === null || amount === undefined || String(amount).trim() === '') {
    errors.amount = 'Amount is required.';
  } else {
    const cents = toCents(amount);
    if (cents === null) {
      errors.amount = 'Amount must be a valid number.';
    } else if (cents < 0) {
      errors.amount = 'Amount must be zero or greater.';
    }
  }

  if (!expenseDate || isNaN(Date.parse(expenseDate))) {
    errors.expenseDate = 'Please enter a valid date.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

// Returns true when an expense's date falls within the given 'YYYY-MM' month.
function expenseMatchesMonth(expense, monthFilter) {
  if (!monthFilter) return true;
  return typeof expense.expense_date === 'string' && expense.expense_date.startsWith(monthFilter);
}

// Computes a { [categoryId]: cents } map of totals for every category,
// including categories with zero (matching) expenses, which get 0.
function calculateCategoryTotals(categories, expenses, monthFilter) {
  const totals = {};
  (categories || []).forEach((c) => {
    totals[c.id] = 0;
  });
  (expenses || []).forEach((e) => {
    if (!expenseMatchesMonth(e, monthFilter)) return;
    const cents = toCents(e.amount);
    if (cents === null) return;
    if (totals[e.category_id] === undefined) totals[e.category_id] = 0;
    totals[e.category_id] += cents;
  });
  return totals;
}

function categoryHasExpenses(categoryId, expenses) {
  return (expenses || []).some((e) => String(e.category_id) === String(categoryId));
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

const CATEGORY_DELETE_BLOCKED_MESSAGE =
  "This category still has expenses and can't be deleted. Reassign or delete its expenses first.";
const CATEGORY_NAME_TAKEN_MESSAGE = 'A category with this name already exists.';
const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

// Postgres SQLSTATE codes surfaced by PostgREST/Supabase.
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_UNIQUE_VIOLATION = '23505';

function getCategoryDeleteErrorMessage(error) {
  if (error && error.code === PG_FOREIGN_KEY_VIOLATION) {
    return CATEGORY_DELETE_BLOCKED_MESSAGE;
  }
  return GENERIC_ERROR_MESSAGE;
}

function getCategoryInsertErrorMessage(error) {
  if (error && error.code === PG_UNIQUE_VIOLATION) {
    return CATEGORY_NAME_TAKEN_MESSAGE;
  }
  return GENERIC_ERROR_MESSAGE;
}

// ---------------------------------------------------------------------------
// Browser / DOM / Supabase wiring
// ---------------------------------------------------------------------------

if (typeof document !== 'undefined') {
  (function () {
    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let categories = [];
    let expenses = [];
    let editingExpenseId = null;
    let monthFilter = '';

    const el = (id) => document.getElementById(id);

    async function init() {
      el('category-form').addEventListener('submit', onAddCategory);
      el('expense-form').addEventListener('submit', onSubmitExpense);
      el('expense-cancel-edit-btn').addEventListener('click', resetExpenseForm);
      el('month-filter').addEventListener('change', onMonthFilterChange);
      el('clear-month-filter').addEventListener('click', onClearMonthFilter);

      await refreshAll();
    }

    async function refreshAll() {
      await Promise.all([loadCategories(), loadExpenses()]);
      renderAll();
    }

    async function loadCategories() {
      const { data, error } = await supabaseClient.from('categories').select('*').order('name');
      if (error) {
        showGlobalError(GENERIC_ERROR_MESSAGE);
        return;
      }
      categories = data || [];
    }

    async function loadExpenses() {
      const { data, error } = await supabaseClient
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false });
      if (error) {
        showGlobalError(GENERIC_ERROR_MESSAGE);
        return;
      }
      expenses = data || [];
    }

    function renderAll() {
      renderCategories();
      renderExpenseCategoryOptions();
      renderTotals();
      renderExpenses();
      updateExpenseFormAvailability();
    }

    // --- Categories ---------------------------------------------------

    function renderCategories() {
      const emptyState = el('category-empty-state');
      const list = el('category-list');
      list.innerHTML = '';

      if (categories.length === 0) {
        emptyState.hidden = false;
        list.hidden = true;
        return;
      }
      emptyState.hidden = true;
      list.hidden = false;

      categories.forEach((c) => {
        const hasExpenses = categoryHasExpenses(c.id, expenses);
        const li = document.createElement('li');
        li.className = 'category-item';

        const name = document.createElement('span');
        name.className = 'category-name';
        name.textContent = c.name;

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn btn-danger btn-small';
        deleteBtn.textContent = 'Delete';
        deleteBtn.disabled = hasExpenses;
        deleteBtn.title = hasExpenses
          ? 'This category has expenses and cannot be deleted until they are removed.'
          : 'Delete this category';
        deleteBtn.addEventListener('click', () => onDeleteCategory(c.id));

        li.appendChild(name);
        li.appendChild(deleteBtn);
        list.appendChild(li);
      });
    }

    async function onAddCategory(event) {
      event.preventDefault();
      const input = el('category-name-input');
      const errorEl = el('category-error');
      const name = input.value.trim();

      const validationError = validateCategoryName(name, categories);
      if (validationError) {
        errorEl.textContent = validationError;
        errorEl.hidden = false;
        return;
      }

      const { error } = await supabaseClient.from('categories').insert({ name });
      if (error) {
        errorEl.textContent = getCategoryInsertErrorMessage(error);
        errorEl.hidden = false;
        return;
      }

      errorEl.hidden = true;
      input.value = '';
      await refreshAll();
    }

    async function onDeleteCategory(categoryId) {
      if (!window.confirm('Delete this category?')) return;
      const { error } = await supabaseClient.from('categories').delete().eq('id', categoryId);
      if (error) {
        showGlobalError(getCategoryDeleteErrorMessage(error));
        return;
      }
      clearGlobalError();
      await refreshAll();
    }

    // --- Expenses -------------------------------------------------------

    function renderExpenseCategoryOptions() {
      const select = el('expense-category-select');
      const currentValue = select.value;
      select.innerHTML = '<option value="">Select a category…</option>';
      categories.forEach((c) => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = c.name;
        select.appendChild(option);
      });
      if (currentValue) select.value = currentValue;
    }

    function updateExpenseFormAvailability() {
      const form = el('expense-form');
      const noCategoriesNote = el('no-categories-note');
      if (categories.length === 0) {
        form.hidden = true;
        noCategoriesNote.hidden = false;
      } else {
        form.hidden = false;
        noCategoriesNote.hidden = true;
      }
    }

    function renderExpenses() {
      const emptyState = el('expense-empty-state');
      const list = el('expense-list');
      list.innerHTML = '';

      const filtered = expenses.filter((e) => expenseMatchesMonth(e, monthFilter));

      if (filtered.length === 0) {
        emptyState.hidden = false;
        emptyState.textContent = monthFilter ? 'No expenses in this month.' : 'No expenses yet.';
        list.hidden = true;
        return;
      }
      emptyState.hidden = true;
      list.hidden = false;

      filtered.forEach((e) => {
        const category = categories.find((c) => String(c.id) === String(e.category_id));
        const row = document.createElement('tr');

        const dateCell = document.createElement('td');
        dateCell.textContent = e.expense_date;

        const categoryCell = document.createElement('td');
        categoryCell.textContent = category ? category.name : '(unknown category)';

        const descriptionCell = document.createElement('td');
        descriptionCell.textContent = e.description || '';

        const amountCell = document.createElement('td');
        amountCell.className = 'amount-cell';
        const cents = toCents(e.amount);
        amountCell.textContent = cents === null ? '—' : formatCurrency(cents);

        const actionsCell = document.createElement('td');
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn btn-small';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => startEditExpense(e));

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn btn-danger btn-small';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => onDeleteExpense(e.id));

        actionsCell.appendChild(editBtn);
        actionsCell.appendChild(deleteBtn);

        row.appendChild(dateCell);
        row.appendChild(categoryCell);
        row.appendChild(descriptionCell);
        row.appendChild(amountCell);
        row.appendChild(actionsCell);
        list.appendChild(row);
      });
    }

    function startEditExpense(expense) {
      editingExpenseId = expense.id;
      el('expense-form-title').textContent = 'Edit Expense';
      el('expense-category-select').value = expense.category_id;
      el('expense-amount-input').value = expense.amount;
      el('expense-date-input').value = expense.expense_date;
      el('expense-description-input').value = expense.description || '';
      el('expense-submit-btn').textContent = 'Save Changes';
      el('expense-cancel-edit-btn').hidden = false;
      window.scrollTo({ top: el('expense-form').offsetTop, behavior: 'smooth' });
    }

    function resetExpenseForm() {
      editingExpenseId = null;
      el('expense-form').reset();
      el('expense-form-title').textContent = 'Add Expense';
      el('expense-submit-btn').textContent = 'Add Expense';
      el('expense-cancel-edit-btn').hidden = true;
      el('expense-form-error').hidden = true;
    }

    async function onSubmitExpense(event) {
      event.preventDefault();
      const errorEl = el('expense-form-error');

      const categoryId = el('expense-category-select').value;
      const amount = el('expense-amount-input').value;
      const expenseDate = el('expense-date-input').value;
      const description = el('expense-description-input').value.trim();

      const { valid, errors } = validateExpenseInput({ categoryId, amount, expenseDate }, categories);
      if (!valid) {
        errorEl.textContent = Object.values(errors).join(' ');
        errorEl.hidden = false;
        return;
      }

      const cents = toCents(amount);
      const payload = {
        category_id: categoryId,
        amount: centsToDecimalString(cents),
        expense_date: expenseDate,
        description: description || null,
      };

      let error;
      if (editingExpenseId) {
        payload.updated_at = new Date().toISOString();
        ({ error } = await supabaseClient.from('expenses').update(payload).eq('id', editingExpenseId));
      } else {
        ({ error } = await supabaseClient.from('expenses').insert(payload));
      }

      if (error) {
        errorEl.textContent = GENERIC_ERROR_MESSAGE;
        errorEl.hidden = false;
        return;
      }

      errorEl.hidden = true;
      resetExpenseForm();
      await refreshAll();
    }

    async function onDeleteExpense(expenseId) {
      if (!window.confirm('Delete this expense?')) return;
      const { error } = await supabaseClient.from('expenses').delete().eq('id', expenseId);
      if (error) {
        showGlobalError(GENERIC_ERROR_MESSAGE);
        return;
      }
      clearGlobalError();
      await refreshAll();
    }

    // --- Totals / month filter ------------------------------------------

    function renderTotals() {
      const container = el('totals-list');
      container.innerHTML = '';

      if (categories.length === 0) {
        return;
      }

      const totals = calculateCategoryTotals(categories, expenses, monthFilter);
      categories.forEach((c) => {
        const row = document.createElement('li');
        row.className = 'totals-item';

        const name = document.createElement('span');
        name.className = 'totals-category-name';
        name.textContent = c.name;

        const total = document.createElement('span');
        total.className = 'totals-amount';
        total.textContent = formatCurrency(totals[c.id] || 0);

        row.appendChild(name);
        row.appendChild(total);
        container.appendChild(row);
      });
    }

    function onMonthFilterChange(event) {
      monthFilter = event.target.value;
      renderTotals();
      renderExpenses();
    }

    function onClearMonthFilter() {
      monthFilter = '';
      el('month-filter').value = '';
      renderTotals();
      renderExpenses();
    }

    // --- Errors -----------------------------------------------------------

    function showGlobalError(message) {
      const banner = el('global-error');
      banner.textContent = message;
      banner.hidden = false;
    }

    function clearGlobalError() {
      const banner = el('global-error');
      banner.hidden = true;
      banner.textContent = '';
    }

    document.addEventListener('DOMContentLoaded', init);
  })();
}

// ---------------------------------------------------------------------------
// Exports for Node's built-in test runner (no-op in the browser).
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
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
    CATEGORY_NAME_TAKEN_MESSAGE,
    GENERIC_ERROR_MESSAGE,
  };
}
