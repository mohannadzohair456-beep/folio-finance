'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const A = require('../android/app/src/main/assets/assistant.js');

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    console.error('FAIL', name);
    throw err;
  }
}

function expectParse(text, expected) {
  const got = A.parse(text);
  for (const key of Object.keys(expected)) {
    assert.deepEqual(got[key], expected[key], text + ' → ' + key + ' ' + JSON.stringify(got));
  }
  if (got.amount_minor != null) assert.equal(Number.isInteger(got.amount_minor), true, text);
  assert.ok(got.confidence >= 0 && got.confidence <= 1, text);
  assert.equal(typeof got.needs_confirmation, 'boolean', text);
  return got;
}

const cases = [
  ['My salary is 15,000', { intent: 'set_salary', amount_minor: 1500000, currency: 'EGP', category: null, confidence: 0.88, needs_confirmation: true, currency_explicit: false }],
  ['My salary is 15000', { intent: 'set_salary', amount_minor: 1500000, currency: 'EGP', needs_confirmation: true }],
  ['My monthly budget is 5,000', { intent: 'set_budget', amount_minor: 500000, currency: 'EGP', category: null, confidence: 0.88, needs_confirmation: true }],
  ['Can I afford 1,500?', { intent: 'can_afford', amount_minor: 150000, currency: 'EGP', needs_confirmation: false, confidence: 0.88 }],
  ['Can I afford 3000?', { intent: 'can_afford', amount_minor: 300000, needs_confirmation: false }],
  ['I spent 200 on coffee', { intent: 'add_expense', amount_minor: 20000, currency: 'EGP', category: 'Food & drinks', merchant: 'Coffee', needs_confirmation: true }],
  ['I have 20000 in my bank', { intent: 'set_balance', amount_minor: 2000000, currency: 'EGP', needs_confirmation: true }],
  ['I have 20,000 EGP in my bank account', { intent: 'set_balance', amount_minor: 2000000, currency: 'EGP', currency_explicit: true, confidence: 0.95 }],
  ['مرتبي ١٥ ألف جنيه', { intent: 'set_salary', amount_minor: 1500000, currency: 'EGP', currency_explicit: true, confidence: 0.95, needs_confirmation: true }],
  ['دفعت ٢٠٠ جنيه في مطعم', { intent: 'add_expense', amount_minor: 20000, currency: 'EGP', category: 'Food & drinks', merchant: 'مطعم', needs_confirmation: true }],
  ['20 thousand pounds', { intent: 'unknown', confidence: 0, needs_confirmation: false }],
  ['٢٠ ألف جنيه', { intent: 'unknown', amount_minor: null, confidence: 0 }],
  ['20 ألف', { intent: 'unknown', confidence: 0 }],
  ['20k', { intent: 'unknown', confidence: 0, needs_confirmation: false }],
  ['Um, my salary is, like, 15,000.', { intent: 'set_salary', amount_minor: 1500000, confidence: 0.83, warnings: ['recognition_noise'] }],
  ['my salary salary is is 15000', { intent: 'set_salary', amount_minor: 1500000, confidence: 0.83, warnings: ['recognition_noise'] }],
  ['hey folio I spent 200 on coffee', { intent: 'add_expense', amount_minor: 20000, category: 'Food & drinks', merchant: 'Coffee', confidence: 0.83 }],
  ['my balance is 20000 e g p', { intent: 'set_balance', amount_minor: 2000000, currency: 'EGP', currency_explicit: true, confidence: 0.9 }],
  ['my balance is 20 kay', { intent: 'set_balance', amount_minor: 2000000, confidence: 0.83, warnings: ['recognition_noise'] }],
  ['my salary is twenty thousand', { intent: 'set_salary', amount_minor: 2000000, currency: 'EGP' }],
  ['can I afford fifteen hundred dollars', { intent: 'can_afford', amount_minor: 150000, currency: 'USD', currency_explicit: true, confidence: 0.95, needs_confirmation: false }],
  ['مرتبي خمستاشر الف', { intent: 'set_salary', amount_minor: 1500000, currency: 'EGP', currency_explicit: false }],
  ['رصيدي ٢٠٬٠٠٠ جنيه', { intent: 'set_balance', amount_minor: 2000000, currency: 'EGP', currency_explicit: true }],
  ['دفعت ١٠٫٥٠ على القهوه', { intent: 'add_expense', amount_minor: 1050, category: 'Food & drinks' }],
  ['I spent 10 point 5 on coffee', { intent: 'add_expense', amount_minor: 1050, category: 'Food & drinks', confidence: 0.83, warnings: ['recognition_noise'] }],
  ['I received my salary of 15000', { intent: 'add_income', amount_minor: 1500000, category: 'Salary', needs_confirmation: true }],
  ['my income is 5000', { intent: 'add_income', amount_minor: 500000, category: 'Other income' }],
  ['I earned 500 a month', { intent: 'set_salary', amount_minor: 50000, category: null }],
  ['I earned 500', { intent: 'add_income', amount_minor: 50000, category: 'Other income' }],
  ['budget for food is 2000', { intent: 'set_budget', amount_minor: 200000, category: 'Food & drinks' }],
  ['food budget is 2000', { intent: 'set_budget', amount_minor: 200000, category: 'Food & drinks' }],
  ['I have a budget of 5000', { intent: 'set_budget', amount_minor: 500000, category: null }],
  ['what is my balance', { intent: 'unknown', confidence: 0, needs_confirmation: false }],
  ["what's my salary", { intent: 'unknown', confidence: 0 }],
  ['my balance is 20km', { intent: 'unknown', confidence: 0 }],
  ['I spent 100 and my salary is 5000', { intent: 'unknown', confidence: 0 }],
  ['500 EGP and 20 USD', { intent: 'unknown', confidence: 0 }],
  ['transfer 500 to Ahmed', { intent: 'unknown', confidence: 0 }],
  ['delete my last expense', { intent: 'unknown', confidence: 0 }],
  ['hello', { intent: 'unknown', confidence: 0, needs_confirmation: false }],
  ['set it to 500', { intent: 'unknown', confidence: 0 }],
  ['how much should I save', { intent: 'unknown', confidence: 0 }],
  ['I spent 0', { intent: 'unknown', confidence: 0 }],
  ['my balance is 0', { intent: 'set_balance', amount_minor: 0, needs_confirmation: true }],
  ['my balance is -5', { intent: 'unknown', confidence: 0 }],
  ['I spent 10.555', { intent: 'unknown', confidence: 0 }],
  ['I spent 50 on coffee and uber', { intent: 'unknown', confidence: 0 }],
  ['how much did I spend on widgets', { intent: 'unknown', confidence: 0 }],
  ['how much did I spend on food', { intent: 'category_spend', amount_minor: null, category: 'Food & drinks', confidence: 0.95, needs_confirmation: false }],
  ['how much did I spend', { intent: 'category_spend', category: null, amount_minor: null, needs_confirmation: false }],
  ['what can I spend', { intent: 'safe_to_spend', amount_minor: null, confidence: 0.95, needs_confirmation: false }],
  ['اقدر اصرف كام', { intent: 'safe_to_spend', needs_confirmation: false, confidence: 0.95 }],
  ['هل اقدر اشتري ب 1500', { intent: 'can_afford', amount_minor: 150000, needs_confirmation: false }],
  ['ينفع اشتري موبايل ب 2000', { intent: 'can_afford', amount_minor: 200000, category: 'Bills & utilities' }],
  ['هخلص الشهر بكام', { intent: 'month_end_projection', amount_minor: null, needs_confirmation: false, confidence: 0.95 }],
  ['عايز اوفر 10000', { intent: 'savings_goal', amount_minor: 1000000, needs_confirmation: true }],
  ['save 10000 for emergency', { intent: 'savings_goal', amount_minor: 1000000, category: 'Emergency', needs_confirmation: true }],
  ['I want to save 20k', { intent: 'savings_goal', amount_minor: 2000000 }],
  ['limit for transport is 500', { intent: 'set_budget', amount_minor: 50000, category: 'Transport' }],
  ['my balance is 500 SAR', { intent: 'set_balance', amount_minor: 50000, currency: 'SAR', currency_explicit: true, confidence: 0.95 }],
  ['I have $20.50', { intent: 'set_balance', amount_minor: 2050, currency: 'USD', currency_explicit: true, confidence: 0.86 }],
  ['I spent 50 bucks on coffee', { intent: 'add_expense', amount_minor: 5000, currency: 'USD', category: 'Food & drinks' }],
  ["I've got 5000 in my bank", { intent: 'set_balance', amount_minor: 500000 }],
  ['my salary is', { intent: 'set_salary', amount_minor: null, confidence: 0.7, needs_confirmation: true }],
  ['my budget is 1.5k', { intent: 'set_budget', amount_minor: 150000 }],
  ['I spent 2m on rent', { intent: 'add_expense', amount_minor: 200000000, category: 'Housing', merchant: 'Rent' }],
  ['my salary is 2 and a half thousand', { intent: 'set_salary', amount_minor: 250000 }],
  ['salary is 15 000', { intent: 'set_salary', amount_minor: 1500000 }],
  ['رصيدي 500 ج.م', { intent: 'set_balance', amount_minor: 50000, currency: 'EGP', currency_explicit: true, confidence: 0.9 }],
  ['balance is 500 l.e.', { intent: 'set_balance', amount_minor: 50000, currency_explicit: true }],
  ['صرفت كام على الاكل', { intent: 'category_spend', category: 'Food & drinks', needs_confirmation: false }],
  ['قبضت ٢٠ الف', { intent: 'add_income', amount_minor: 2000000, category: 'Other income' }],
  ['بقبض ٢٠ الف', { intent: 'set_salary', amount_minor: 2000000, category: null }],
  ['نزل المرتب ١٥٠٠٠', { intent: 'add_income', amount_minor: 1500000, category: 'Salary' }],
  ['how much is left', { intent: 'safe_to_spend', needs_confirmation: false }],
  ['budget left', { intent: 'safe_to_spend', needs_confirmation: false }],
  ['monthly spending', { intent: 'category_spend', category: null, needs_confirmation: false }],
  ['Can I afford it?', { intent: 'can_afford', amount_minor: null, confidence: 0.7, needs_confirmation: false }],
  ['set my balance to 20k', { intent: 'set_balance', amount_minor: 2000000 }],
  ['I spent like 200', { intent: 'add_expense', amount_minor: 20000, category: 'Other', confidence: 0.83 }],
  ['مُرَتَّبِي ١٥ أَلْف جُنَيْه', { intent: 'set_salary', amount_minor: 1500000, currency_explicit: true, confidence: 0.95 }],
  ['How am I doing?', { intent: 'unknown', needs_confirmation: false }],
  ['', { intent: 'unknown', confidence: 0 }],
  ['   ', { intent: 'unknown', confidence: 0 }]
];

