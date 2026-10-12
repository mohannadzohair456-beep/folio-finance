'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const html = fs.readFileSync('android/app/src/main/assets/index.html', 'utf8');
const scripts = [];
const scriptRe = /<script>([\s\S]*?)<\/script>/g;
let scriptMatch;
while ((scriptMatch = scriptRe.exec(html))) scripts.push(scriptMatch[1]);
assert.equal(scripts.length, 3, 'boot keeps three executable scripts: ledger, folio-v2, deferred engines');
assert.ok(scripts[0].includes('function paintLedgerShell()'), 'the ledger script can paint a shell');
assert.ok(scripts[1].includes('folioAfterPaint(function(){ render(); })'), 'Folio v2 hydrates the home after first paint');
assert.ok(scripts[2].includes('function folioRunDeferredEngines()'), 'engines start from the trailing script');
assert.ok(html.includes('<script type="text/plain" id="folio-deferred-payday">'), 'payday stays out of the parser-blocking scripts');
assert.ok(html.includes('<script type="text/plain" id="folio-deferred-assistant">'), 'Ask Folio stays out of the parser-blocking scripts');
assert.ok(html.indexOf('id="folio-deferred-assistant"') < html.indexOf('folioAfterPaint(function(){ render(); })'), 'assistant source is not compiled before the first Folio v2 render');
assert.ok(html.includes('if(native()){setTimeout(refreshNative,450);setInterval(refreshNative,10000);}'), 'notification refresh stays scheduled');

function deferredNode(id) {
  const marker = '<script type="text/plain" id="' + id + '">';
  const start = html.indexOf(marker);
  assert.ok(start >= 0, id);
  const from = start + marker.length;
  const end = html.indexOf('</script>', from);
  return {
    textContent: html.slice(from, end),
    attrs: {},
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; },
    setAttribute(name, value) { this.attrs[name] = String(value); }
  };
}

function boot(seed, withFrame) {
  const data = new Map(seed ? [['folio_finance_v1', JSON.stringify(seed)]] : []);
  const nodes = new Map();
  nodes.set('folio-deferred-payday', deferredNode('folio-deferred-payday'));
  nodes.set('folio-deferred-assistant', deferredNode('folio-deferred-assistant'));
  const queue = [];
  const body = {
    classList: { add() {}, remove() {} },
    appendChild(node) {
      if (node && node.textContent) vm.runInContext(node.textContent, sandbox);
    }
  };
  const doc = {
    body,
    getElementById(id) {
      if (id === 'v2-overlay') return null;
      if (nodes.has(id)) return nodes.get(id);
      if (!nodes.has(id)) nodes.set(id, { innerHTML: '', value: '', focus() {}, remove() {} });
      return nodes.get(id);
    },
    createElement() {
      const el = { textContent: '' };
      Object.defineProperty(el, 'text', {
        get() { return this.textContent; },
        set(value) { this.textContent = String(value); }
      });
      return el;
    }
  };
  const localStorage = {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value))
  };
  const sandbox = {
    window: {},
    document: doc,
    localStorage,
    console,
    confirm: () => true,
    setTimeout: () => 0,
    clearTimeout() {},
    setInterval: () => 0,
    Date,
    Intl,
    JSON,
    Math,
    Number,
    Object,
    Array,
    String,
    RegExp
  };
  if (withFrame) sandbox.requestAnimationFrame = fn => queue.push(fn);
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(scripts[0], sandbox);
  return { sandbox, data, doc, queue, nodes };
}

function flush(queue) {
  const batch = queue.splice(0, queue.length);
  batch.forEach(fn => fn());
}

const returned = boot({
  schemaVersion: 1,
  currency: 'EGP',
  v2Onboarded: true,
  reportedBalanceMinor: 500000,
  balanceReportedAt: Date.now(),
  transactions: [
    { id: 'market', source: 'manual', currency: 'EGP', direction: 'expense', amountMinor: 12550, merchant: 'Carrefour', category: 'Food & drinks', occurredAt: Date.now() }
  ]
}, true);

