'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = require('../android/app/src/main/assets/payday-runway.js');

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

const NOW = Date.parse('2026-10-12T09:00:00.000Z');
const SNAP = Date.parse('2026-10-10T09:00:00.000Z');
const DAY = 86400000;

function base(over) {
  const input = {
    now: NOW,
    currency: 'EGP',
    reportedBalanceMinor: 250000,
    balanceReportedAt: SNAP,
    transactions: [],
    paydayDate: '2026-10-26',
    paydayAmountMinor: 900000,
    paydayCurrency: 'EGP',
    commitments: [],
    savingsReservedMinor: 0,
    emergencyBufferMinor: 0
  };
  if (over) Object.assign(input, over);
  return input;
}

function includedSum(result) {
  return result.breakdown.filter(row => row.included).reduce((sum, row) => sum + row.amount_minor, 0);
}

function commit(id, kind, amount, date, extra) {
  const row = { id: id, title: id, kind: kind, currency: 'EGP', amountMinor: amount, due: date, paid: false, confirmed: true };
  if (extra) Object.assign(row, extra);
  return row;
}

check('complete runway keeps payday income out and returns per-day remainder', () => {
  const after = Date.parse('2026-10-11T09:00:00.000Z');
  const result = R.evaluate(base({
    transactions: [
      { id: 'refund', amountMinor: 10000, currency: 'EGP', direction: 'income', category: 'Refunds', occurredAt: after },
      { id: 'market', amountMinor: 30000, currency: 'EGP', direction: 'expense', category: 'Food & drinks', occurredAt: after },
      { id: 'usd', amountMinor: 99999, currency: 'USD', direction: 'expense', occurredAt: after },
      { id: 'at', amountMinor: 111, currency: 'EGP', direction: 'expense', occurredAt: SNAP },
      { id: 'old', amountMinor: 222, currency: 'EGP', direction: 'expense', occurredAt: SNAP - DAY },
      { id: 'move', amountMinor: 50000, currency: 'EGP', direction: 'transfer', category: 'Transfers', occurredAt: after },
      { id: 'pending', amountMinor: 7777, currency: 'EGP', direction: 'expense', source: 'notification', review: true, occurredAt: after }
    ],
    commitments: [
      commit('rent', 'rent', 40000, '2026-10-20', { title: 'Rent' }),
      commit('arrears', 'utility', 80000, '2026-10-05', { title: 'Electricity' }),
      commit('payday-bill', 'subscription', 15000, '2026-10-26', { title: 'Internet' }),
      commit('phone-1', 'installment', 20000, '2026-10-18', { title: 'Phone' }),
      commit('phone-2', 'installment', 20000, '2026-11-18', { title: 'Phone' }),
      commit('circle', "gam'eya", 5000, '2026-10-15', { title: "Gam'eya", flow: 'pay-in' }),
      commit('payout', "gam'eya", 80000, '2026-10-20', { flow: 'payout', received: false, potMinor: 900000 })
    ],
    savingsReservedMinor: 10000,
    emergencyBufferMinor: 25000
  }));
  assert.equal(result.status, 'ok');
  assert.equal(result.safe_to_spend_minor, 35000);
  assert.equal(result.days, 14);
  assert.equal(result.calendar_days, 14);
  assert.equal(result.per_day_minor, 2500);
  assert.equal(result.remainder_minor, 0);
  assert.equal(result.currency, 'EGP');
  assert.deepEqual(result.missing, []);
  assert.equal(includedSum(result), 35000);
  assert.equal(result.breakdown.find(row => row.id === 'planned_payday').included, false);
  assert.equal(result.breakdown.find(row => row.id === 'planned_payday').amount_minor, 900000);
  assert.notEqual(result.safe_to_spend_minor, 50000 + 900000);
  assert.deepEqual(result.bills_due.map(row => row.id), ['arrears', 'circle', 'phone-1', 'rent', 'payday-bill']);
  assert.ok(result.excluded.some(row => row.reason === 'other_currency' && row.amount_minor === 99999));
  assert.equal(result.bills_due.some(row => row.id === 'payday-bill'), true);
  assert.ok(result.excluded.some(row => row.reason === 'due_after_payday' && row.id === 'phone-2'));
  assert.ok(result.excluded.some(row => row.reason === 'transfer' && row.id === 'move'));
  assert.ok(result.excluded.some(row => row.reason === 'before_snapshot' && row.count === 1));
  assert.ok(result.excluded.some(row => row.reason === 'at_snapshot' && row.count === 1));
  assert.equal(result.payday.included, false);
  assert.equal(result.available_now_minor, 35000);
  assert.equal(result.unconfirmed_count, 1);
  assert.equal(result.unconfirmed_net_minor, -7777);
  assert.equal(result.unconfirmed_transactions[0].id, 'pending');
  assert.equal(result.breakdown.find(row => row.id === 'unconfirmed_notifications').included, false);
  assert.equal(result.breakdown.find(row => row.id === 'gam_eya_payouts').included, false);
  assert.equal(result.breakdown.find(row => row.id === 'gam_eya_payouts').amount_minor, 80000);
  assert.equal(JSON.stringify(result.breakdown.filter(row => row.included)).includes('900000'), false);
  assert.equal(result.excluded.find(row => row.id === 'payout').reason, 'unreceived_payout');
});