check('case table has at least 60 utterances', () => {
  assert.ok(cases.length >= 60, 'cases ' + cases.length);
});

for (const [text, expected] of cases) {
  check('parse: ' + text, () => expectParse(text, expected));
}

check('detectAmount keeps major units for the legacy callers', () => {
  assert.equal(A.detectAmount('20 thousand pounds'), 20000);
  assert.equal(A.detectAmount('٢٠ ألف جنيه'), 20000);
  assert.equal(A.detectAmount('20k'), 20000);
  assert.equal(A.detectAmount('20 ألف'), 20000);
  assert.equal(A.numberValue('fifteen hundred'), 1500);
  assert.equal(A.detectAmount('20km'), null);
  assert.equal(A.detectAmount('I spent 10.50 on coffee'), 10.5);
});

check('writes need confirmation and questions do not', () => {
  for (const intent of ['set_balance', 'set_salary', 'set_budget', 'add_expense', 'add_income', 'savings_goal']) {
    assert.equal(A.INTENTS.indexOf(intent) >= 0, true);
  }
  assert.equal(A.parse('my salary is 15000').needs_confirmation, true);
  assert.equal(A.parse('Can I afford 100?').needs_confirmation, false);
  assert.equal(A.parse('what can I spend').needs_confirmation, false);
  assert.equal(A.parse('هخلص الشهر').needs_confirmation, false);
});

