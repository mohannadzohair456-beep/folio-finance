'use strict';
const assert = require('node:assert/strict');
const quick = require('../android/app/src/main/assets/quick-entry.js');

function parse(text, currency) {
  return quick.parseQuickEntry(text, { currency: currency || 'EGP', now: 1700000000000 });
}

function expectDraft(text, expected, currency) {
  const ledger = [{ id: 'keep', amountMinor: 1 }];
  const before = JSON.stringify(ledger);
  const result = quick.parseQuickEntry(text, { currency: currency || 'EGP', now: 1700000000000, transactions: ledger });
  assert.equal(JSON.stringify(ledger), before, text + ' does not touch the ledger');
  assert.equal(result.ok, true, text + ' ' + JSON.stringify(result));
  assert.equal(result.saved, false, text + ' is not saved by the parser');
  assert.equal(result.draft.amountMinor, expected.amountMinor, text + ' amount');
  assert.equal(result.draft.direction, expected.direction, text + ' direction');
  assert.equal(result.draft.category, expected.category, text + ' category');
  assert.equal(result.draft.merchant, expected.merchant, text + ' merchant');
  assert.equal(result.draft.currency, currency || 'EGP', text + ' currency');
  assert.equal(result.draft.occurredAt, 1700000000000, text + ' uses the injected clock');
  assert.equal(quick.parseQuickEntry(text, { currency: currency || 'EGP', now: 1700000000000 }).draft.amountMinor, expected.amountMinor, text + ' is deterministic');
}

function expectFail(text, code, currency) {
  const ledger = [{ id: 'keep' }];
  const before = JSON.stringify(ledger);
  const result = quick.parseQuickEntry(text, { currency: currency || 'EGP', now: 1700000000000, transactions: ledger });
  assert.equal(JSON.stringify(ledger), before, text + ' failure does not touch the ledger');
  assert.equal(result.ok, false, text);
  assert.equal(result.saved, false, text);
  assert.equal(result.code, code, text + ' ' + result.code);
  assert.ok(result.messageEn.indexOf('Nothing was saved') >= 0, text + ' english');
  assert.ok(result.messageAr.indexOf('مفيش حاجة اتسجلت') >= 0, text + ' arabic');
  assert.equal(result.draft, undefined, text + ' has no guessed draft');
}