check('exact division leaves a zero remainder', () => {
  const result = R.evaluate(base({ reportedBalanceMinor: 14000 }));
  assert.equal(result.safe_to_spend_minor, 14000);
  assert.equal(result.per_day_minor, 1000);
  assert.equal(result.remainder_minor, 0);
});

check('negative runway is preserved', () => {
  const result = R.evaluate(base({
    reportedBalanceMinor: 10000,
    commitments: [commit('rent', 'rent', 40000, '2026-10-20')]
  }));
  assert.equal(result.status, 'shortfall');
  assert.equal(result.safe_to_spend_minor, -30000);
  assert.notEqual(result.safe_to_spend_minor, 0);
  assert.equal(result.per_day_minor, -2143);
  assert.equal(result.remainder_minor, 2);
  assert.ok(result.safe_to_spend_minor < 0);
});

check('a negative snapshot is data, not a missing balance', () => {
  const result = R.evaluate(base({ reportedBalanceMinor: -500 }));
  assert.equal(result.status, 'shortfall');
  assert.equal(result.safe_to_spend_minor, -500);
});

check('payday today is insufficient data', () => {
  const result = R.evaluate(base({
    paydayDate: '2026-10-12',
    reportedBalanceMinor: 5000,
    commitments: [commit('today', 'subscription', 1000, '2026-10-12')]
  }));
  assert.equal(result.status, 'insufficient data');
  assert.equal(result.safe_to_spend_minor, null);
  assert.equal(result.per_day_minor, null);
  assert.equal(result.days, null);
  assert.equal(result.payday.is_today, true);
  assert.ok(result.missing.indexOf('payday_today') >= 0);
});

check('a payday that already passed is insufficient data', () => {
  const result = R.evaluate(base({ paydayDate: '2026-10-01' }));
  assert.equal(result.status, 'insufficient data');
  assert.equal(result.safe_to_spend_minor, null);
  assert.equal(result.per_day_minor, null);
  assert.ok(result.missing.indexOf('payday_passed') >= 0);
});

check('a snapshot exactly 48 hours old is still fresh', () => {
  const result = R.evaluate(base({ balanceReportedAt: NOW - R.STALE_AFTER_MS }));
  assert.equal(result.status, 'ok');
  assert.equal(result.safe_to_spend_minor, 250000);
  assert.deepEqual(result.missing, []);
});

check('a snapshot older than 48 hours is stale', () => {
  const result = R.evaluate(base({ balanceReportedAt: NOW - R.STALE_AFTER_MS - 1 }));
  assert.equal(result.status, 'insufficient data');
  assert.equal(result.safe_to_spend_minor, null);
  assert.ok(result.missing.indexOf('stale_snapshot') >= 0);
});

check('staleAfterDays overrides the default window', () => {
  const fresh = R.evaluate(base({ balanceReportedAt: NOW - 2 * DAY, staleAfterDays: 3 }));
  assert.equal(fresh.status, 'ok');
  const stale = R.evaluate(base({ balanceReportedAt: NOW - 3 * DAY - 1, staleAfterDays: 3 }));
  assert.equal(stale.status, 'insufficient data');
  assert.ok(stale.missing.indexOf('stale_snapshot') >= 0);
});

check('a zero stale window is rejected', () => {
  const result = R.evaluate(base({ staleAfterDays: 0 }));
  assert.equal(result.status, 'insufficient data');
  assert.equal(result.safe_to_spend_minor, null);
  assert.ok(result.missing.indexOf('stale_after_days') >= 0);
});

check('a snapshot in the future is not a balance', () => {
  const result = R.evaluate(base({ balanceReportedAt: NOW + 1 }));
  assert.equal(result.status, 'insufficient data');
  assert.equal(result.safe_to_spend_minor, null);
  assert.ok(result.missing.indexOf('future_snapshot') >= 0);
});

const required = [
  ['now', 'now'],
  ['currency', 'currency'],
  ['reportedBalanceMinor', 'reported_balance'],
  ['balanceReportedAt', 'balance_reported_at'],
  ['transactions', 'transactions'],
  ['paydayDate', 'payday_date'],
  ['paydayAmountMinor', 'payday_amount'],
  ['paydayCurrency', 'payday_currency'],
  ['commitments', 'commitments'],
  ['savingsReservedMinor', 'savings_reserved'],
  ['emergencyBufferMinor', 'emergency_buffer']
];
for (const [key, code] of required) {
  check('missing ' + key + ' is insufficient data', () => {
    const input = base();
    delete input[key];
    const result = R.evaluate(input);
    assert.equal(result.status, 'insufficient data');
    assert.equal(result.safe_to_spend_minor, null);
    assert.equal(result.per_day_minor, null);
    assert.equal(result.days, null);
    assert.ok(result.missing.indexOf(code) >= 0, result.missing.join(','));
    assert.equal(result.breakdown.length, 0);
  });
}