check('planCommand preserves the legacy action shape', () => {
  const salary = A.planCommand('My salary is 15,000');
  assert.equal(salary.action.type, 'incomePlan');
  assert.equal(salary.action.amountMinor, 1500000);
  assert.equal(salary.action.title, 'Save expected monthly income');
  assert.equal(salary.needs_confirmation, true);
  const budget = A.planCommand('My monthly budget is 5,000');
  assert.equal(budget.action.type, 'budget');
  assert.equal(budget.action.amountMinor, 500000);
  assert.equal(budget.action.title, 'Set monthly budget');
  const food = A.planCommand('budget for food is 2,000');
  assert.equal(food.action.type, 'categoryBudget');
  assert.equal(food.action.amount, 2000);
  assert.equal(food.action.amountMinor, 200000);
  assert.equal(food.action.category, 'Food & drinks');
  assert.equal(food.action.title, 'Set category budget');
  const spent = A.planCommand('I spent 200 on coffee');
  assert.equal(spent.action.type, 'expense');
  assert.equal(spent.action.amountMinor, 20000);
  assert.equal(spent.action.merchant, 'Coffee');
  assert.equal(spent.action.category, 'Food & drinks');
  assert.equal(spent.action.title, 'Record expense');
  const balance = A.planCommand('I have 20000 in my bank');
  assert.equal(balance.action.type, 'balance');
  assert.equal(balance.action.amountMinor, 2000000);
  assert.equal(balance.action.title, 'Record balance snapshot');
  const afford = A.planCommand('Can I afford 3000?');
  assert.equal(afford.action, undefined);
  assert.equal(afford.needs_confirmation, false);
  assert.match(afford.answer, /estimate|discretionary|balance/i);
  assert.equal(/^yes\b/i.test(afford.answer), false);
  const goal = A.planCommand('I want to save 20k');
  assert.equal(goal.action, undefined);
  assert.equal(goal.proposal.type, 'savingsGoal');
  assert.equal(goal.proposal.amountMinor, 2000000);
  assert.equal(goal.needs_confirmation, true);
  const incomplete = A.planCommand('my salary is');
  assert.equal(incomplete.action, undefined);
  assert.equal(incomplete.needs_confirmation, true);
});

