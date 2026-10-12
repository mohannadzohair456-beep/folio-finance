'use strict';
const assert = require('node:assert/strict');
const flow = require('../android/app/src/main/assets/folio-flow.js');
const assistant = require('../android/app/src/main/assets/assistant.js');

function row(partial) {
  return Object.assign({
    currency: 'EGP',
    direction: 'expense',
    amountMinor: 100,
    merchant: 'Shop',
    category: 'Other',
    occurredAt: 1
  }, partial);
}

function assertLinks(built) {
  const income = {};
  const expense = {};
  built.income.forEach(node => { income[node.label] = node.amountMinor; });
  built.expense.forEach(node => { expense[node.label] = node.amountMinor; });
  const outgoing = {};
  const incoming = {};
  let sum = 0;
  built.links.forEach(link => {
    assert.equal(Number.isInteger(link.amountMinor), true, 'link amounts stay whole minor units');
    assert.ok(link.amountMinor >= 0, 'link amounts stay nonnegative');
    outgoing[link.from] = (outgoing[link.from] || 0) + link.amountMinor;
    incoming[link.to] = (incoming[link.to] || 0) + link.amountMinor;
    sum += link.amountMinor;
  });
  Object.keys(outgoing).forEach(label => {
    assert.ok(outgoing[label] <= income[label], label + ' does not send more than it received');
  });
  Object.keys(incoming).forEach(label => {
    assert.ok(incoming[label] <= expense[label], label + ' does not receive more than it spent');
  });
  const incomeTotal = built.income.reduce((total, node) => total + node.amountMinor, 0);
  const expenseTotal = built.expense.reduce((total, node) => total + node.amountMinor, 0);
  assert.equal(built.incomeTotal, incomeTotal);
  assert.equal(built.expenseTotal, expenseTotal);
  assert.equal(sum, built.pool);
  assert.ok(built.pool <= Math.min(incomeTotal, expenseTotal));
  assert.equal(built.held, incomeTotal - built.pool);
  assert.equal(built.uncovered, expenseTotal - built.pool);
  if (incomeTotal > 0 && expenseTotal > 0) assert.equal(built.pool, Math.min(incomeTotal, expenseTotal));
}

const mixed = [
  row({ direction: 'income', amountMinor: 5000, merchant: 'Salary Co', category: 'Salary' }),
  row({ direction: 'expense', amountMinor: 1250, merchant: 'Carrefour', category: 'Food & drinks' }),
  row({ currency: 'USD', direction: 'expense', amountMinor: 9999, merchant: 'Dollar Mart', category: 'Travel' }),
  row({ currency: 'USD', direction: 'income', amountMinor: 50, merchant: 'USD Pay', category: 'Salary' })
];
const snapshot = JSON.stringify(mixed);
const egp = flow.buildMoneyFlow(mixed, 'EGP');
assert.equal(JSON.stringify(mixed), snapshot, 'building a flow does not change the ledger');
assert.equal(egp.currency, 'EGP');
assert.equal(egp.excludedCount, 2);
assert.equal(egp.incomeTotal, 5000);
assert.equal(egp.expenseTotal, 1250);
assert.equal(egp.income.some(node => node.label === 'Dollar Mart' || node.label === 'USD Pay'), false);
assert.equal(egp.expense.some(node => node.label === 'Travel'), false);
assert.equal(egp.summary.includes('USD'), false);
assertLinks(egp);

const usd = flow.buildMoneyFlow(mixed, 'USD');
assert.equal(usd.incomeTotal, 50);
assert.equal(usd.expenseTotal, 9999);
assert.equal(usd.excludedCount, 2);
assert.equal(usd.expense.some(node => node.label === 'Food & drinks'), false);
assertLinks(usd);

const empty = flow.buildMoneyFlow([], 'SAR');
assert.equal(empty.empty, true);
assert.equal(empty.pool, 0);
assert.equal(empty.links.length, 0);
assert.equal(flow.renderFlowSvg(empty), '');
assert.ok(empty.summary.includes('SAR'));