check('explicit empty obligations and zero reserves are enough', () => {
  const result = R.evaluate(base());
  assert.equal(result.status, 'ok');
  assert.equal(result.safe_to_spend_minor, 250000);
  assert.equal(result.bills_due.length, 0);
});

check('null is not the same as an empty bill list', () => {
  const result = R.evaluate(base({ commitments: null }));
  assert.equal(result.status, 'insufficient data');
  assert.ok(result.missing.indexOf('commitments') >= 0);
  assert.equal(result.safe_to_spend_minor, null);
});

check('several missing inputs are listed together', () => {
  const input = base();
  delete input.paydayDate;
  delete input.commitments;
  delete input.emergencyBufferMinor;
  const result = R.evaluate(input);
  assert.equal(result.status, 'insufficient data');
  assert.deepEqual(result.missing.filter(code => ['commitments', 'emergency_buffer', 'payday_date'].indexOf(code) >= 0).sort(), ['commitments', 'emergency_buffer', 'payday_date']);
});

check('a float amount is never rounded into a runway', () => {
  const result = R.evaluate(base({ reportedBalanceMinor: 250000.4 }));
  assert.equal(result.status, 'insufficient data');
  assert.equal(result.safe_to_spend_minor, null);
  assert.ok(result.missing.indexOf('reported_balance') >= 0);
});

check('a numeric string is not coerced', () => {
  const result = R.evaluate(base({ savingsReservedMinor: '0' }));
  assert.equal(result.status, 'insufficient data');
  assert.ok(result.missing.indexOf('savings_reserved') >= 0);
});

check('a foreign bill due before payday blocks the result', () => {
  const result = R.evaluate(base({
    commitments: [
      commit('egp', 'utility', 100, '2026-10-20'),
      commit('usd', 'utility', 100, '2026-10-19', { currency: 'USD' })
    ]
  }));
  assert.equal(result.status, 'insufficient data');
  assert.equal(result.safe_to_spend_minor, null);
  assert.ok(result.missing.indexOf('foreign_obligation') >= 0);
  assert.equal(result.excluded.find(row => row.id === 'usd').currency, 'USD');
});

check('a foreign transaction is excluded and the EGP runway still stands', () => {
  const result = R.evaluate(base({
    transactions: [
      { id: 'usd', amountMinor: 5000, currency: 'usd', direction: 'expense', occurredAt: SNAP + 1000 }
    ]
  }));
  assert.equal(result.status, 'ok');
  assert.equal(result.safe_to_spend_minor, 250000);
  assert.equal(result.excluded.find(row => row.id === 'usd').reason, 'other_currency');
});

check('payday currency is never converted', () => {
  const result = R.evaluate(base({ paydayCurrency: 'USD' }));
  assert.equal(result.status, 'insufficient data');
  assert.equal(result.safe_to_spend_minor, null);
  assert.ok(result.missing.indexOf('payday_currency_mismatch') >= 0);
});

check('lowercase ledger currency is normalized and not mixed', () => {
  const result = R.evaluate(base({ currency: 'egp', paydayCurrency: 'Egp' }));
  assert.equal(result.status, 'ok');
  assert.equal(result.currency, 'EGP');
});

check('a transfer flag excludes an expense-shaped row', () => {
  const result = R.evaluate(base({
    transactions: [
      { id: 'move', amountMinor: 4000, currency: 'EGP', direction: 'expense', transfer: true, occurredAt: SNAP + 50 }
    ]
  }));
  assert.equal(result.safe_to_spend_minor, 250000);
  assert.equal(result.excluded.find(row => row.id === 'move').reason, 'transfer');
});

check('category Transfers is not spending', () => {
  const result = R.evaluate(base({
    transactions: [
      { id: 'move', amountMinor: 4000, currency: 'EGP', direction: 'expense', category: 'transfers', occurredAt: SNAP + 50 }
    ]
  }));
  assert.equal(result.safe_to_spend_minor, 250000);
});

check('a refund marked income increases the runway', () => {
  const result = R.evaluate(base({
    transactions: [
      { id: 'back', amountMinor: 1500, currency: 'EGP', direction: 'income', category: 'Refunds', occurredAt: SNAP + 10 }
    ]
  }));
  assert.equal(result.safe_to_spend_minor, 251500);
});

check('a refund stored as an expense is spending', () => {
  const result = R.evaluate(base({
    transactions: [
      { id: 'back', amountMinor: 1500, currency: 'EGP', direction: 'expense', category: 'Refunds', occurredAt: SNAP + 10 }
    ]
  }));
  assert.equal(result.safe_to_spend_minor, 248500);
  assert.equal(result.breakdown.find(row => row.id === 'transactions').amount_minor, -1500);
});