const shellHtml = returned.doc.getElementById('root').innerHTML;
assert.ok(shellHtml.includes('Your money, in focus.'), 'the shell shows the home header before the ledger hydrates');
assert.ok(shellHtml.includes('Entered balance'), 'the shell shows the entered balance without walking every row');
assert.ok(shellHtml.includes('5,000'), 'the entered balance is formatted on the shell');
assert.ok(shellHtml.includes('Loading your ledger'), 'the shell says the list is still loading');
assert.ok(shellHtml.includes('aria-busy="true"'), 'the skeleton is marked busy');
assert.equal((shellHtml.match(/boot-skel-row/g) || []).length, 4, 'the shell paints four placeholder rows');
assert.equal(shellHtml.includes('Carrefour'), false, 'transaction rows wait until after first paint');
assert.equal(shellHtml.includes('Where your money goes'), false, 'the money-flow chart waits until after first paint');
assert.ok(shellHtml.includes('id="quick-entry-input"'), 'the shell can show the one-line entry box');
assert.ok(shellHtml.includes('Nothing is saved until you confirm'), 'the shell says nothing is saved yet');
assert.equal(scripts[0].includes('function parseQuickEntry'), false, 'the parser is not in the blocking ledger script');
assert.equal(scripts[1].includes('function parseQuickEntry'), false, 'the parser is not in the Folio v2 script');
assert.equal(scripts[2].includes('function parseQuickEntry'), false, 'the parser is not in the engine scheduler');
assert.ok(html.includes('id="folio-deferred-quick-entry"'), 'the parser waits in a non-blocking script');
assert.ok(html.indexOf('id="folio-deferred-quick-entry"') > html.indexOf('function paintLedgerShell()'), 'the parser source comes after the shell paint');
assert.equal(vm.runInContext('state.schemaVersion', returned.sandbox), 2, 'migration finishes before the shell is shown');
assert.equal(JSON.parse(returned.data.get('folio_finance_v1')).schemaVersion, 2, 'the migrated ledger is stored before first paint');
assert.equal(JSON.parse(returned.data.get('folio_finance_v1')).transactions[0].status, 'confirmed', 'schema 1 rows become confirmed before first paint');
assert.ok(returned.data.get('folio_finance_premigration_snapshot'), 'the premigration snapshot is still written during load');
assert.equal(returned.sandbox.FolioAssistant, undefined, 'Ask Folio is not initialized on the shell');
assert.equal(returned.sandbox.FolioPaydayRunway, undefined, 'payday runway is not initialized on the shell');

vm.runInContext(scripts[1], returned.sandbox);
assert.ok(returned.doc.getElementById('root').innerHTML.includes('Loading your ledger'), 'Folio v2 leaves the shell up for the first paint');
assert.equal(returned.doc.getElementById('root').innerHTML.includes('Where your money goes'), false);
vm.runInContext(scripts[2], returned.sandbox);
assert.equal(returned.sandbox.FolioAssistant, undefined, 'scheduling the engines does not parse them yet');

flush(returned.queue);
flush(returned.queue);
const homeHtml = returned.doc.getElementById('root').innerHTML;
assert.ok(homeHtml.includes('Where your money goes'), 'the home hydrates after the first paint');
assert.ok(homeHtml.includes('Carrefour'), 'the ledger rows appear in that same hydration');
assert.equal(homeHtml.includes('Loading your ledger'), false, 'the skeleton is replaced by the ledger');
assert.equal(returned.sandbox.FolioQuickEntry, undefined, 'the quick-entry parser is not compiled during first paint');
assert.ok(homeHtml.includes('id="quick-entry-input"'), 'the hydrated home keeps the one-line entry');
assert.equal(typeof returned.sandbox.FolioAssistant.planCommand, 'function', 'Ask Folio loads after first paint');
assert.equal(typeof returned.sandbox.FolioPaydayRunway.evaluate, 'function', 'payday runway loads after first paint');
const afford = returned.sandbox.FolioAssistant.planCommand('Can I afford 10 EGP?', { currency: 'EGP', transactions: [], now: Date.now() });
assert.equal(afford.intent, 'can_afford', 'a deferred Ask Folio engine still answers');

const fresh = boot(null, true);
vm.runInContext(scripts[1], fresh.sandbox);
assert.ok(fresh.doc.getElementById('root').innerHTML.includes('Meet Folio.'), 'a new install paints onboarding before Ask Folio is parsed');
assert.equal(fresh.sandbox.FolioAssistant, undefined);
vm.runInContext(scripts[2], fresh.sandbox);
flush(fresh.queue);
flush(fresh.queue);
assert.equal(typeof fresh.sandbox.FolioAssistant.planCommand, 'function', 'Ask Folio still loads for a new install');
assert.ok(fresh.doc.getElementById('root').innerHTML.includes('Meet Folio.'), 'onboarding stays on screen while the engines load');

const immediate = boot({
  schemaVersion: 2,
  currency: 'EGP',
  v2Onboarded: true,
  transactions: [
    { id: 'market', source: 'manual', currency: 'EGP', direction: 'expense', amountMinor: 12550, merchant: 'Carrefour', category: 'Food & drinks', occurredAt: Date.now(), status: 'confirmed' }
  ]
}, false);
assert.ok(immediate.doc.getElementById('root').innerHTML.includes('Carrefour'), 'without a frame callback the home still renders in the first turn');
assert.equal(JSON.parse(immediate.data.get('folio_finance_v1')).schemaVersion, 2);

console.log('PASS boot shell before ledger, Ask Folio, and payday');