check('planCommand uses the ledger currency when the utterance names none', () => {
  const led = A.planCommand('I spent 10', { currency: 'SAR', transactions: [] });
  assert.equal(led.currency, 'SAR');
  assert.equal(led.amount_minor, 1000);
  assert.equal(led.action.currency, 'SAR');
  const blocked = A.planCommand('I spent 10 pounds', { currency: 'USD', transactions: [] });
  assert.equal(blocked.currency, 'EGP');
  assert.equal(blocked.action, undefined);
  assert.equal(blocked.needs_confirmation, true);
  assert.match(blocked.answer, /not match the open ledger|will not convert/i);
});

check('legacy summary still answers and does not write', () => {
  const now = Date.UTC(2026, 9, 12, 12);
  const state = {
    currency: 'EGP', now: now, timeZone: '+00:00',
    reportedBalanceMinor: 100000, balanceReportedAt: Date.UTC(2026, 9, 1),
    monthlyIncomeMinor: 500000, transactions: []
  };
  const summary = A.planCommand('How am I doing?', state);
  assert.equal(summary.intent, 'unknown');
  assert.equal(summary.legacy_summary, true);
  assert.equal(summary.action, undefined);
  assert.match(summary.answer, /received income/);
  assert.match(summary.answer, /salary plan/);
  assert.equal(A.planCommand('صرفنا', state).legacy_summary, true);
});

const now = Date.UTC(2026, 9, 12, 12, 0, 0);
const ledger = {
  currency: 'EGP',
  now: now,
  timeZone: '+00:00',
  reportedBalanceMinor: 100000,
  balanceReportedAt: Date.UTC(2026, 9, 1),
  monthlyIncomeMinor: 500000,
  monthlyBudgetMinor: 80000,
  transactions: [
    { amountMinor: 20000, currency: 'EGP', direction: 'expense', category: 'Food & drinks', occurredAt: Date.UTC(2026, 9, 5) },
    { amountMinor: 999, currency: 'USD', direction: 'expense', category: 'Food & drinks', occurredAt: Date.UTC(2026, 9, 5) }
  ]
};

