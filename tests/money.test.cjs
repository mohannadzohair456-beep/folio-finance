const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('android/app/src/main/assets/folio-data.js', 'utf8'), sandbox);
const FolioData = sandbox.FolioData;
assert.equal(FolioData.SCHEMA_VERSION, 2);
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
assert.equal(migrated.state.schemaVersion, 2);
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
assert.equal(migrated.state.schemaVersion, 2);
assert.equal(migrated.state.experimentalPaydayRunway, false);
assert.equal(migrated.state.paydayDate, null);
assert.equal(migrated.state.paydayAmountMinor, null);
assert.equal(migrated.state.upcomingBills, null);
assert.equal(migrated.state.installments, null);
assert.equal(migrated.state.gameya, null);
assert.equal(migrated.state.commitments, null);
assert.equal(migrated.state.savingsReservedMinor, null);
assert.equal(migrated.state.emergencyReserveMinor, null);

const again = FolioData.migrate(migrated.state, null);
assert.equal(again.snapshot, null, 'a second launch does not take another snapshot');
assert.equal(again.state.experimentalPaydayRunway, false);
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
assert.equal(corrupt.state.schemaVersion, 2);
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
same(restored.transactions, [Object.assign({}, workspace.transactions[0], { status: 'confirmed' })], 'schema 1 manual rows become confirmed');
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

// A workspace shaped like a phone that finished v0.2.33 onboarding, plus rows that build would have kept or corrupted.
const v0233 = {
  demo: false,
  currency: 'EGP',
  capture: true,
  sources: 'com.google.android.apps.messaging',
  v2Onboarded: true,
  monthlyBudgetMinor: 500000,
  monthlyIncomeMinor: '1500000',
  reportedBalanceMinor: 842050,
  balanceReportedAt: '2026-10-01T09:30:00.000Z',
  budgets: {
    EGP: { 'Food & drinks': 3500, Shopping: 4000.5 },
    egp: { Transport: 200 },
    SAR: { Shopping: 80 }
  },
  transactions: [
    { id: 'salary', source: 'manual', currency: 'EGP', direction: 'income', amountMinor: 3200000, merchant: 'Monthly salary', category: 'Salary', occurredAt: Date.UTC(2026, 9, 1, 8, 0, 0), review: false },
    { id: 'market', source: 'notification', currency: 'egp', direction: 'Expense', amountMinor: '112000', merchant: 'Carrefour', category: 'Food & drinks', occurredAt: '2026-10-11T20:15:00.000Z', sourcePackage: 'com.example.bank' },
    { id: 'blank-fields' },
    null,
    { id: 'bad-time', merchant: 'Mystery', amountMinor: 500, currency: 'EGP', direction: 'expense', occurredAt: 'not-a-date', category: 'Other' },
    { id: 'unsafe', merchant: 'Overflow', amountMinor: 1e20, currency: 'EGP', direction: 'expense', occurredAt: Date.UTC(2026, 9, 2), category: 'Other' },
    { id: 'negative', merchant: 'Reversed', amountMinor: -100, currency: 'EGP', direction: 'expense', occurredAt: Date.UTC(2026, 9, 3), category: 'Other' }
  ]
};
const phone = FolioData.migrate(v0233, null);
assert.equal(phone.state.v2Onboarded, true);
assert.equal(phone.state.capture, true);
assert.equal(phone.state.monthlyBudgetMinor, 500000, 'monthly target stays minor units');
assert.equal(phone.state.monthlyIncomeMinor, 1500000);
assert.equal(phone.state.reportedBalanceMinor, 842050);
assert.equal(phone.state.balanceReportedAt, Date.parse('2026-10-01T09:30:00.000Z'));
assert.equal(phone.state.budgets.EGP['Food & drinks'], 350000);
assert.equal(phone.state.budgets.EGP.Shopping, 400050);
assert.equal(phone.state.budgets.EGP.Transport, 20000, 'egp and EGP budgets land in one currency');
assert.equal(phone.state.budgets.SAR.Shopping, 8000);
assert.equal(phone.state.legacySources, v0233.sources, 'a non-array allowlist is kept beside the default');
assert.ok(Array.isArray(phone.state.sources) && phone.state.sources.length === 3);
assert.equal(phone.state.transactions.length, 7, 'null and incomplete rows are kept');
const market = phone.state.transactions.find(row => row.id === 'market');
assert.equal(market.direction, 'expense');
assert.equal(market.currency, 'EGP');
assert.equal(market.amountMinor, 112000);
assert.equal(market.occurredAt, Date.parse('2026-10-11T20:15:00.000Z'));
assert.equal(market.sourcePackage, 'com.example.bank');
assert.equal(phone.state.transactions.find(row => row.id === 'bad-time').occurredAt, 'not-a-date');
const phoneTotals = FolioData.summarize(phone.state.transactions, 'EGP');
assert.equal(phoneTotals.income, 3200000);
assert.equal(phoneTotals.expense, 112500, 'unsafe and negative amounts are not added in');
assert.equal(phone.state.transactions.find(row => row.id === 'unsafe').amountMinor, 1e20);
const phoneAgain = FolioData.migrate(phone.state, null);
assert.equal(phoneAgain.state.budgets.EGP['Food & drinks'], 350000);
assert.equal(phoneAgain.state.transactions.length, 7);
assert.equal(phoneAgain.snapshot, null);