check('an installment schedule subtracts only the part before payday and ignores principal', () => {
  const result = R.evaluate(base({
    commitments: [{
      id: 'phone',
      title: 'Phone',
      kind: 'installment',
      currency: 'EGP',
      confirmed: true,
      paid: false,
      principalMinor: 100000,
      provider: 'Sympl',
      schedule: [
        { id: '1', amountMinor: 1000, due: '2026-10-13', paid: false },
        { id: '2', amountMinor: 1000, due: '2026-10-26', paid: false },
        { id: '3', amountMinor: 1000, due: '2026-11-13', paid: false },
        { id: '4', amountMinor: 1000, due: '2026-11-27', paid: false },
        { id: '5', amountMinor: 1000, due: '2026-12-11', paid: false }
      ]
    }]
  }));
  assert.equal(result.safe_to_spend_minor, 248000);
  assert.deepEqual(result.bills_due.map(row => row.id), ['1', '2']);
  assert.equal(JSON.stringify(result.breakdown.filter(row => row.included)).includes('100000'), false);
});

check("gam'eya pay-in on payday is reserved", () => {
  const result = R.evaluate(base({
    commitments: [
      commit('soon', "gam'eya", 7000, '2026-10-13', { flow: 'pay-in' }),
      commit('day', "gam'eya", 7000, '2026-10-26', { flow: 'pay-in' })
    ]
  }));
  assert.equal(result.safe_to_spend_minor, 236000);
  assert.deepEqual(result.bills_due.map(row => row.id), ['soon', 'day']);
});

check("an unreceived gam'eya payout and its pot stay out of available now", () => {
  const result = R.evaluate(base({
    commitments: [
      commit('pot', "gam'eya", 50000, '2026-10-18', { flow: 'payout', received: false, potMinor: 600000 }),
      commit('in', "gam'eya", 4000, '2026-10-18', { flow: 'pay-in', feeMinor: 200 })
    ]
  }));
  assert.equal(result.status, 'ok');
  assert.equal(result.available_now_minor, 245800);
  assert.equal(result.safe_to_spend_minor, 245800);
  assert.equal(result.excluded.find(row => row.id === 'pot').reason, 'unreceived_payout');
  assert.equal(result.excluded.find(row => row.id === 'pot').pot_minor, 600000);
  const included = result.breakdown.filter(row => row.included);
  assert.equal(included.some(row => row.amount_minor === 50000 || row.amount_minor === 600000 || row.amount_minor === -50000 || row.amount_minor === -600000), false);
});

check('a received gam\'eya payout is still not added as income', () => {
  const result = R.evaluate(base({
    commitments: [commit('pot', "gam'eya", 50000, '2026-10-18', { flow: 'payout', received: true, potMinor: 600000 })]
  }));
  assert.equal(result.safe_to_spend_minor, 250000);
  assert.equal(result.excluded.find(row => row.id === 'pot').reason, 'payout_not_added');
});

check('unconfirmed notification transactions are shown separately', () => {
  const result = R.evaluate(base({
    transactions: [
      { id: 'alert', amountMinor: 4500, currency: 'EGP', direction: 'expense', source: 'notification', review: true, occurredAt: SNAP + 20 },
      { id: 'kept', amountMinor: 500, currency: 'EGP', direction: 'expense', source: 'notification', review: false, occurredAt: SNAP + 30 },
      { id: 'manual', amountMinor: 100, currency: 'EGP', direction: 'income', source: 'manual', occurredAt: SNAP + 40 }
    ]
  }));
  assert.equal(result.status, 'ok');
  assert.equal(result.safe_to_spend_minor, 249600);
  assert.equal(result.available_now_minor, 249600);
  assert.equal(result.unconfirmed_net_minor, -4500);
  assert.equal(result.unconfirmed_transactions[0].reason, 'unconfirmed');
  assert.equal(result.breakdown.find(row => row.id === 'transactions').amount_minor, -400);
});

check('a rejected or duplicate-candidate notification is not authoritative', () => {
  const rejected = R.evaluate(base({
    transactions: [{ id: 'nope', amountMinor: 8000, currency: 'EGP', direction: 'expense', source: 'notification', status: 'rejected', occurredAt: SNAP + 5 }]
  }));
  assert.equal(rejected.safe_to_spend_minor, 250000);
  assert.equal(rejected.unconfirmed_transactions[0].reason, 'rejected');
  const dup = R.evaluate(base({
    transactions: [{ id: 'maybe', amountMinor: 8000, currency: 'EGP', direction: 'expense', source: 'notification', status: 'duplicate-candidate', occurredAt: SNAP + 5 }]
  }));
  assert.equal(dup.safe_to_spend_minor, 250000);
  assert.equal(dup.unconfirmed_net_minor, 0);
  assert.equal(dup.unconfirmed_transactions[0].reason, 'duplicate_candidate');
});

check('an unconfirmed commitment due before payday blocks a confident number', () => {
  const result = R.evaluate(base({
    commitments: [commit('rent', 'rent', 1000, '2026-10-20', { confirmed: false })]
  }));
  assert.equal(result.status, 'insufficient data');
  assert.equal(result.safe_to_spend_minor, null);
  assert.equal(result.available_now_minor, null);
  assert.ok(result.missing.indexOf('unconfirmed_commitment') >= 0);
  assert.equal(result.unconfirmed_commitments[0].id, 'rent');
});

check('an estimated obligation is not treated as a fixed due', () => {
  const result = R.evaluate(base({
    commitments: [commit('help', 'family', 3000, '2026-10-19', { amountEstimated: true })]
  }));
  assert.equal(result.status, 'insufficient data');
  assert.equal(result.available_now_minor, null);
  assert.ok(result.missing.indexOf('estimated_obligation') >= 0);
});