check('safe to spend uses the budget cap and ignores planned income', () => {
  const safe = A.safeToSpend(ledger);
  assert.equal(safe.amount_minor, 60000);
  assert.equal(safe.balance_track, 'self_reported');
  assert.equal(safe.currency, 'EGP');
  assert.deepEqual(safe.assumed, ['emergency_reserve', 'upcoming_bills', 'verified_balance']);
  assert.equal(safe.details.cash_minor, 80000);
  assert.equal(safe.details.planned_income_minor, 500000);
  assert.equal(safe.details.budget_remaining_minor, 60000);
  assert.equal(safe.details.excluded_other_currency, 1);
  assert.match(safe.explanation, /self-reported/);
  assert.match(safe.explanation, /not received cash/);
  assert.match(safe.explanation, /Nothing was converted/);
  assert.notEqual(safe.amount_minor, safe.details.cash_minor + safe.details.planned_income_minor);
});

check('can_afford is pure and refuses a different currency', () => {
  const yes = A.canAfford(ledger, { amount_minor: 50000, currency: 'EGP' });
  assert.equal(yes.affordable, true);
  assert.equal(yes.amount_minor, 10000);
  assert.match(yes.explanation, /not approval or a guarantee/);
  assert.equal(/^yes\b/i.test(yes.explanation), false);
  assert.match(yes.explanation, /EGP 500\.00/);
  assert.match(yes.explanation, /EGP 100\.00/);
  const no = A.canAfford(ledger, 70000);
  assert.equal(no.affordable, false);
  assert.equal(no.amount_minor, -10000);
  assert.deepEqual(no.assumed, ['cost_currency', 'emergency_reserve', 'upcoming_bills', 'verified_balance']);
  const mixed = A.canAfford(ledger, { amount_minor: 100, currency: 'USD' });
  assert.equal(mixed.affordable, null);
  assert.equal(mixed.amount_minor, null);
  assert.deepEqual(mixed.assumed, ['no_fx_conversion']);
  assert.match(mixed.explanation, /never converted or mixed/);
});

check('month-end projection keeps planned income apart from received income', () => {
  const projected = A.monthEndProjection(ledger);
  assert.equal(projected.amount_minor, 520000);
  assert.equal(projected.details.projected_inflow_minor, 500000);
  assert.equal(projected.details.expected_outflow_minor, 60000);
  assert.equal(projected.details.received_income_minor, 0);
  assert.deepEqual(projected.assumed, ['planned_income_still_expected', 'upcoming_bills', 'verified_balance']);
  assert.match(projected.explanation, /not yet received/);
  assert.match(projected.explanation, /not money available now/);
  assert.match(projected.explanation, /Received income this month/);
  assert.equal(/verified balance/i.test(projected.explanation), false);
  const paceState = Object.assign({}, ledger, { monthlyBudgetMinor: 0 });
  const pace = A.monthEndProjection(paceState);
  assert.equal(pace.amount_minor, 548333);
  assert.ok(pace.assumed.indexOf('spend_pace') >= 0);
  assert.ok(pace.assumed.indexOf('monthly_budget') >= 0);
});

check('category spend ignores other currencies and other categories', () => {
  const food = A.categorySpend(ledger, 'Food & drinks');
  assert.equal(food.amount_minor, 20000);
  assert.equal(food.details.excluded_other_currency, 1);
  assert.deepEqual(food.assumed, []);
  assert.match(food.explanation, /Food & drinks/);
  assert.match(food.explanation, /2026-10/);
  assert.equal(A.categorySpend(ledger, 'Transport').amount_minor, 0);
});

check('verified balance is not blended with the self-reported snapshot', () => {
  const state = {
    currency: 'EGP', now: now, timeZone: '+00:00',
    verifiedBalanceMinor: 40000,
    verifiedBalanceAt: Date.UTC(2026, 9, 10),
    reportedBalanceMinor: 100000,
    balanceReportedAt: Date.UTC(2026, 9, 1),
    upcomingBills: [],
    emergencyReserveMinor: 0,
    transactions: [
      { amountMinor: 10000, currency: 'EGP', direction: 'expense', category: 'Transport', occurredAt: Date.UTC(2026, 9, 11) },
      { amountMinor: 50000, currency: 'EGP', direction: 'expense', category: 'Food & drinks', occurredAt: Date.UTC(2026, 9, 5) }
    ]
  };
  const safe = A.safeToSpend(state);
  assert.equal(safe.balance_track, 'verified');
  assert.equal(safe.amount_minor, 30000);
  assert.equal(safe.details.cash_minor, 30000);
  assert.equal(/verified balance/i.test(safe.explanation), false);
  assert.match(safe.explanation, /not a balance your bank confirmed/);
  assert.match(safe.explanation, /not added/);
  assert.match(safe.explanation, /not a guarantee/i);
  assert.ok(safe.assumed.indexOf('verified_balance') < 0);
  assert.ok(safe.assumed.indexOf('monthly_budget') >= 0);
});

