const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('android/app/src/main/assets/folio-data.js', 'utf8'), sandbox);
const FolioData = sandbox.FolioData;
assert.equal(FolioData.SCHEMA_VERSION, 1);
// Objects created inside the vm have a different prototype, so compare JSON.
const same = (actual, expected, message) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);

const legacy = {
  demo: false,
  currency: 'EGP',
  capture: true,
  sources: ['com.google.android.apps.messaging', 'com.example.bank'],
  v2Onboarded: true,
  monthlyBudgetMinor: 500000,
  monthlyIncomeMinor: 1500000,
  reportedBalanceMinor: 2000000,
  balanceReportedAt: 1700000000000,
  budgets: { EGP: { 'Food & drinks': 3500.5, Shopping: '4000' }, SAR: { Transport: 80 } },
  transactions: [
    { id: 'real', source: 'manual', currency: 'EGP', direction: 'expense', amountMinor: 15025, merchant: 'Carrefour', category: 'Food & drinks', occurredAt: 10 },
    { id: 'odd', merchant: 'No amount' },
    null,
    'oops'
  ]
};
const migrated = FolioData.migrate(legacy, null);
assert.equal(migrated.state.schemaVersion, 1);
assert.equal(migrated.state.budgets.EGP['Food & drinks'], 350050, 'major-unit budget becomes minor units');
assert.equal(migrated.state.budgets.EGP.Shopping, 400000);
assert.equal(migrated.state.budgets.SAR.Transport, 8000);
assert.equal(migrated.state.monthlyBudgetMinor, 500000, 'planning fields were already minor');
assert.equal(migrated.state.monthlyIncomeMinor, 1500000);
assert.equal(migrated.state.reportedBalanceMinor, 2000000);
assert.equal(migrated.state.v2Onboarded, true);
assert.equal(migrated.state.capture, true);
same(migrated.state.sources, legacy.sources);
assert.equal(migrated.state.transactions.length, 4, 'incomplete legacy rows are kept');
assert.equal(migrated.state.transactions[0].amountMinor, 15025);
assert.equal(migrated.state.transactions[1].merchant, 'No amount');
assert.equal(migrated.state.transactions[2].incomplete, true);
assert.equal(migrated.state.transactions[3].incomplete, true);
assert.equal(migrated.snapshot.state.budgets.EGP.Shopping, '4000', 'snapshot keeps the pre-migration value');
assert.equal(migrated.snapshot.folioSnapshot, 'premigration');

const again = FolioData.migrate(migrated.state, null);
assert.equal(again.snapshot, null, 'a second launch does not take another snapshot');
assert.equal(again.state.budgets.EGP['Food & drinks'], 350050, 'budgets are not converted twice');
assert.equal(again.state.transactions.length, 4);

const weird = FolioData.migrate({
  transactions: [{ amount: '12.50', currency: 'USD', direction: 'income', merchant: 'Refund' }],
  budgets: { EGP: { Rent: 'nope', Food: -5 } }
}, null);
assert.equal(weird.state.transactions[0].amountMinor, 1250);
assert.equal(weird.state.legacyUnparsedBudgets.length, 2);
assert.doesNotThrow(() => FolioData.summarize(weird.state.transactions, 'USD'));

const corrupt = FolioData.migrate(undefined, '{');
assert.equal(corrupt.state.transactions.length, 0);
assert.equal(corrupt.state.schemaVersion, 1);
assert.equal(corrupt.snapshot.raw, '{');
assert.doesNotThrow(() => FolioData.summarize(corrupt.state.transactions, 'EGP'));

const demo = FolioData.migrate({
  demo: true,
  currency: 'EGP',
  transactions: [{ source: 'demo', id: 'sample' }, { source: 'manual', id: 'real', currency: 'EGP', direction: 'expense', amountMinor: 12500, merchant: 'Book', category: 'Shopping', occurredAt: 1 }],
  budgets: { EGP: { Shopping: 4000 } }
}, null);
assert.equal(demo.state.demo, false);
assert.equal(demo.state.transactions.length, 1);
assert.equal(demo.state.transactions[0].id, 'real');
same(demo.state.budgets, {});
assert.ok(demo.snapshot);

const mixed = FolioData.summarize([
  { currency: 'EGP', direction: 'expense', amountMinor: 100 },
  { currency: 'SAR', direction: 'expense', amountMinor: 999 },
  { currency: 'EGP', direction: 'income', amountMinor: 50 },
  { currency: 'EGP', direction: 'mystery', amountMinor: 5 },
  { currency: '', direction: 'expense', amountMinor: 7 },
  { direction: 'expense' }
], 'EGP');
assert.equal(mixed.income, 50);
assert.equal(mixed.expense, 100);
assert.equal(mixed.net, -50);
assert.equal(mixed.currency, 'EGP');
assert.equal(mixed.byCurrency.SAR.expense, 999);
assert.equal(mixed.byCurrency[''].expense, 7);
assert.equal(mixed.byCurrency.EGP.expense, 100);

