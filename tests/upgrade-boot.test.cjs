'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const html = fs.readFileSync('android/app/src/main/assets/index.html', 'utf8');
const v2 = fs.readFileSync('android/app/src/main/assets/folio-v2.js', 'utf8');
const first = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(first, 'bundled page has a boot script');

function contextFor(localStorage) {
  const elements = new Map();
  const body = { classList: { add() {}, remove() {} }, appendChild() {} };
  const doc = {
    body,
    createElement() { return { innerHTML: '', remove() {} }; },
    getElementById(id) {
      if (id === 'v2-overlay') return null;
      if (!elements.has(id)) elements.set(id, { innerHTML: '', value: '', focus() {} });
      return elements.get(id);
    }
  };
  const sandbox = {
    window: { scrollTo() {} },
    document: doc,
    localStorage,
    console,
    setTimeout: () => 1,
    setInterval: () => 1,
    clearTimeout() {},
    confirm: () => true
  };
  sandbox.window = sandbox;
  sandbox.scrollTo = () => {};
  return { context: vm.createContext(sandbox), doc };
}

function bootFirst(localStorage) {
  const built = contextFor(localStorage);
  new vm.Script(first[1]).runInContext(built.context);
  return built;
}

function bootHome(seed) {
  const data = new Map([['folio_finance_v1', JSON.stringify(seed)]]);
  const localStorage = {
    getItem: key => data.get(key) || null,
    setItem: (key, value) => data.set(key, String(value))
  };
  const built = bootFirst(localStorage);
  new vm.Script(v2).runInContext(built.context);
  return { data, doc: built.doc };
}

const ledger = {
  demo: false,
  currency: 'EGP',
  v2Onboarded: false,
  reportedBalanceMinor: 842050,
  balanceReportedAt: Date.parse('2026-10-01T09:30:00.000Z'),
  monthlyIncomeMinor: 1500000,
  monthlyBudgetMinor: 900000,
  budgets: { EGP: { 'Food & drinks': 3500 } },
  transactions: [{
    id: 'market',
    merchant: 'Carrefour',
    amountMinor: 12550,
    currency: 'EGP',
    direction: 'expense',
    category: 'Food & drinks',
    occurredAt: Date.parse('2026-10-11T20:15:00.000Z'),
    source: 'manual'
  }]
};
const home = bootHome(ledger);
const painted = home.doc.getElementById('root').innerHTML;
assert.equal(painted.includes('Meet Folio'), false, 'a stored Carrefour ledger must not open onboarding');
assert.ok(painted.includes('Carrefour'), 'Carrefour stays on screen');
assert.ok(painted.includes('Your money, in focus.'), 'the home shell is shown');
const saved = JSON.parse(home.data.get('folio_finance_v1'));
assert.equal(saved.v2Onboarded, true);
assert.equal(saved.transactions[0].merchant, 'Carrefour');
assert.equal(saved.transactions[0].amountMinor, 12550);
assert.equal(saved.reportedBalanceMinor, 842050);
assert.equal(saved.monthlyIncomeMinor, 1500000);
assert.equal(saved.monthlyBudgetMinor, 900000);
assert.equal(saved.budgets.EGP['Food & drinks'], 350000, 'a schema 0 category budget converts once');

const corruptRaw = '{not-json';
const corruptData = new Map([['folio_finance_v1', corruptRaw]]);
bootFirst({
  getItem(key) { return corruptData.get(key) || null; },
  setItem(key, value) { corruptData.set(key, String(value)); }
});
assert.equal(corruptData.get('folio_finance_v1'), corruptRaw, 'boot does not overwrite unreadable JSON');
const snapshot = corruptData.get('folio_finance_premigration_snapshot');
assert.ok(snapshot && snapshot.includes(corruptRaw), 'the raw text is kept in the premigration snapshot');

const original = JSON.stringify({
  v2Onboarded: true,
  currency: 'EGP',
  transactions: [{ merchant: 'Carrefour', amountMinor: 12550, currency: 'EGP', direction: 'expense', occurredAt: Date.now(), source: 'manual' }]
});
const hidden = new Map([['folio_finance_v1', original]]);
bootFirst({
  getItem() { throw new Error('storage not ready'); },
  setItem(key, value) { hidden.set(key, String(value)); }
});
assert.equal(hidden.get('folio_finance_v1'), original, 'a failed read does not clobber the stored workspace');

console.log('PASS upgrade boot keeps a stored ledger off onboarding');
