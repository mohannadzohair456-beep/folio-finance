'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const html = fs.readFileSync('android/app/src/main/assets/index.html', 'utf8');
const v2 = fs.readFileSync('android/app/src/main/assets/folio-v2.js', 'utf8');
const first = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(first, 'bundled page has a boot script');
function inlined(name) {
  const start = '/* <folio-inline:' + name + '> */';
  const end = '/* </folio-inline:' + name + '> */';
  const i = html.indexOf(start);
  const j = html.indexOf(end);
  assert.ok(i >= 0 && j > i, 'missing inline ' + name);
  return html.slice(i + start.length, j).trim();
}
assert.equal(inlined('folio-data.js'), fs.readFileSync('android/app/src/main/assets/folio-data.js', 'utf8').trim(), 'inlined folio-data.js matches the source file');

function contextFor(localStorage, extras) {
  const elements = new Map();
  const timers = [];
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
    document: doc,
    localStorage,
    console,
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    setInterval: () => 1,
    clearTimeout() {},
    confirm: () => true,
    _timers: timers
  };
  if (extras) Object.assign(sandbox, extras);
  sandbox.window = sandbox;
  sandbox.scrollTo = () => {};
  return { context: vm.createContext(sandbox), doc };
}

function bootFirst(localStorage, extras) {
  const built = contextFor(localStorage, extras);
  new vm.Script(first[1]).runInContext(built.context);
  return built;
}

function flushTimers(built) {
  const timers = built.context._timers;
  const pending = timers.splice(0, timers.length);
  pending.forEach(fn => fn());
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
const hiddenBoot = bootFirst({
  getItem() { throw new Error('storage not ready'); },
  setItem(key, value) { hidden.set(key, String(value)); }
});
assert.equal(hiddenBoot.context.persist(), false);
assert.equal(hidden.get('folio_finance_v1'), original, 'a later persist does not clobber an unreadable workspace');

function storageMap(initial) {
  const data = new Map(initial || []);
  return {
    data,
    localStorage: {
      getItem(key) { return data.has(key) ? data.get(key) : null; },
      setItem(key, value) { data.set(key, String(value)); }
    }
  };
}

function paint(store, extras) {
  const built = bootFirst(store.localStorage, extras);
  new vm.Script(v2).runInContext(built.context);
  return { built, painted: built.doc.getElementById('root').innerHTML, data: store.data };
}

const freshStore = storageMap();
const fresh = paint(freshStore);
assert.ok(fresh.painted.includes('Meet Folio'), 'a missing key still opens onboarding');
assert.equal(fresh.painted.includes('Your money, in focus.'), false, 'an empty install does not paint the home shell');
const freshSaved = JSON.parse(fresh.data.get('folio_finance_v1'));
assert.equal(freshSaved.v2Onboarded, false, 'boot does not mark an empty install onboarded');
assert.equal(freshSaved.transactions.length, 0);
assert.equal(freshSaved.reportedBalanceMinor, null);
assert.equal(freshSaved.monthlyIncomeMinor, 0);
assert.equal(freshSaved.monthlyBudgetMinor, 0);
const freshAgain = paint(storageMap([['folio_finance_v1', JSON.stringify(freshSaved)]]));
assert.ok(freshAgain.painted.includes('Meet Folio'), 'the persisted empty workspace still opens onboarding');
assert.equal(JSON.parse(freshAgain.data.get('folio_finance_v1')).v2Onboarded, false);

const oldEmpty = paint(storageMap([['folio_finance_v1', JSON.stringify({
  demo: false, currency: 'EGP', capture: false, budgets: {}, transactions: []
})]]));
assert.ok(oldEmpty.painted.includes('Meet Folio'), 'a v0.2.33 empty workspace still opens onboarding');
assert.equal(JSON.parse(oldEmpty.data.get('folio_finance_v1')).v2Onboarded, false);

const blankBucket = paint(storageMap([['folio_finance_v1', JSON.stringify({
  currency: 'EGP', v2Onboarded: false, transactions: [], budgets: { EGP: {} }, accounts: [{ name: 'Wallet' }]
})]]));
assert.ok(blankBucket.painted.includes('Meet Folio'), 'an empty budget bucket and an account without a balance are not a ledger');

const corruptStore = storageMap([['folio_finance_v1', '{not-json']]);
let acked = false;
const corruptBoot = bootFirst(corruptStore.localStorage, {
  FolioNative: {
    notificationAccessGranted() { return false; },
    getCaptureDiagnostics() { return '{"allowed":0,"parsed":0,"unrecognized":0,"lastAt":0,"lastResult":""}'; },
    getObservedSources() { return '[]'; },
    getPendingTransactions() { return '[{"id":"pending-1"}]'; },
    ackTransactions() { acked = true; },
    setDarkChrome() {}
  }
});
assert.equal(corruptBoot.context.persist(), false, 'persist refuses to replace unparsed JSON');
flushTimers(corruptBoot);
assert.equal(corruptStore.data.get('folio_finance_v1'), '{not-json', 'native refresh at boot does not overwrite unparsed JSON');
assert.equal(acked, false, 'a refused boot write does not ack pending imports');
const corruptSnapshot = corruptStore.data.get('folio_finance_premigration_snapshot');
assert.ok(corruptSnapshot && corruptSnapshot.includes('{not-json'), 'the premigration snapshot still keeps the raw text');

console.log('PASS upgrade boot keeps a stored ledger off onboarding');