check('family, utility and subscription dues are subtracted once', () => {
  const result = R.evaluate(base({
    commitments: [
      commit('home', 'family', 1000, '2026-10-14'),
      commit('power', 'utility', 2000, '2026-10-15'),
      commit('music', 'subscription', 300, '2026-10-16')
    ]
  }));
  assert.equal(result.safe_to_spend_minor, 246700);
});

check('a card payment already in the ledger is not subtracted again', () => {
  const result = R.evaluate(base({
    transactions: [{ id: 'pay-1', amountMinor: 2500, currency: 'EGP', direction: 'expense', source: 'manual', occurredAt: SNAP + 8 }],
    commitments: [commit('card', 'installment', 2500, '2026-10-18', { linkedPaymentIds: ['pay-1'] })]
  }));
  assert.equal(result.safe_to_spend_minor, 247500);
  assert.equal(result.excluded.find(row => row.id === 'card').reason, 'already_in_ledger');
});

check('an unknown commitment kind is not guessed', () => {
  const result = R.evaluate(base({
    commitments: [commit('x', 'school', 100, '2026-10-18')]
  }));
  assert.equal(result.status, 'insufficient data');
  assert.ok(result.missing.indexOf('invalid_commitment') >= 0);
  assert.equal(result.safe_to_spend_minor, null);
});