check('legacy category budgets are major units', () => {
  const state = {
    currency: 'EGP', now: now, timeZone: '+00:00',
    reportedBalanceMinor: 500000,
    balanceReportedAt: Date.UTC(2026, 9, 1),
    upcomingBills: [],
    emergencyReserveMinor: 0,
    budgets: { EGP: { 'Food & drinks': 100 } },
    transactions: [
      { amountMinor: 2000, currency: 'EGP', direction: 'expense', category: 'Food & drinks', occurredAt: Date.UTC(2026, 9, 3) }
    ]
  };
  const safe = A.safeToSpend(state, { category: 'Food & drinks' });
  assert.equal(safe.details.category_budget_minor, 10000);
  assert.equal(safe.amount_minor, 8000);
});

check('missing balance is not invented', () => {
  const safe = A.safeToSpend({});
  assert.equal(safe.amount_minor, null);
  assert.match(safe.explanation, /No balance was invented/);
  for (const key of ['self_reported_balance', 'verified_balance', 'upcoming_bills', 'emergency_reserve', 'monthly_budget']) {
    assert.ok(safe.assumed.indexOf(key) >= 0, key);
  }
  const spent = A.categorySpend({});
  assert.equal(spent.amount_minor, 0);
  assert.deepEqual(spent.assumed, ['currency', 'now', 'transactions']);
  const projected = A.monthEndProjection({});
  assert.equal(projected.amount_minor, null);
  assert.match(projected.explanation, /Nothing was projected/);
  assert.ok(projected.assumed.indexOf('now') >= 0);
});

check('snake_case state aliases and explicit reserve are honored', () => {
  const state = {
    currency: 'EGP', now: now, timeZone: '+00:00',
    self_reported_balance_minor: 80000,
    self_reported_at: Date.UTC(2026, 9, 1),
    planned_income_minor: 1000,
    emergency_reserve_minor: 10000,
    upcoming_bills: [{ amount_minor: 5000, currency: 'EGP', due_at: Date.UTC(2026, 9, 20) }],
    transactions: []
  };
  const safe = A.safeToSpend(state);
  assert.equal(safe.amount_minor, 65000);
  assert.equal(safe.details.reserve_minor, 10000);
  assert.equal(safe.details.bills_minor, 5000);
  assert.ok(safe.assumed.indexOf('emergency_reserve') < 0);
  assert.ok(safe.assumed.indexOf('upcoming_bills') < 0);
});

check('calculators do not mutate state and are deterministic', () => {
  const snapshot = JSON.stringify(ledger);
  const frozen = JSON.parse(snapshot);
  freeze(frozen);
  assert.doesNotThrow(() => {
    A.safeToSpend(frozen);
    A.canAfford(frozen, { amount_minor: 100, currency: 'EGP' });
    A.monthEndProjection(frozen);
    A.categorySpend(frozen, 'Food & drinks');
    A.planCommand('I spent 200 on coffee', frozen);
  });
  assert.equal(JSON.stringify(ledger), snapshot);
  assert.equal(JSON.stringify(A.parse('مرتبي ١٥ ألف جنيه')), JSON.stringify(A.parse('مرتبي ١٥ ألف جنيه')));
  assert.equal(A.safeToSpend(ledger).amount_minor, A.safeToSpend(ledger).amount_minor);
});

check('bad inputs do not throw', () => {
  for (const value of [null, undefined, 20000, {}, [], 'x'.repeat(800)]) {
    const parsed = A.parse(value);
    assert.equal(typeof parsed.intent, 'string');
    assert.equal(typeof parsed.needs_confirmation, 'boolean');
  }
  assert.equal(A.parse(null).intent, 'unknown');
  assert.equal(A.parse(20000).intent, 'unknown');
  assert.equal(A.canAfford(ledger, 'later').affordable, null);
  assert.deepEqual(A.canAfford(ledger, 0).assumed, ['cost']);
});