const drafts = [
  ['150 lunch', { amountMinor: 15000, direction: 'expense', category: 'Food & drinks', merchant: 'lunch' }],
  ['lunch 150', { amountMinor: 15000, direction: 'expense', category: 'Food & drinks', merchant: 'lunch' }],
  ['+5000 salary', { amountMinor: 500000, direction: 'income', category: 'Salary', merchant: 'salary' }],
  ['دفعت 200 مواصلات', { amountMinor: 20000, direction: 'expense', category: 'Transport', merchant: 'مواصلات' }],
  ['200 ج اكل', { amountMinor: 20000, direction: 'expense', category: 'Food & drinks', merchant: 'اكل' }],
  ['dafa3t 75 uber', { amountMinor: 7500, direction: 'expense', category: 'Transport', merchant: 'uber' }],
  ['١٥٠ غدا', { amountMinor: 15000, direction: 'expense', category: 'Food & drinks', merchant: 'غدا' }],
  ['٢٠٠٫٥٠ قهوه', { amountMinor: 20050, direction: 'expense', category: 'Food & drinks', merchant: 'قهوه' }],
  ['1,250.50 groceries', { amountMinor: 125050, direction: 'expense', category: 'Food & drinks', merchant: 'groceries' }],
  ['150.5 coffee', { amountMinor: 15050, direction: 'expense', category: 'Food & drinks', merchant: 'coffee' }],
  ['99.99 taxi', { amountMinor: 9999, direction: 'expense', category: 'Transport', merchant: 'taxi' }],
  ['salary 8000', { amountMinor: 800000, direction: 'income', category: 'Salary', merchant: 'salary' }],
  ['+ 2,000 paycheck', { amountMinor: 200000, direction: 'income', category: 'Salary', merchant: 'paycheck' }],
  ['-40 pharmacy', { amountMinor: 4000, direction: 'expense', category: 'Health', merchant: 'pharmacy' }],
  ['refund 15 talabat', { amountMinor: 1500, direction: 'income', category: 'Refunds', merchant: 'refund talabat' }],
  ['صرفت ٥٠ مترو', { amountMinor: 5000, direction: 'expense', category: 'Transport', merchant: 'مترو' }],
  ['استلمت 3000 مرتب', { amountMinor: 300000, direction: 'income', category: 'Salary', merchant: 'مرتب' }],
  ['200 ج.م عشا', { amountMinor: 20000, direction: 'expense', category: 'Food & drinks', merchant: 'عشا' }],
  ['I spent 18.00 on breakfast', { amountMinor: 1800, direction: 'expense', category: 'Food & drinks', merchant: 'breakfast' }],
  ['1.230 lunch', { amountMinor: 123, direction: 'expense', category: 'Food & drinks', merchant: 'lunch' }],
  ['+5,000.50 salary', { amountMinor: 500050, direction: 'income', category: 'Salary', merchant: 'salary' }],
  ['  150   lunch  ', { amountMinor: 15000, direction: 'expense', category: 'Food & drinks', merchant: 'lunch' }],
  ['Dafa3t 75 Uber', { amountMinor: 7500, direction: 'expense', category: 'Transport', merchant: 'Uber' }],
  ['200ج اكل', { amountMinor: 20000, direction: 'expense', category: 'Food & drinks', merchant: 'اكل' }],
  ['ج200 اكل', { amountMinor: 20000, direction: 'expense', category: 'Food & drinks', merchant: 'اكل' }],
  ['١٢٣٫٤٥ اكل', { amountMinor: 12345, direction: 'expense', category: 'Food & drinks', merchant: 'اكل' }],
  ['+100 transfer', { amountMinor: 10000, direction: 'income', category: 'Transfers', merchant: 'transfer' }],
  ['12,500.25 rent', { amountMinor: 1250025, direction: 'expense', category: 'Housing', merchant: 'rent' }],
  ['LUNCH 150', { amountMinor: 15000, direction: 'expense', category: 'Food & drinks', merchant: 'LUNCH' }],
  ['got paid 5000 salary', { amountMinor: 500000, direction: 'income', category: 'Salary', merchant: 'salary' }],
  ['150 notebook', { amountMinor: 15000, direction: 'expense', category: 'Other', merchant: 'notebook' }]
];

drafts.forEach(function (row) { expectDraft(row[0], row[1]); });
expectDraft('200 uber', { amountMinor: 20000, direction: 'expense', category: 'Transport', merchant: 'uber' }, 'USD');

const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
for (let i = 1; i < arabicDigits.length; i++) {
  expectDraft(arabicDigits.charAt(i) + ' قهوه', {
    amountMinor: i * 100,
    direction: 'expense',
    category: 'Food & drinks',
    merchant: 'قهوه'
  });
}
const eastern = '۰۱۲۳۴۵۶۷۸۹';
expectDraft(eastern.charAt(5) + eastern.charAt(0) + ' بنزين', {
  amountMinor: 5000,
  direction: 'expense',
  category: 'Transport',
  merchant: 'بنزين'
});

const failures = [
  ['', 'empty'],
  ['   ', 'empty'],
  ['hello there', 'no-amount'],
  ['???', 'no-amount'],
  ['مية جنيه', 'no-amount'],
  ['150', 'no-label'],
  ['+5000', 'no-label'],
  ['دفعت 200', 'no-label'],
  ['10 and 20 lunch', 'many-amounts'],
  ['12.345 lunch', 'bad-decimals'],
  ['1,50 lunch', 'bad-grouping'],
  ['5k lunch', 'bad-grouping'],
  ['0 lunch', 'zero'],
  ['0.00 coffee', 'zero'],
  ['transfer 100', 'transfer'],
  ['صرفت 100 مرتب', 'mixed'],
  ['USD 20 lunch', 'currency'],
  ['100000001 lunch', 'too-large'],
  ['x'.repeat(241), 'too-long']
];
failures.forEach(function (row) { expectFail(row[0], row[1]); });
expectFail('200 ج اكل', 'currency', 'USD');
expectFail(arabicDigits.charAt(0) + ' قهوه', 'zero');