const workspace = {
  schemaVersion: 1,
  demo: false,
  currency: 'SAR',
  capture: true,
  sources: ['com.stc.pay'],
  budgets: { SAR: { Shopping: 250000 }, EGP: { Transport: 10000 } },
  transactions: [{ id: 'a', amountMinor: 4500, currency: 'SAR', direction: 'expense', merchant: 'Jarir', category: 'Shopping', occurredAt: 5, source: 'manual' }],
  monthlyBudgetMinor: 900000,
  monthlyIncomeMinor: 2000000,
  reportedBalanceMinor: 421000,
  balanceReportedAt: 42,
  v2Onboarded: true,
  legacyUnparsedBudgets: [{ currency: 'EGP', category: 'Rent', value: 'nope' }],
  legacyQueue: [{ id: 'queued-incomplete' }],
  customNote: 'keep me'
};
const backupText = JSON.stringify(FolioData.buildBackup(workspace));
const restored = FolioData.restoreBackup(backupText);
for (const key of ['currency', 'capture', 'monthlyBudgetMinor', 'monthlyIncomeMinor', 'reportedBalanceMinor', 'balanceReportedAt', 'v2Onboarded', 'customNote']) {
  same(restored[key], workspace[key], key);
}
same(restored.sources, workspace.sources);
same(restored.budgets, workspace.budgets);
same(restored.transactions, workspace.transactions);
same(restored.legacyUnparsedBudgets, workspace.legacyUnparsedBudgets);
same(restored.legacyQueue, workspace.legacyQueue);
assert.equal(restored.folioBackup, undefined, 'envelope is not stored as user data');

const legacyFile = FolioData.restoreBackup(JSON.stringify({ currency: 'EGP', budgets: { EGP: { Food: 10 } }, transactions: [], v2Onboarded: true, reportedBalanceMinor: 100 }));
assert.equal(legacyFile.budgets.EGP.Food, 1000, 'an old unversioned backup converts budgets once');
assert.equal(legacyFile.reportedBalanceMinor, 100);
assert.equal(legacyFile.v2Onboarded, true);

assert.throws(() => FolioData.restoreBackup('Date,Direction\n'), /Import CSV/);
assert.throws(() => FolioData.restoreBackup('{'), /valid JSON/);

const quoted = [
  '"Date","Direction","Merchant","Category","Amount","Currency","Source","Source package"',
  '"2026-10-10","expense","Coffee, Sandwiches","Food & drinks","135.50","EGP","manual",""',
  '"2026-10-11","income","Monthly salary","Salary","15000.00","EGP","manual",""'
].join('\r\n');
const imported = FolioData.transactionsFromCsv(quoted);
assert.equal(imported.length, 2);
assert.equal(imported[0].merchant, 'Coffee, Sandwiches');
assert.equal(imported[0].amountMinor, 13550);
assert.equal(imported[1].amountMinor, 1500000);
assert.equal(FolioData.transactionsFromCsv(quoted)[0].id, imported[0].id, 'same file keeps stable ids');

const older = [
  'Exported from the previous Folio build',
  'Date,Direction,Merchant,Category,Amount,Currency,Source,Source package',
  '2026-10-10,expense,Book,Shopping,1250.00,EGP,manual,com.example.bank'
].join('\n');
const oldRows = FolioData.transactionsFromCsv(older);
assert.equal(oldRows.length, 1);
assert.equal(oldRows[0].amountMinor, 125000);
assert.equal(oldRows[0].merchant, 'Book');
assert.equal(oldRows[0].sourcePackage, 'com.example.bank');
assert.equal(oldRows[0].category, 'Shopping');

const olderQuotedThousands = [
  'Date;Direction;Merchant;Category;Amount;Currency;Source',
  '10/10/2026;Expense;"Book, shop";Shopping;"1,250.00";EGP;manual'
].join('\n');
const fromExcel = FolioData.transactionsFromCsv(olderQuotedThousands);
assert.equal(fromExcel.length, 1);
assert.equal(fromExcel[0].amountMinor, 125000);
assert.equal(fromExcel[0].merchant, 'Book, shop');
assert.equal(fromExcel[0].direction, 'expense');
assert.equal(fromExcel[0].currency, 'EGP');
const when = new Date(fromExcel[0].occurredAt);
assert.equal(when.getFullYear(), 2026);
assert.equal(when.getMonth(), 9);
assert.equal(when.getDate(), 10);

const bom = '\uFEFF' + quoted;
assert.equal(FolioData.transactionsFromCsv(bom).length, 2);
assert.throws(() => FolioData.transactionsFromCsv(quoted.replace('"EGP"', '"INVALID"')), /currency/i);

assert.equal(FolioData.majorToMinor('19.99'), 1999);
assert.equal(FolioData.majorToMinor(3500), 350000);
assert.equal(FolioData.majorToMinor('nope'), null);

console.log('PASS money, migration, backup and legacy CSV checks');