check('snake_case aliases and a paid commitment are honored', () => {
  const result = R.evaluate({
    now: NOW,
    currency: 'EGP',
    self_reported_balance_minor: 80000,
    self_reported_at: SNAP,
    transactions: [{ amount_minor: 500, currency: 'EGP', direction: 'expense', occurred_at: SNAP + 5 }],
    payday_date: '2026-10-26',
    payday_amount_minor: 1,
    payday_currency: 'EGP',
    commitments: [
      { id: 'paid', title: 'Power', kind: 'utility', amount_minor: 9000, currency: 'EGP', due_at: Date.parse('2026-10-18T12:00:00.000Z'), status: 'paid', paid_at: SNAP - 1000, confirmed: true },
      { id: 'circle', title: 'Circle', kind: 'gameya', amount_minor: 1000, currency: 'EGP', due: '2026-10-16', paid: false, confirmed: true, flow: 'pay-in' }
    ],
    savings_reserved_minor: 0,
    emergency_reserve_minor: 0
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.safe_to_spend_minor, 78500);
  assert.equal(result.excluded.find(row => row.id === 'paid').reason, 'paid');
  assert.equal(result.bills_due[0].id, 'circle');
  assert.equal(result.bills_due[0].kind, "gam'eya");
});

check('duplicate obligation ids are insufficient data', () => {
  const result = R.evaluate(base({
    commitments: [
      commit('same', 'rent', 10, '2026-10-13'),
      commit('same', 'utility', 10, '2026-10-14')
    ]
  }));
  assert.equal(result.status, 'insufficient data');
  assert.equal(result.safe_to_spend_minor, null);
  assert.ok(result.missing.indexOf('duplicate_obligation') >= 0);
});

check('duplicate transaction ids are insufficient data', () => {
  const result = R.evaluate(base({
    transactions: [
      { id: 'dup', amountMinor: 10, currency: 'EGP', direction: 'expense', occurredAt: SNAP + 1 },
      { id: 'dup', amountMinor: 10, currency: 'EGP', direction: 'expense', occurredAt: SNAP + 2 }
    ]
  }));
  assert.equal(result.status, 'insufficient data');
  assert.ok(result.missing.indexOf('duplicate_transaction') >= 0);
  assert.equal(result.safe_to_spend_minor, null);
});

check('a malformed in-window transaction blocks a confident number', () => {
  const result = R.evaluate(base({
    transactions: [{ id: 'bad', amountMinor: 10.5, currency: 'EGP', direction: 'expense', occurredAt: SNAP + 1 }]
  }));
  assert.equal(result.status, 'insufficient data');
  assert.ok(result.missing.indexOf('invalid_transaction') >= 0);
});

check('an invalid payday date is not rolled into the next month', () => {
  assert.equal(R.evaluate(base({ paydayDate: '2026-02-31' })).status, 'insufficient data');
  assert.equal(R.evaluate(base({ paydayDate: '2026-02-29' })).status, 'insufficient data');
  assert.ok(R.evaluate(base({ paydayDate: '2026-02-31' })).missing.indexOf('payday_date') >= 0);
});

check('29 February 2024 is a real payday', () => {
  const now = Date.parse('2024-02-28T10:00:00.000Z');
  const result = R.evaluate(base({
    now: now,
    balanceReportedAt: now - DAY,
    paydayDate: '2024-02-29'
  }));
  assert.equal(result.status, 'ok');
  assert.equal(result.calendar_days, 1);
  assert.equal(result.days, 1);
});

check('month-end February 2026 reaches 1 March in one civil day', () => {
  const now = Date.parse('2026-02-28T21:59:00.000Z');
  const result = R.evaluate(base({
    now: now,
    balanceReportedAt: now - DAY,
    paydayDate: '2026-03-01'
  }));
  assert.equal(R.cairoParts(now).iso, '2026-02-28');
  assert.equal(result.calendar_days, 1);
  assert.equal(result.per_day_minor, result.safe_to_spend_minor);
});

check('the same UTC instant is already 1 March in Cairo', () => {
  const now = Date.parse('2026-02-28T22:00:00.000Z');
  const result = R.evaluate(base({
    now: now,
    balanceReportedAt: now - 2 * DAY,
    paydayDate: '2026-03-01'
  }));
  assert.equal(R.cairoParts(now).iso, '2026-03-01');
  assert.equal(result.status, 'insufficient data');
  assert.equal(result.safe_to_spend_minor, null);
  assert.equal(result.payday.is_today, true);
  assert.ok(result.missing.indexOf('payday_today') >= 0);
});

check('31 January to 1 February is one day', () => {
  const now = Date.parse('2026-01-31T10:00:00.000Z');
  const result = R.evaluate(base({ now: now, balanceReportedAt: now - DAY, paydayDate: '2026-02-01' }));
  assert.equal(result.calendar_days, 1);
});

check('31 December to 1 January crosses the year', () => {
  const now = Date.parse('2026-12-31T10:00:00.000Z');
  const result = R.evaluate(base({ now: now, balanceReportedAt: now - DAY, paydayDate: '2027-01-01' }));
  assert.equal(result.calendar_days, 1);
  assert.equal(result.status, 'ok');
});

check('a non-leap February is one day shorter than a leap February', () => {
  const leap = R.evaluate(base({
    now: Date.parse('2024-02-28T10:00:00.000Z'),
    balanceReportedAt: Date.parse('2024-02-27T10:00:00.000Z'),
    paydayDate: '2024-03-01'
  }));
  const common = R.evaluate(base({
    now: Date.parse('2025-02-28T10:00:00.000Z'),
    balanceReportedAt: Date.parse('2025-02-27T10:00:00.000Z'),
    paydayDate: '2025-03-01'
  }));
  assert.equal(leap.calendar_days, 2);
  assert.equal(common.calendar_days, 1);
});

check('Cairo spring-forward makes 24 April start at 01:00', () => {
  const before = Date.parse('2026-04-23T21:59:00.000Z');
  const after = Date.parse('2026-04-23T22:00:00.000Z');
  assert.equal(R.cairoOffsetMinutes(before), 120);
  assert.equal(R.cairoParts(before).iso, '2026-04-23');
  assert.equal(R.cairoOffsetMinutes(after), 180);
  assert.equal(R.cairoParts(after).iso, '2026-04-24');
  assert.equal(R.cairoParts(after).hour, 1);
  const dayBefore = R.evaluate(base({ now: before, balanceReportedAt: before - DAY, paydayDate: '2026-04-24' }));
  const onDay = R.evaluate(base({ now: after, balanceReportedAt: after - DAY, paydayDate: '2026-04-24' }));
  assert.equal(dayBefore.calendar_days, 1);
  assert.equal(onDay.status, 'insufficient data');
  assert.equal(onDay.safe_to_spend_minor, null);
  assert.equal(onDay.payday.is_today, true);
  assert.ok(onDay.missing.indexOf('payday_today') >= 0);
});

check('Cairo fall-back repeats the late hour on the last Thursday of October', () => {
  const before = Date.parse('2026-10-29T20:59:00.000Z');
  const after = Date.parse('2026-10-29T21:00:00.000Z');
  assert.equal(R.cairoOffsetMinutes(before), 180);
  assert.equal(R.cairoParts(before).iso, '2026-10-29');
  assert.equal(R.cairoParts(before).hour, 23);
  assert.equal(R.cairoOffsetMinutes(after), 120);
  assert.equal(R.cairoParts(after).iso, '2026-10-29');
  assert.equal(R.cairoParts(after).hour, 23);
  const result = R.evaluate(base({ now: after, balanceReportedAt: after - DAY, paydayDate: '2026-10-30' }));
  assert.equal(result.calendar_days, 1);
});

check('2023 and 2024 DST boundaries match the encoded rule', () => {
  assert.equal(R.cairoParts(Date.parse('2023-04-27T21:59:00.000Z')).iso, '2023-04-27');
  assert.equal(R.cairoParts(Date.parse('2023-04-27T22:00:00.000Z')).iso, '2023-04-28');
  assert.equal(R.cairoOffsetMinutes(Date.parse('2023-04-27T22:00:00.000Z')), 180);
  assert.equal(R.cairoParts(Date.parse('2023-10-26T21:00:00.000Z')).offset, 120);
  assert.equal(R.cairoParts(Date.parse('2024-04-25T22:00:00.000Z')).iso, '2024-04-26');
  assert.equal(R.cairoOffsetMinutes(Date.parse('2024-10-31T20:59:00.000Z')), 180);
  assert.equal(R.cairoOffsetMinutes(Date.parse('2024-10-31T21:00:00.000Z')), 120);
});

check('Cairo parts agree with Intl across the modeled years', () => {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'shortOffset'
  });
  const samples = [];
  for (const year of [2011, 2014, 2022, 2023, 2024, 2025, 2026, 2027]) {
    for (const day of ['01-15', '04-20', '04-30', '07-01', '10-20', '10-31', '12-31']) {
      samples.push(Date.parse(year + '-' + day + 'T00:30:00.000Z'));
      samples.push(Date.parse(year + '-' + day + 'T22:30:00.000Z'));
    }
  }
  samples.push(Date.parse('2026-04-23T21:59:00.000Z'), Date.parse('2026-04-23T22:00:00.000Z'));
  samples.push(Date.parse('2026-10-29T20:59:00.000Z'), Date.parse('2026-10-29T21:00:00.000Z'));
  for (const ms of samples) {
    const parts = R.cairoParts(ms);
    const bag = {};
    for (const part of fmt.formatToParts(new Date(ms))) bag[part.type] = part.value;
    const iso = bag.year + '-' + bag.month + '-' + bag.day;
    const offset = Number(bag.timeZoneName.replace('GMT', '')) * 60;
    assert.equal(parts.iso, iso, new Date(ms).toISOString());
    assert.equal(parts.hour, Number(bag.hour), iso);
    assert.equal(parts.offset, offset, iso);
  }
});