const booksOnly = FolioData.migrate({
  currency: 'SAR',
  reportedBalanceMinor: 250000,
  budgets: { SAR: { Shopping: 90 } },
  v2Onboarded: true
}, null);
assert.equal(booksOnly.state.transactions.length, 0);
assert.equal(booksOnly.state.reportedBalanceMinor, 250000);
assert.equal(booksOnly.state.budgets.SAR.Shopping, 9000, 'budgets survive when the transactions array is missing');

function legacyExport(rows) {
  const quote = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';
  const header = ['Date', 'Direction', 'Merchant', 'Category', 'Amount', 'Currency', 'Source', 'Source package'];
  const body = rows.map(row => [
    new Date(row.occurredAt).toISOString().slice(0, 10),
    row.direction,
    row.merchant,
    row.category,
    (row.amountMinor / 100).toFixed(2),
    row.currency,
    row.source,
    row.sourcePackage || ''
  ]);
  return [header, ...body].map(row => row.map(quote).join(',')).join('\r\n');
}
const cairoNight = Date.parse('2026-10-11T22:30:00.000Z');
const exported = legacyExport([
  { occurredAt: cairoNight, direction: 'expense', merchant: 'Coffee, Sandwiches', category: 'Food & drinks', amountMinor: 13550, currency: 'EGP', source: 'manual', sourcePackage: '' },
  { occurredAt: Date.parse('2026-10-02T10:00:00.000Z'), direction: 'income', merchant: 'راتب', category: 'Salary', amountMinor: 1850000, currency: 'EGP', source: 'notification', sourcePackage: 'com.google.android.apps.messaging' }
]);
const fromPhone = FolioData.transactionsFromCsv(exported);
assert.equal(fromPhone.length, 2);
assert.equal(fromPhone[0].merchant, 'Coffee, Sandwiches');
assert.equal(fromPhone[0].amountMinor, 13550);
assert.equal(fromPhone[0].category, 'Food & drinks');
assert.equal(new Date(fromPhone[0].occurredAt).toISOString().slice(0, 10), '2026-10-11');
assert.equal(fromPhone[1].merchant, 'راتب');
assert.equal(fromPhone[1].amountMinor, 1850000);
assert.equal(fromPhone[1].sourcePackage, 'com.google.android.apps.messaging');
assert.equal(FolioData.transactionsFromCsv(exported)[0].id, fromPhone[0].id);

const serialWhen = FolioData.transactionsFromCsv('Date,Direction,Merchant,Category,Amount,Currency\n45940,debit,Jarir,Shopping,86.50,SAR\n')[0];
assert.equal(serialWhen.direction, 'expense');
assert.equal(serialWhen.amountMinor, 8650);
const serialDay = new Date(serialWhen.occurredAt);
assert.equal(serialDay.getFullYear(), 2025);
assert.equal(serialDay.getMonth(), 9);
assert.equal(serialDay.getDate(), 10);
assert.throws(() => FolioData.transactionsFromCsv(exported.replace('"135.50"', '"nope"')), /amount/i);