const ledger = [{ id: 'keep', amountMinor: 1 }];
const snapshot = JSON.stringify(ledger);
const parsed = parse('150 lunch');
const confirmed = quick.confirmQuickEntry(parsed.draft, {
  amountText: '175.25',
  direction: 'income',
  category: 'Salary',
  merchant: 'Payroll',
  occurredAt: 42,
  reviewedAt: 43
});
assert.equal(JSON.stringify(ledger), snapshot, 'confirm does not write the ledger');
assert.equal(confirmed.ok, true);
assert.equal(confirmed.saved, false, 'confirm still has not saved');
assert.equal(confirmed.transaction.amountMinor, 17525);
assert.equal(confirmed.transaction.direction, 'income');
assert.equal(confirmed.transaction.category, 'Salary');
assert.equal(confirmed.transaction.merchant, 'Payroll');
assert.equal(confirmed.transaction.currency, 'EGP');
assert.equal(confirmed.transaction.occurredAt, 42);
assert.equal(confirmed.transaction.reviewedAt, 43);
assert.equal(confirmed.transaction.source, 'manual');
assert.equal(confirmed.transaction.status, 'confirmed');
assert.equal(confirmed.transaction.review, false);
assert.equal(quick.formatAmountMajor(confirmed.transaction.amountMinor), '175.25');
assert.equal(quick.formatAmountMajor(5), '0.05');

const committed = quick.commitToLedger(ledger, confirmed.transaction);
assert.equal(ledger.length, 1, 'commit copies the ledger');
assert.equal(JSON.stringify(ledger), snapshot);
assert.equal(committed.saved, true);
assert.equal(committed.transactions.length, 2);
assert.equal(committed.transactions[0].id, 'keep');
assert.equal(committed.transactions[1].status, 'confirmed');
assert.equal(quick.commitToLedger(ledger, { status: 'suggested', review: true, amountMinor: 100, direction: 'expense' }).saved, false);
assert.equal(ledger.length, 1, 'a suggested row is not committed');

const untouched = parse('150 lunch');
assert.equal(quick.confirmQuickEntry(untouched.draft, {
  amountText: '12.345',
  direction: 'expense',
  category: 'Other',
  merchant: 'x',
  occurredAt: 1
}).ok, false);
assert.equal(quick.confirmQuickEntry(untouched.draft, {
  amountText: '10',
  direction: 'sideways',
  category: 'Other',
  merchant: 'x',
  occurredAt: 1
}).code, 'bad-direction');
assert.equal(quick.confirmQuickEntry(untouched.draft, {
  amountText: '10',
  direction: 'expense',
  category: 'Not a category',
  merchant: 'x',
  occurredAt: 1
}).code, 'bad-category');
assert.equal(quick.confirmQuickEntry(untouched.draft, {
  amountText: '10',
  direction: 'expense',
  category: 'Other',
  merchant: '   ',
  occurredAt: 1
}).code, 'no-merchant');
assert.equal(quick.confirmQuickEntry(untouched.draft, {
  amountText: '',
  direction: 'expense',
  category: 'Other',
  merchant: 'x',
  occurredAt: 1
}).saved, false);
assert.equal(ledger.length, 1, 'rejected edits leave the ledger unchanged');

const same = parse('١٥٠ غدا');
assert.deepEqual(same, parse('١٥٠ غدا'));
assert.ok(drafts.length + failures.length >= 25, 'parser coverage includes at least 25 vectors');

console.log('PASS quick entry parser and confirm-before-save (' + drafts.length + ' drafts, ' + failures.length + ' refusals, arabic digits ٠-٩)');