check('the bundle stays offline and clock-free', () => {
  const src = fs.readFileSync(path.join(__dirname, '../android/app/src/main/assets/assistant.js'), 'utf8');
  assert.equal(/Date\.now\(/.test(src), false);
  assert.equal(/new Date\(\)/.test(src), false);
  assert.equal(/\bfetch\(/.test(src), false);
  assert.equal(/XMLHttpRequest/.test(src), false);
  assert.deepEqual(A.INTENTS, [
    'set_balance', 'set_salary', 'set_budget', 'add_expense', 'add_income',
    'savings_goal', 'can_afford', 'safe_to_spend', 'category_spend',
    'month_end_projection', 'unknown'
  ]);
});

const Runway = require('../android/app/src/main/assets/payday-runway.js');

check('payday runway flag stays off the existing safe-to-spend path', () => {
  const off = Object.assign({}, ledger, {
    experimentalPaydayRunway: false,
    paydayDate: '2026-10-26',
    paydayAmountMinor: 1,
    paydayCurrency: 'EGP',
    upcomingBills: [],
    installments: [],
    gameya: [],
    savingsReservedMinor: 0,
    emergencyReserveMinor: 0
  });
  assert.equal(A.safeToSpend(off).amount_minor, A.safeToSpend(ledger).amount_minor);
  assert.match(A.canAfford(off, { amount_minor: 50000, currency: 'EGP' }).explanation, /not approval or a guarantee/);
});

check('payday runway flag explains can_afford and safe_to_spend with numbers', () => {
  const clock = Date.parse('2026-10-12T09:00:00.000Z');
  const state = {
    experimentalPaydayRunway: true,
    currency: 'EGP',
    now: clock,
    timeZone: '+03:00',
    reportedBalanceMinor: 14000,
    balanceReportedAt: clock - 86400000,
    monthlyBudgetMinor: 100,
    monthlyIncomeMinor: 900000,
    paydayDate: '2026-10-26',
    paydayAmountMinor: 900000,
    paydayCurrency: 'EGP',
    commitments: [],
    savingsReservedMinor: 0,
    emergencyReserveMinor: 0,
    transactions: [
      { id: 'pending', amountMinor: 5000, currency: 'EGP', direction: 'expense', source: 'notification', review: true, occurredAt: clock - 1000 }
    ]
  };
  const engine = Runway.evaluate({
    now: clock,
    currency: 'EGP',
    reportedBalanceMinor: 14000,
    balanceReportedAt: state.balanceReportedAt,
    transactions: [],
    paydayDate: '2026-10-26',
    paydayAmountMinor: 900000,
    paydayCurrency: 'EGP',
    commitments: [],
    savingsReservedMinor: 0,
    emergencyBufferMinor: 0
  });
  const safe = A.safeToSpend(state);
  assert.equal(engine.status, 'ok');
  assert.equal(engine.safe_to_spend_minor, 14000);
  assert.equal(engine.per_day_minor, 1000);
  assert.equal(safe.amount_minor, 14000);
  assert.equal(safe.details.available_now_minor, 14000);
  assert.equal(safe.details.unconfirmed_net_minor, -5000);
  assert.match(safe.explanation, /available now/i);
  assert.match(safe.explanation, /waiting for review/);
  assert.match(safe.explanation, /auto-confirmed/i);
  assert.equal(safe.details.status, 'ok');
  assert.equal(safe.details.per_day_minor, 1000);
  assert.match(safe.explanation, /EGP 140\.00/);
  assert.match(safe.explanation, /EGP 10\.00/);
  assert.match(safe.explanation, /per day/);
  assert.notEqual(safe.explanation, 'Yes');
  assert.notEqual(safe.explanation, 'No');
  const classic = A.safeToSpend(Object.assign({}, state, { experimentalPaydayRunway: false }));
  assert.notEqual(classic.amount_minor, safe.amount_minor);
  const yes = A.canAfford(state, { amount_minor: 5000, currency: 'EGP' });
  assert.equal(yes.affordable, true);
  assert.equal(yes.amount_minor, 9000);
  assert.match(yes.explanation, /EGP 50\.00/);
  assert.match(yes.explanation, /EGP 90\.00/);
  assert.equal(/^(Yes|No)\.?$/.test(yes.explanation), false);
  const no = A.canAfford(state, { amount_minor: 20000, currency: 'EGP' });
  assert.equal(no.affordable, false);
  assert.match(no.explanation, /EGP 200\.00/);
  assert.match(no.explanation, /not approval or a guarantee/);
  assert.equal(/^no\b/i.test(no.explanation), false);
  const missing = Object.assign({}, state);
  delete missing.paydayDate;
  const blocked = A.canAfford(missing, { amount_minor: 5000, currency: 'EGP' });
  assert.equal(blocked.affordable, null);
  assert.equal(blocked.amount_minor, null);
  assert.match(blocked.explanation, /insufficient data/);
  assert.ok(blocked.details.missing.indexOf('payday_date') >= 0);
  assert.match(blocked.explanation, /EGP 50\.00/);
  const asked = A.planCommand('Can I afford 50?', state);
  assert.equal(asked.intent, 'can_afford');
  assert.match(asked.answer, /EGP 140\.00/);
  assert.match(asked.answer, /EGP 50\.00/);
  const mixed = A.canAfford(state, { amount_minor: 100, currency: 'USD' });
  assert.equal(mixed.affordable, null);
  assert.match(mixed.explanation, /never converted or mixed/);
});

check('a flagged runway without the engine does not invent a number', () => {
  const saved = global.FolioPaydayRunway;
  delete global.FolioPaydayRunway;
  try {
    const safe = A.safeToSpend({ experimentalPaydayRunway: true, currency: 'EGP', reportedBalanceMinor: 1, balanceReportedAt: 1 });
    assert.equal(safe.amount_minor, null);
    assert.match(safe.explanation, /insufficient data/);
    assert.equal(A.canAfford({ experimentalPaydayRunway: true }, { amount_minor: 100, currency: 'EGP' }).affordable, null);
  } finally {
    global.FolioPaydayRunway = saved;
  }
});

check('browser global matches the Node export', () => {
  const src = fs.readFileSync(path.join(__dirname, '../android/app/src/main/assets/assistant.js'), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(src, context);
  const parsed = context.FolioAssistant.parse('Can I afford 1,500?');
  assert.equal(parsed.intent, 'can_afford');
  assert.equal(parsed.amount_minor, 150000);
  assert.equal(parsed.needs_confirmation, false);
});

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const key of Object.keys(value)) freeze(value[key]);
}

check('Arabic and Arabizi questions get an Egyptian Arabic estimate, not approval', () => {
  const state = {
    currency: 'EGP', now: now, timeZone: '+00:00',
    reportedBalanceMinor: 200000, balanceReportedAt: Date.UTC(2026, 9, 1),
    upcomingBills: [], emergencyReserveMinor: 0, transactions: []
  };
  const arabic = A.planCommand('اقدر اشتري 300 جنيه؟', state);
  assert.equal(arabic.intent, 'can_afford');
  assert.equal(arabic.amount_minor, 30000);
  assert.match(arabic.answer, /جنيه/);
  assert.match(arabic.answer, /مش موافقة/);
  assert.equal(/اصرف براحتك|أكيد تقدر/.test(arabic.answer), false);
  const arabizi = A.planCommand('a2dar ashtary 300 geneh', state);
  assert.equal(arabizi.intent, 'can_afford');
  assert.equal(arabizi.amount_minor, 30000);
  assert.match(arabizi.answer, /جنيه/);
  assert.match(arabizi.answer, /مش موافقة/);
  const spend = A.planCommand('a2dar asrof kam', state);
  assert.equal(spend.intent, 'safe_to_spend');
  assert.match(spend.answer, /تقديري/);
  assert.equal(/verified balance/i.test(spend.answer), false);
  const english = A.planCommand('Can I afford 300?', state);
  assert.equal(english.intent, 'can_afford');
  assert.match(english.answer, /not approval or a guarantee/);
  assert.equal(/[\u0600-\u06FF]/.test(english.answer), false);
  const balance = A.planCommand('el rasid 1500 geneh', state);
  assert.equal(balance.intent, 'set_balance');
  assert.match(balance.answer, /جنيه/);
  assert.equal(/verified balance/i.test(balance.answer), false);
});

console.log('PASS Ask Folio assistant engine (' + passed + ' checks, ' + cases.length + ' parse cases)');