check('clocks before 2011 are not guessed', () => {
  const old = Date.parse('2010-07-15T12:00:00.000Z');
  assert.equal(R.cairoOffsetMinutes(old), null);
  const result = R.evaluate(base({ now: old, balanceReportedAt: old - DAY, paydayDate: '2010-07-20' }));
  assert.equal(result.status, 'insufficient data');
  assert.equal(result.safe_to_spend_minor, null);
  assert.ok(result.missing.indexOf('unsupported_clock') >= 0);
});

check('a 2011 summer noon stays on UTC+2', () => {
  const now = Date.parse('2011-07-15T10:00:00.000Z');
  assert.equal(R.cairoOffsetMinutes(now), 120);
  const result = R.evaluate(base({ now: now, balanceReportedAt: now - DAY, paydayDate: '2011-07-20' }));
  assert.equal(result.status, 'ok');
  assert.equal(result.calendar_days, 5);
});

check('income after the snapshot raises the runway and earlier income does not', () => {
  const result = R.evaluate(base({
    transactions: [
      { id: 'later', amountMinor: 3000, currency: 'EGP', direction: 'income', occurredAt: SNAP + 1 },
      { id: 'earlier', amountMinor: 9000, currency: 'EGP', direction: 'income', occurredAt: SNAP - 1 }
    ]
  }));
  assert.equal(result.safe_to_spend_minor, 253000);
});

check('overdue arrears are subtracted', () => {
  const result = R.evaluate(base({
    commitments: [commit('old', 'utility', 1234, '2026-09-30')]
  }));
  assert.equal(result.safe_to_spend_minor, 248766);
  assert.equal(result.bills_due[0].due, '2026-09-30');
});

check('epoch due dates use the Cairo civil date', () => {
  const due = Date.parse('2026-10-18T22:30:00.000Z');
  assert.equal(R.cairoParts(due).iso, '2026-10-19');
  const result = R.evaluate(base({
    commitments: [commit('night', 'rent', 100, '2026-10-19', { dueAt: due, due: undefined })]
  }));
  assert.equal(result.bills_due[0].due, '2026-10-19');
  assert.equal(result.safe_to_spend_minor, 249900);
});

check('disagreeing amount fields are invalid', () => {
  const result = R.evaluate(base({
    commitments: [commit('x', 'other', 10, '2026-10-13', { amount_minor: 11 })]
  }));
  assert.equal(result.status, 'insufficient data');
  assert.ok(result.missing.indexOf('invalid_commitment') >= 0);
});

check('a negative reservation is not a credit', () => {
  const result = R.evaluate(base({ emergencyBufferMinor: -1 }));
  assert.equal(result.status, 'insufficient data');
  assert.ok(result.missing.indexOf('emergency_buffer') >= 0);
});

check('null, arrays, and empty objects do not throw', () => {
  for (const value of [null, undefined, 4, [], {}]) {
    const result = R.evaluate(value);
    assert.equal(result.status, 'insufficient data');
    assert.equal(result.safe_to_spend_minor, null);
  }
});

check('the same input is deterministic and is not mutated', () => {
  const input = base({
    commitments: [commit('rent', 'rent', 10, '2026-10-20')],
    transactions: [{ id: 'a', amountMinor: 5, currency: 'EGP', direction: 'expense', occurredAt: SNAP + 3 }]
  });
  const before = JSON.stringify(input);
  const freeze = value => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
    Object.freeze(value);
    for (const key of Object.keys(value)) freeze(value[key]);
  };
  freeze(input);
  const first = R.evaluate(input);
  const second = R.evaluate(input);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(JSON.stringify(input), before);
  assert.equal(first.safe_to_spend_minor, 249985);
});