const piastre = flow.buildMoneyFlow([
  row({ direction: 'income', amountMinor: 1, merchant: 'Tip', category: 'Other income' }),
  row({ direction: 'expense', amountMinor: 1, merchant: 'Kiosk', category: 'Food & drinks' })
], 'EGP');
assert.equal(piastre.pool, 1);
assert.equal(piastre.links.length, 1);
assert.equal(piastre.links[0].amountMinor, 1);
assert.equal(piastre.held, 0);
assert.equal(piastre.uncovered, 0);
assertLinks(piastre);

const held = flow.buildMoneyFlow([
  row({ direction: 'income', amountMinor: 100, merchant: 'Client', category: 'Salary' }),
  row({ direction: 'expense', amountMinor: 40, category: 'Transport' })
], 'EGP');
assert.equal(held.held, 60);
assert.equal(held.uncovered, 0);
assert.equal(held.pool, 40);
assertLinks(held);

const uncovered = flow.buildMoneyFlow([
  row({ direction: 'income', amountMinor: 30, merchant: 'Client', category: 'Salary' }),
  row({ direction: 'expense', amountMinor: 50, category: 'Bills & utilities' }),
  row({ direction: 'expense', amountMinor: 30, category: 'Health' })
], 'EGP');
assert.equal(uncovered.held, 0);
assert.equal(uncovered.uncovered, 50);
assert.equal(uncovered.pool, 30);
assertLinks(uncovered);

const awkward = [];
for (let i = 0; i < 3; i++) awkward.push(row({ direction: 'income', amountMinor: 1, merchant: 'Source ' + i, category: 'Salary' }));
for (let i = 0; i < 3; i++) awkward.push(row({ direction: 'expense', amountMinor: 1, merchant: 'Shop ' + i, category: 'Cat ' + i }));
assertLinks(flow.buildMoneyFlow(awkward, 'EGP'));

const many = [];
for (let i = 0; i < 8; i++) {
  many.push(row({ direction: 'income', amountMinor: (8 - i) * 10, merchant: 'Source ' + i, category: 'Salary' }));
  many.push(row({ direction: 'expense', amountMinor: (8 - i) * 7, merchant: 'Shop ' + i, category: 'Cat ' + i }));
}
const collapsed = flow.buildMoneyFlow(many, 'EGP');
assert.equal(collapsed.income.length, 6);
assert.equal(collapsed.expense.length, 6);
assert.equal(collapsed.income[5].label, 'Other income sources');
assert.equal(collapsed.expense[5].label, 'Other spending');
assert.equal(collapsed.income.reduce((total, node) => total + node.amountMinor, 0), many.filter(item => item.direction === 'income').reduce((total, item) => total + item.amountMinor, 0));
assertLinks(collapsed);

const hostile = flow.buildMoneyFlow([
  row({ direction: 'income', amountMinor: 200, merchant: '<img src=x>', category: 'Salary' }),
  row({ direction: 'expense', amountMinor: 200, category: 'Food & drinks' })
], 'EGP');
const svg = flow.renderFlowSvg(hostile);
assert.ok(svg.includes('&lt;img'));
assert.equal(svg.includes('<img'), false);
assert.ok(svg.includes('role="img"'));
assert.ok(svg.includes('<desc>'));
assertLinks(hostile);

assert.equal(flow.keypadAppend('', '5'), '5');
assert.equal(flow.keypadAppend('0', '5'), '5');
assert.equal(flow.keypadAppend('12', '.'), '12.');
assert.equal(flow.keypadAppend('12.', '.'), '12.');
assert.equal(flow.keypadAppend('', '.'), '0.');
assert.equal(flow.keypadAppend('12.5', '0'), '12.50');
assert.equal(flow.keypadAppend('12.50', '9'), '12.50');
assert.equal(flow.keypadAppend('123456789', '9'), '123456789');
assert.equal(flow.keypadAppend('12.50', 'back'), '12.5');
assert.equal(flow.keypadAppend('1', 'a'), '1');
assert.equal(flow.keypadToMinor('12.5'), 1250);
assert.equal(flow.keypadToMinor('12.50'), 1250);
assert.equal(flow.keypadToMinor('7'), 700);
assert.equal(flow.keypadToMinor(''), null);
assert.equal(flow.keypadToMinor('.'), null);
assert.equal(flow.keypadToMinor('0.'), null);
assert.equal(flow.keypadToMinor('0'), null);
assert.equal(flow.keypadToMinor('12.345'), null);
assert.equal(flow.keypadToMinor('nope'), null);
assert.equal(flow.keypadToMinor('100000000.01'), null);