const runwayState = FolioData.migrate({
  schemaVersion: 1,
  currency: 'EGP',
  experimentalPaydayRunway: true,
  paydayDate: '2026-10-26',
  paydayAmountMinor: 1500000,
  paydayCurrency: 'EGP',
  upcomingBills: [],
  installments: [{ id: 'i1', amountMinor: 100, currency: 'EGP', due: '2026-10-20' }],
  gameya: [],
  commitments: [{ id: 'rent', kind: 'rent', amountMinor: 100, currency: 'EGP', due: '2026-10-20', paid: false, confirmed: true }],
  savingsReservedMinor: 0,
  emergencyReserveMinor: 5000,
  reportedBalanceMinor: 10,
  transactions: [],
  budgets: { EGP: { Shopping: 4000 } }
}, null);
assert.equal(runwayState.snapshot.fromSchema, 1, 'schema 1 is snapshotted once on the way to schema 2');
assert.equal(runwayState.state.schemaVersion, 2);
assert.equal(runwayState.state.experimentalPaydayRunway, true);
assert.equal(runwayState.state.paydayAmountMinor, 1500000);
assert.equal(runwayState.state.budgets.EGP.Shopping, 4000, 'schema 1 budgets are already minor');
assert.equal(runwayState.state.installments[0].amountMinor, 100);
const runwayAgain = FolioData.migrate(runwayState.state, null);
assert.equal(runwayAgain.snapshot, null);
assert.equal(runwayAgain.state.budgets.EGP.Shopping, 4000, 'payday migration does not multiply budgets');
assert.equal(runwayAgain.state.paydayAmountMinor, 1500000);
const restoredRunway = FolioData.restoreBackup(JSON.stringify(FolioData.buildBackup(runwayState.state)));
assert.equal(restoredRunway.experimentalPaydayRunway, true);
assert.equal(restoredRunway.paydayDate, '2026-10-26');
assert.equal(restoredRunway.savingsReservedMinor, 0);
assert.equal(restoredRunway.emergencyReserveMinor, 5000);
same(restoredRunway.upcomingBills, []);
same(restoredRunway.commitments, [{ id: 'rent', kind: 'rent', amountMinor: 100, currency: 'EGP', due: '2026-10-20', paid: false, confirmed: true }]);

const messyRunway = FolioData.migrate({
  schemaVersion: 1,
  paydayAmountMinor: 10.5,
  paydayDate: 'October',
  upcomingBills: 'nope',
  experimentalPaydayRunway: 'yes',
  savingsReservedMinor: -5
}, null);
assert.equal(messyRunway.state.schemaVersion, 2);
assert.equal(messyRunway.state.experimentalPaydayRunway, false);
assert.equal(messyRunway.state.paydayAmountMinor, null);
assert.equal(messyRunway.state.legacyPaydayAmount, 10.5);
assert.equal(messyRunway.state.paydayDate, null);
assert.equal(messyRunway.state.upcomingBills, null);
assert.equal(messyRunway.state.legacyUpcomingBills, 'nope');
assert.equal(messyRunway.state.savingsReservedMinor, null);
assert.equal(messyRunway.state.legacySavingsReserved, -5);

assert.equal(migrated.state.transactions[0].status, 'confirmed', 'an existing manual row becomes confirmed');
assert.equal(migrated.state.transactions[2].status, 'confirmed', 'an incomplete legacy row is confirmed, not dropped');

const reviewBooks = FolioData.migrate({
  schemaVersion: 1,
  currency: 'EGP',
  budgets: { EGP: { Shopping: 4000 } },
  transactions: [
    { id: 'old', source: 'manual', currency: 'EGP', direction: 'expense', amountMinor: 100, merchant: 'Cash', category: 'Other', occurredAt: 1 },
    { id: 'alert', source: 'notification', review: true, currency: 'EGP', direction: 'expense', amountMinor: 2500, merchant: 'Talabat', category: 'Food & drinks', occurredAt: 2, sourcePackage: 'com.example.bank' },
    { id: 'kept', source: 'notification', review: false, currency: 'EGP', direction: 'expense', amountMinor: 300, merchant: 'Metro', category: 'Transport', occurredAt: 3 },
    { id: 'dup', source: 'notification', review: true, status: 'duplicate_candidate', currency: 'EGP', direction: 'expense', amountMinor: 2500, merchant: 'Talabat', category: 'Food & drinks', occurredAt: 4 },
    { id: 'nope', source: 'manual', status: 'not-a-status', currency: 'EGP', direction: 'expense', amountMinor: 100, merchant: 'Kiosk', category: 'Other', occurredAt: 5 },
    { id: 'already', source: 'notification', review: true, status: 'rejected', currency: 'EGP', direction: 'expense', amountMinor: 100, merchant: 'Spam', category: 'Other', occurredAt: 6 }
  ]
}, null);
assert.equal(reviewBooks.state.schemaVersion, 2);
assert.equal(reviewBooks.state.budgets.EGP.Shopping, 4000, 'status migration does not multiply schema 1 budgets');
assert.equal(reviewBooks.state.transactions.find(t => t.id === 'old').status, 'confirmed');
assert.equal(reviewBooks.state.transactions.find(t => t.id === 'alert').status, 'suggested');
assert.equal(reviewBooks.state.transactions.find(t => t.id === 'alert').review, true, 'the review flag stays on a suggestion');
assert.equal(reviewBooks.state.transactions.find(t => t.id === 'alert').sourcePackage, 'com.example.bank');
assert.equal(reviewBooks.state.transactions.find(t => t.id === 'kept').status, 'confirmed', 'a notification that was not flagged for review stays confirmed');
assert.equal(reviewBooks.state.transactions.find(t => t.id === 'dup').status, 'duplicate-candidate');
assert.equal(reviewBooks.state.transactions.find(t => t.id === 'nope').status, 'confirmed');
assert.equal(reviewBooks.state.transactions.find(t => t.id === 'already').status, 'rejected', 'an explicit status is kept');
const statusRoundTrip = FolioData.restoreBackup(JSON.stringify(FolioData.buildBackup(reviewBooks.state)));
assert.equal(statusRoundTrip.schemaVersion, 2);
assert.equal(statusRoundTrip.transactions.find(t => t.id === 'alert').status, 'suggested');
assert.equal(statusRoundTrip.transactions.find(t => t.id === 'dup').status, 'duplicate-candidate');
assert.equal(statusRoundTrip.budgets.EGP.Shopping, 4000);
const statusAgain = FolioData.migrate(statusRoundTrip, null);
assert.equal(statusAgain.snapshot, null, 'schema 2 does not snapshot again');
assert.equal(statusAgain.state.transactions.find(t => t.id === 'alert').status, 'suggested');
assert.equal(statusAgain.state.budgets.EGP.Shopping, 4000);
assert.equal(FolioData.transactionsFromCsv(quoted)[0].status, 'confirmed', 'a user-imported CSV row is confirmed');