check('a confirmed transaction after now is not available money', () => {
  const futureExpense = R.evaluate(base({
    transactions: [{ id: 'later', amountMinor: 10000, currency: 'EGP', direction: 'expense', status: 'confirmed', occurredAt: NOW + 60 * 60 * 1000 }]
  }));
  assert.equal(futureExpense.status, 'insufficient data');
  assert.equal(futureExpense.safe_to_spend_minor, null);
  assert.equal(futureExpense.available_now_minor, null);
  assert.ok(futureExpense.missing.indexOf('future_transaction') >= 0);
  const futureIncome = R.evaluate(base({
    transactions: [{ id: 'salary-soon', amountMinor: 50000, currency: 'EGP', direction: 'income', status: 'confirmed', occurredAt: NOW + 2 * DAY }]
  }));
  assert.equal(futureIncome.safe_to_spend_minor, null);
  assert.equal(futureIncome.available_now_minor, null);
  assert.ok(futureIncome.missing.indexOf('future_transaction') >= 0);
});

check('a bill paid after the snapshot without a matching debit is not treated as gone', () => {
  const paidAt = SNAP + 30 * 60 * 1000;
  const flagged = R.evaluate(base({
    commitments: [commit('rent', 'rent', 20000, '2026-10-15', { status: 'paid', paid: true, paidAt: paidAt })]
  }));
  assert.equal(flagged.status, 'insufficient data');
  assert.equal(flagged.safe_to_spend_minor, null);
  assert.ok(flagged.missing.indexOf('unreconciled_paid_commitment') >= 0);
  assert.equal(flagged.excluded.find(row => row.id === 'rent').reason, 'unreconciled_paid_commitment');
  const settled = R.evaluate(base({
    commitments: [commit('rent', 'rent', 20000, '2026-10-15', { paid: true, status: 'paid', paidAt: SNAP - 1000 })]
  }));
  assert.equal(settled.status, 'ok');
  assert.equal(settled.safe_to_spend_minor, 250000);
  assert.equal(settled.excluded.find(row => row.id === 'rent').reason, 'paid');
  const linked = R.evaluate(base({
    transactions: [{ id: 'rentPaid', amountMinor: 20000, currency: 'EGP', direction: 'expense', status: 'confirmed', occurredAt: paidAt }],
    commitments: [commit('rent', 'rent', 20000, '2026-10-15', { paid: true, status: 'paid', paidAt: paidAt, linkedPaymentIds: ['rentPaid'] })]
  }));
  assert.equal(linked.status, 'ok');
  assert.equal(linked.safe_to_spend_minor, 230000);
  assert.equal(linked.excluded.find(row => row.id === 'rent').reason, 'already_in_ledger');
});

check('negative per-day uses floor', () => {
  const result = R.evaluate(base({
    reportedBalanceMinor: -100001,
    paydayDate: '2026-10-17'
  }));
  assert.equal(result.safe_to_spend_minor, -100001);
  assert.equal(result.days, 5);
  assert.equal(result.per_day_minor, -20001);
  assert.equal(result.per_day_minor, Math.floor(-100001 / 5));
});

check('an unconfirmed notification stays out of the number and is counted', () => {
  const result = R.evaluate(base({
    transactions: [{ id: 'pending', amountMinor: 25000, currency: 'EGP', direction: 'expense', status: 'suggested', occurredAt: SNAP + 1000 }]
  }));
  assert.equal(result.status, 'ok');
  assert.equal(result.safe_to_spend_minor, 250000);
  assert.equal(result.unconfirmed_count, 1);
  assert.equal(result.unconfirmed_net_minor, -25000);
  assert.equal(result.breakdown.find(row => row.id === 'unconfirmed_notifications').included, false);
});

check('another currency is excluded from this runway and noted', () => {
  const result = R.evaluate(base({
    transactions: [{ id: 'usd', amountMinor: 10000, currency: 'USD', direction: 'expense', status: 'confirmed', occurredAt: SNAP + 1000 }]
  }));
  assert.equal(result.status, 'ok');
  assert.equal(result.safe_to_spend_minor, 250000);
  assert.equal(result.excluded.find(row => row.id === 'usd').reason, 'other_currency');
  assert.equal(result.excluded.find(row => row.id === 'usd').currency, 'USD');
});

check('the bundled engine stays free of parse-breaking syntax and clocks', () => {
  const src = fs.readFileSync(path.join(__dirname, '../android/app/src/main/assets/payday-runway.js'), 'utf8');
  assert.equal(src.includes('?.'), false);
  assert.equal(src.includes('??'), false);
  assert.equal(src.includes('matchAll'), false);
  assert.equal(src.includes('fromEntries'), false);
  assert.equal(/Date\.now\(/.test(src), false);
  assert.equal(/new Date\(\)/.test(src), false);
  assert.equal(/\bfetch\(/.test(src), false);
  assert.equal(R.STALE_AFTER_MS, 48 * 60 * 60 * 1000);
  const context = vm.createContext({});
  vm.runInContext(src, context);
  assert.equal(typeof context.FolioPaydayRunway.evaluate, 'function');
  assert.equal(context.FolioPaydayRunway.evaluate(base()).safe_to_spend_minor, 250000);
});

assert.ok(passed >= 40, 'expected at least 40 runway checks, got ' + passed);
console.log('PASS payday runway (' + passed + ' checks)');