const suggestions = flow.rankCaptureSuggestions([
  row({ merchant: 'Carrefour', category: 'Food & drinks', occurredAt: 30, direction: 'expense', currency: 'EGP' }),
  row({ merchant: 'Carrefour', category: 'Food & drinks', occurredAt: 20, direction: 'expense', currency: 'EGP' }),
  row({ merchant: 'Metro', category: 'Transport', occurredAt: 10, direction: 'expense', currency: 'EGP' }),
  row({ merchant: 'Dollar Mart', category: 'Travel', occurredAt: 40, direction: 'expense', currency: 'USD' }),
  row({ merchant: 'Salary Co', category: 'Salary', occurredAt: 50, direction: 'income', currency: 'EGP' })
], 'EGP', 'expense');
assert.deepEqual(suggestions.recent.map(item => item.label), ['Carrefour', 'Metro']);
assert.equal(suggestions.frequent[0].label, 'Carrefour');
assert.equal(suggestions.frequent[0].count, 2);
assert.equal(suggestions.recent.some(item => item.label === 'Dollar Mart' || item.label === 'Salary Co'), false);
assert.ok(suggestions.categories.some(item => item.label === 'Food & drinks' && item.count === 2));
assert.ok(suggestions.categories.some(item => item.label === 'Health' && item.count === 0));
assert.equal(suggestions.categories.some(item => item.label === 'Travel' || item.label === 'Salary'), false);

const incomeTips = flow.rankCaptureSuggestions([
  row({ merchant: 'Salary Co', category: 'Salary', occurredAt: 5, direction: 'income' }),
  row({ merchant: 'Carrefour', category: 'Food & drinks', occurredAt: 9, direction: 'expense' })
], 'EGP', 'income');
assert.deepEqual(incomeTips.recent.map(item => item.label), ['Salary Co']);
assert.ok(incomeTips.categories.some(item => item.label === 'Refunds'));

const ledger = { currency: 'EGP', transactions: [], budgets: { EGP: {} } };
const ledgerCopy = JSON.stringify(ledger);
const spoken = flow.acceptVoiceTranscript('I spent 50 on coffee', function (text) {
  return assistant.planCommand(text, ledger);
});
assert.equal(spoken.ok, true);
assert.equal(spoken.saved, false);
assert.equal(spoken.draft.type, 'expense');
assert.equal(spoken.draft.amountMinor, 5000);
assert.equal(spoken.draft.title, 'Record expense');
assert.equal(JSON.stringify(ledger), ledgerCopy, 'a voice draft does not write the ledger');

const unknown = flow.acceptVoiceTranscript('hello there', function (text) {
  return assistant.planCommand(text, ledger);
});
assert.equal(unknown.ok, true);
assert.equal(unknown.reason, 'no-draft');
assert.equal(unknown.draft, null);
assert.equal(unknown.saved, false);

const blank = flow.acceptVoiceTranscript('   ', function () { return { action: { type: 'expense' } }; });
assert.equal(blank.ok, false);
assert.equal(blank.reason, 'empty');
assert.equal(blank.saved, false);
assert.equal(blank.draft, null);

const goal = flow.acceptVoiceTranscript('save', function () {
  return { answer: 'Confirm the goal.', proposal: { type: 'savingsGoal', amountMinor: 100, title: 'Save savings goal' } };
});
assert.equal(goal.saved, false);
assert.equal(goal.draft.type, 'savingsGoal');

assert.equal(flow.acceptVoiceTranscript('hello', null).reason, 'no-parser');
assert.equal(flow.acceptVoiceTranscript('hello', function () { throw new Error('bad'); }).reason, 'parse');

console.log('PASS money flow, quick add, and voice drafts');