const day = 24 * 60 * 60 * 1000;
const balanceNow = Date.UTC(2026, 9, 12);
const withAccounts = FolioData.migrate({
  schemaVersion: 2,
  currency: 'EGP',
  reportedBalanceMinor: 842050,
  balanceReportedAt: balanceNow - day,
  transactions: [
    { id: 'alert', source: 'notification', currency: 'EGP', direction: 'expense', amountMinor: 1000, occurredAt: balanceNow, merchant: 'Bank', category: 'Other' }
  ],
  accounts: [
    { id: 'cash', name: 'Wallet', type: 'cash', currency: 'EGP', balanceMinor: 20000, asOf: balanceNow - day, provenance: 'manual' },
    { id: 'stale', name: 'Bank <note>', type: 'bank', currency: 'EGP', balanceMinor: 50000, asOf: balanceNow - 8 * day, provenance: 'notification', untracked: false },
    { name: 'Mystery', type: 'nope', balanceMinor: '12.5', asOf: 'yesterday' }
  ]
}, null);
assert.equal(withAccounts.snapshot, null, 'adding accounts does not open a new schema');
assert.equal(withAccounts.state.reportedBalanceMinor, 842050, 'notification rows do not rewrite the entered balance');
assert.equal(withAccounts.state.accounts.length, 3);
assert.equal(withAccounts.state.accounts[0].balanceMinor, 20000);
assert.equal(withAccounts.state.accounts[1].provenance, 'manual', 'a notification is not stored as the source of a balance');
assert.equal(withAccounts.state.accounts[1].name, 'Bank <note>');
assert.equal(withAccounts.state.accounts[2].balanceMinor, null);
assert.equal(withAccounts.state.accounts[2].type, 'cash');
assert.equal(FolioData.balanceFreshness(withAccounts.state.accounts[0], balanceNow), 'fresh');
assert.equal(FolioData.balanceFreshness(withAccounts.state.accounts[1], balanceNow), 'stale');
assert.equal(FolioData.balanceFreshness(withAccounts.state.accounts[2], balanceNow), 'unknown');
assert.equal(FolioData.balanceFreshness({ balanceMinor: 842050, balanceReportedAt: null }, balanceNow), 'unknown');
assert.equal(FolioData.untrackedMovement({
  asOf: balanceNow - day,
  currency: 'EGP'
}, withAccounts.state.transactions), true);
assert.equal(FolioData.untrackedMovement(withAccounts.state.accounts[0], []), false);
const accountRoundTrip = FolioData.restoreBackup(JSON.stringify(FolioData.buildBackup(withAccounts.state)));
assert.equal(accountRoundTrip.accounts[0].balanceMinor, 20000);
assert.equal(accountRoundTrip.accounts[0].asOf, balanceNow - day);
assert.equal(FolioData.transactionsFromCsv('date,amount,currency,direction,merchant,category\n2026-10-01,10,EGP,expense,Shop,Other').some(row => row.balanceMinor != null), false);

console.log('PASS money, migration, backup and legacy CSV checks');
