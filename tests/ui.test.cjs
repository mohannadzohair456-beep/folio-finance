const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const h=fs.readFileSync('android/app/src/main/assets/index.html','utf8');
for(const s of ['Folio — Personal Finance','FolioNative','Overview','Transactions','Analytics','Budgets','Settings'])
  assert.ok(h.includes(s),'Missing '+s);
const script=h.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(script);
new vm.Script(script[1]);
for(const phrase of ['function trackingPanel()', 'function approveObserved(pkg)', 'getCaptureDiagnostics()', 'getObservedSources()', 'Tracking is off', 'Permission required', 'Choose sources']) assert.ok(h.includes(phrase),'Missing tracking setup: '+phrase);
const dataJs=fs.readFileSync('android/app/src/main/assets/folio-data.js','utf8');
assert.ok(dataJs.includes("entry.source === 'demo'"),'Old demo rows are removed while other records stay');
assert.ok(h.includes('FolioData.migrate'),'Stored data is migrated on launch');
assert.ok(h.includes('Content-Security-Policy'),'Bundled page sets a content security policy');
assert.ok(h.includes("default-src 'none'"),'CSP denies network and remote content by default');
assert.ok(h.includes("connect-src 'none'"),'CSP blocks network requests');
assert.ok(h.includes('if(native()){setTimeout(refreshNative,450);setInterval(refreshNative,10000);}'),'Live notifications should refresh');

// Execute the actual bundled application with a minimal WebView-like browser mock.
function boot(seed, extra){
 const data=new Map(seed?[['folio_finance_v1',JSON.stringify(seed)]]:[]);
 if(extra){ for(const [key,value] of Object.entries(extra)) data.set(key, value); }
 const nodes=new Map();
 const doc={getElementById(id){if(!nodes.has(id))nodes.set(id,{innerHTML:'',value:'',focus(){}});return nodes.get(id);}};
 const localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v))};
 const sandbox=vm.createContext({window:{},document:doc,localStorage,console,confirm:()=>true,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0});
 new vm.Script(script[1]).runInContext(sandbox);
 return {sandbox,data,doc};
}
const fresh=boot();
assert.equal(JSON.parse(fresh.data.get('folio_finance_v1')).demo,false,'Real mode on fresh installation');
assert.equal(JSON.parse(fresh.data.get('folio_finance_v1')).transactions.length,0,'No fake entries');
assert.ok(fresh.doc.getElementById('root').innerHTML.includes('Ask Folio'),'Home offers financial assistant instead of diagnostics');
for(const [id,value] of Object.entries({txmerchant:'Coffee shop',txamount:'135.50',txcurrency:'EGP',txcategory:'Food & drinks',txdate:new Date().toISOString().slice(0,10)})) fresh.doc.getElementById(id).value=value;
vm.runInContext('saveTransaction({preventDefault(){}})',fresh.sandbox);
const tracked=JSON.parse(fresh.data.get('folio_finance_v1')).transactions;
assert.equal(tracked.length,1,'Manual expense persists');
assert.equal(tracked[0].amountMinor,13550,'Accurate monetary unit');
assert.equal(tracked[0].direction,'expense');
assert.ok(fresh.doc.getElementById('root').innerHTML.includes('Coffee shop'),'Saved expense appears on dashboard');
const migrated=boot({demo:true,currency:'EGP',transactions:[{source:'demo',id:'sample'},{source:'manual',id:'real',currency:'EGP',direction:'expense',amountMinor:12500,merchant:'Book',category:'Shopping',occurredAt:Date.now()}],budgets:{EGP:{Shopping:4000}}});
const recovered=JSON.parse(migrated.data.get('folio_finance_v1'));
assert.equal(recovered.demo,false);
assert.equal(recovered.transactions.length,1,'Manual records retained during migration');
assert.equal(recovered.transactions[0].id,'real');
assert.equal(Object.keys(recovered.budgets.EGP||{}).length,0,'Demo budget limits removed');


const exportedCsv = [
 '"Date","Direction","Merchant","Category","Amount","Currency","Source","Source package"',
 '"2026-10-10","expense","Coffee, Sandwiches","Food & drinks","135.50","EGP","manual",""',
 '"2026-10-11","income","Monthly salary","Salary","15000.00","EGP","manual",""'
].join('\r\n');
const restored=boot();
assert.equal(restored.sandbox.window.folioImportCsv(exportedCsv),2,'Import accepts original Folio CSV format');
let entries=JSON.parse(restored.data.get('folio_finance_v1')).transactions;
assert.equal(entries.length,2,'Both income and expense restored');
assert.equal(entries[0].merchant,'Coffee, Sandwiches','Quoted comma preserved');
assert.equal(entries[0].amountMinor,13550,'Imported amount stored precisely');
assert.equal(entries[1].amountMinor,1500000,'Salary restored accurately');
assert.equal(restored.sandbox.window.folioImportCsv(exportedCsv),0,'Reimporting same file does not duplicate');
assert.equal(JSON.parse(restored.data.get('folio_finance_v1')).transactions.length,2);
assert.equal(restored.sandbox.window.folioImportCsv(exportedCsv.replace('"EGP"','"INVALID"')),-1,'Invalid CSV rejected');
assert.equal(JSON.parse(restored.data.get('folio_finance_v1')).transactions.length,2,'Rejected import leaves stored data unchanged');

const hostile=boot();
hostile.sandbox.window.scrollTo=()=>{};
vm.runInContext("state.transactions.push({id:\"x' onclick='alert(1)\",merchant:'<img src=x onerror=alert(1)>',amountMinor:100,currency:'EGP',direction:'expense',category:'Other\"><script>alert(1)</script>',occurredAt:Date.now(),source:'notification'});nav('transactions')", hostile.sandbox);
const rendered=hostile.doc.getElementById('root').innerHTML;
assert.ok(rendered.includes('&lt;img'),'notification merchant is escaped');
assert.equal(rendered.includes('<img'), false);
assert.equal(rendered.includes('<script'), false);
assert.equal(rendered.includes("onclick='alert"), false);

const backupState={schemaVersion:1,currency:'EGP',capture:true,sources:['com.stc.pay'],v2Onboarded:true,transactions:[{id:'keep',amountMinor:4500,currency:'SAR',direction:'expense',merchant:'Jarir',category:'Shopping',occurredAt:1700000000000,source:'manual'}],budgets:{SAR:{Shopping:250000}},monthlyIncomeMinor:2000000,reportedBalanceMinor:421000,balanceReportedAt:42,monthlyBudgetMinor:900000};
const seeded=boot(backupState);
const backup=seeded.sandbox.FolioData.buildBackup(JSON.parse(seeded.data.get('folio_finance_v1')));
const blank=boot();
assert.ok(blank.sandbox.window.folioImportJson(JSON.stringify(backup))>=1,'JSON restore returns the transaction count');
const back=JSON.parse(blank.data.get('folio_finance_v1'));
assert.equal(back.reportedBalanceMinor,421000);
assert.equal(back.monthlyIncomeMinor,2000000);
assert.equal(back.monthlyBudgetMinor,900000);
assert.equal(back.budgets.SAR.Shopping,250000);
assert.deepEqual(back.sources,['com.stc.pay']);
assert.equal(back.v2Onboarded,true);
assert.equal(back.capture,true);
assert.equal(back.transactions.find(t=>t.id==='keep').merchant,'Jarir');
assert.ok(blank.data.get('folio_finance_pre_restore_snapshot'),'restore keeps a snapshot of the previous device data');

const gradle=fs.readFileSync('android/app/build.gradle','utf8');
const manifest=fs.readFileSync('android/app/src/main/AndroidManifest.xml','utf8');
assert.ok(gradle.includes('folioVersionCode = 100 + runNumber'),'versionCode stays above the released 33');
assert.ok(gradle.includes('enableV1Signing = true')&&gradle.includes('enableV2Signing = true')&&gradle.includes('enableV3Signing = true'));
assert.equal(manifest.includes('Folio New'), false);
assert.ok(manifest.includes('android:label="@string/app_name"'));
assert.ok(fs.existsSync('android/gradlew'),'Gradle wrapper is present');
function inlined(name){
  const start='/* <folio-inline:'+name+'> */';
  const end='/* </folio-inline:'+name+'> */';
  const i=h.indexOf(start), j=h.indexOf(end);
  assert.ok(i>=0&&j>i,'missing inline '+name);
  return h.slice(i+start.length,j).trim();
}
for (const name of ['folio-data.js','assistant.js','payday-runway.js','folio-v2.js','folio-v2.css','folio-flow.js','folio-flow.css','folio-home.js']) {
  assert.equal(inlined(name), fs.readFileSync('android/app/src/main/assets/'+name,'utf8').trim(), name+' bundled into the page');
}
assert.equal(fs.readFileSync('android/app/src/main/res/values/strings.xml','utf8').includes('>Folio<'), true);

const hostileBooks=boot({
  demo:false,
  currency:'EGP',
  capture:true,
  v2Onboarded:true,
  monthlyBudgetMinor:500000,
  monthlyIncomeMinor:1500000,
  reportedBalanceMinor:842050,
  balanceReportedAt:Date.parse('2026-10-01T09:30:00.000Z'),
  budgets:{EGP:{'Food & drinks':3500,Shopping:4000},SAR:{Shopping:80}},
  transactions:[
    {id:'salary',source:'manual',currency:'EGP',direction:'income',amountMinor:3200000,merchant:'Monthly salary',category:'Salary',occurredAt:Date.now()},
    {id:'market',source:'notification',currency:'EGP',direction:'expense',amountMinor:112000,merchant:'Carrefour',category:'Food & drinks',occurredAt:'2026-10-11T20:15:00.000Z'},
    {id:'bad',merchant:'Mystery',amountMinor:500,currency:'EGP',direction:'expense',occurredAt:'not-a-date',category:'Other'},
    null
  ]
});
hostileBooks.sandbox.window.scrollTo=()=>{};
hostileBooks.sandbox.document.createElement=()=>({click(){},remove(){}});
hostileBooks.sandbox.document.body={appendChild(){}};
hostileBooks.sandbox.URL={createObjectURL:()=>'blob:folio',revokeObjectURL(){}};
hostileBooks.sandbox.Blob=function Blob(){};
for (const screen of ['overview','transactions','insights','budgets','settings']) {
  assert.doesNotThrow(()=>vm.runInContext(`nav('${screen}')`, hostileBooks.sandbox), screen+' renders malformed v0.2.33 rows');
  if (screen==='budgets') assert.ok(hostileBooks.doc.getElementById('root').innerHTML.includes('Food'), 'category budgets survive the upgrade render');
  if (screen==='overview') assert.ok(hostileBooks.doc.getElementById('root').innerHTML.includes('Carrefour'), 'a dated expense still appears after upgrade');
}
assert.doesNotThrow(()=>vm.runInContext('exportCsv()', hostileBooks.sandbox), 'CSV export survives an unparseable date');
const savedBooks=JSON.parse(hostileBooks.data.get('folio_finance_v1'));
assert.equal(savedBooks.budgets.EGP['Food & drinks'], 350000);
assert.equal(savedBooks.reportedBalanceMinor, 842050);
assert.equal(savedBooks.transactions.length, 4);
assert.ok(savedBooks.transactions.some(row=>row&&row.occurredAt==='not-a-date'));

const paydayBoot = boot();
assert.equal(JSON.parse(paydayBoot.data.get('folio_finance_v1')).schemaVersion, 2);
assert.equal(JSON.parse(paydayBoot.data.get('folio_finance_v1')).experimentalPaydayRunway, false);
assert.equal(JSON.parse(paydayBoot.data.get('folio_finance_v1')).paydayAmountMinor, null);
paydayBoot.sandbox.window.scrollTo = () => {};
vm.runInContext("nav('settings')", paydayBoot.sandbox);
const settingsHtml = paydayBoot.doc.getElementById('root').innerHTML;
assert.ok(settingsHtml.includes('aria-label="Toggle payday runway"'), 'settings offers the payday runway switch');
assert.ok(settingsHtml.includes('aria-checked="false"'), 'payday runway starts off');
assert.ok(settingsHtml.includes('insufficient data'), 'settings says missing inputs are not guessed');
vm.runInContext('togglePaydayRunway()', paydayBoot.sandbox);
assert.equal(JSON.parse(paydayBoot.data.get('folio_finance_v1')).experimentalPaydayRunway, true);
paydayBoot.doc.getElementById('payday-date').value = '2026-10-26';
paydayBoot.doc.getElementById('payday-amount').value = '15000.50';
paydayBoot.doc.getElementById('payday-savings').value = '0';
paydayBoot.doc.getElementById('payday-buffer').value = '';
paydayBoot.doc.getElementById('payday-no-commitments').checked = true;
vm.runInContext('savePaydayRunway({preventDefault(){}})', paydayBoot.sandbox);
const paydaySaved = JSON.parse(paydayBoot.data.get('folio_finance_v1'));
assert.equal(paydaySaved.paydayDate, '2026-10-26');
assert.equal(paydaySaved.paydayAmountMinor, 1500050);
assert.equal(paydaySaved.paydayCurrency, 'EGP');
assert.equal(paydaySaved.savingsReservedMinor, 0);
assert.equal(paydaySaved.emergencyReserveMinor, null);
assert.deepEqual(paydaySaved.commitments, []);
assert.equal(paydaySaved.upcomingBills, null);
assert.equal(paydaySaved.schemaVersion, 2);
paydayBoot.doc.getElementById('payday-amount').value = '12.345';
vm.runInContext('savePaydayRunway({preventDefault(){}})', paydayBoot.sandbox);
assert.equal(JSON.parse(paydayBoot.data.get('folio_finance_v1')).paydayAmountMinor, 1500050, 'an invalid amount does not replace stored minor units');
assert.equal(savedBooks.experimentalPaydayRunway, false);
assert.equal(savedBooks.schemaVersion, 2);

const reviewBoot = boot({
  schemaVersion: 1,
  demo: false,
  currency: 'EGP',
  v2Onboarded: true,
  transactions: [
    { id: 'salary', source: 'manual', currency: 'EGP', direction: 'income', amountMinor: 100000, merchant: 'Salary', category: 'Salary', occurredAt: Date.now() },
    { id: 'talabat', source: 'notification', review: true, currency: 'EGP', direction: 'expense', amountMinor: 4500, merchant: 'Talabat', category: 'Food & drinks', occurredAt: Date.now(), sourcePackage: 'com.example.bank' },
    { id: 'dup', source: 'notification', review: true, status: 'duplicate-candidate', currency: 'EGP', direction: 'expense', amountMinor: 4500, merchant: 'Talabat again', category: 'Food & drinks', occurredAt: Date.now() }
  ]
});
reviewBoot.sandbox.window.scrollTo = () => {};
assert.equal(vm.runInContext('txStats(monthTx()).expense', reviewBoot.sandbox), 0, 'suggested and duplicate-candidate rows are not in the month total');
vm.runInContext("nav('transactions')", reviewBoot.sandbox);
const reviewHtml = reviewBoot.doc.getElementById('root').innerHTML;
assert.ok(reviewHtml.includes('aria-label="Confirm Talabat"'), 'review row offers confirm');
assert.ok(reviewHtml.includes('aria-label="Reject Talabat"'), 'review row offers reject');
assert.ok(reviewHtml.includes('aria-label="Edit Talabat"'), 'review row offers edit');
assert.ok(reviewHtml.includes('Auto-detected · Review'));
assert.ok(reviewHtml.includes('Possible duplicate · Review'));
assert.ok(reviewHtml.includes('aria-label="Confirm Talabat again"'));
vm.runInContext('reviewTransaction("talabat","confirmed")', reviewBoot.sandbox);
const confirmedRow = JSON.parse(reviewBoot.data.get('folio_finance_v1')).transactions.find(t => t.id === 'talabat');
assert.equal(confirmedRow.status, 'confirmed');
assert.equal(confirmedRow.review, false);
assert.equal(confirmedRow.source, 'notification');
assert.equal(confirmedRow.sourcePackage, 'com.example.bank');
assert.equal(confirmedRow.amountMinor, 4500);
assert.ok(Number.isFinite(confirmedRow.reviewedAt));
assert.equal(vm.runInContext('txStats(monthTx()).expense', reviewBoot.sandbox), 4500, 'a confirmed notification joins the month total');
vm.runInContext('reviewTransaction("dup","rejected")', reviewBoot.sandbox);
const rejectedRow = JSON.parse(reviewBoot.data.get('folio_finance_v1')).transactions.find(t => t.id === 'dup');
assert.equal(rejectedRow.status, 'rejected');
assert.equal(rejectedRow.review, false);
assert.equal(vm.runInContext('txStats(monthTx()).expense', reviewBoot.sandbox), 4500, 'a rejected row stays out of the month total');
vm.runInContext("editById('dup')", reviewBoot.sandbox);
reviewBoot.doc.getElementById('txmerchant').value = 'Talabat edited';
reviewBoot.doc.getElementById('txamount').value = '45.00';
reviewBoot.doc.getElementById('txcurrency').value = 'EGP';
reviewBoot.doc.getElementById('txcategory').value = 'Food & drinks';
reviewBoot.doc.getElementById('txdate').value = new Date().toISOString().slice(0, 10);
vm.runInContext('saveTransaction({preventDefault(){}})', reviewBoot.sandbox);
const editedRow = JSON.parse(reviewBoot.data.get('folio_finance_v1')).transactions.find(t => t.id === 'dup');
assert.equal(editedRow.merchant, 'Talabat edited');
assert.equal(editedRow.status, 'confirmed');
assert.equal(editedRow.source, 'notification');
assert.equal(editedRow.amountMinor, 4500);

const priorSnapshot=JSON.stringify({folioSnapshot:'premigration',fromSchema:0,toSchema:1,state:{marker:'schema0',budgets:{EGP:{Shopping:3500}}}});
const keptSnapshot=boot({
  schemaVersion:1,
  currency:'EGP',
  v2Onboarded:true,
  budgets:{EGP:{Shopping:4000}},
  transactions:[{id:'keep',source:'manual',currency:'EGP',direction:'expense',amountMinor:12550,merchant:'Carrefour',category:'Food & drinks',occurredAt:Date.now()}]
},{folio_finance_premigration_snapshot:priorSnapshot});
assert.equal(keptSnapshot.data.get('folio_finance_premigration_snapshot'), priorSnapshot, 'schema 2 does not replace a snapshot taken earlier');
const keptState=JSON.parse(keptSnapshot.data.get('folio_finance_v1'));
assert.equal(keptState.schemaVersion, 2);
assert.equal(keptState.budgets.EGP.Shopping, 4000, 'schema 1 budgets stay minor units');
assert.equal(keptState.transactions[0].status, 'confirmed');
assert.equal(keptState.transactions[0].merchant, 'Carrefour');

const schema1=boot({
  schemaVersion:1,
  currency:'EGP',
  v2Onboarded:true,
  budgets:{EGP:{Shopping:2500}},
  transactions:[{id:'market',source:'notification',review:true,currency:'EGP',direction:'expense',amountMinor:4500,merchant:'Talabat',category:'Food & drinks',occurredAt:Date.now()}]
});
const written=schema1.data.get('folio_finance_premigration_snapshot');
const writtenSnapshot=JSON.parse(written);
assert.equal(writtenSnapshot.folioSnapshot, 'premigration');
assert.equal(writtenSnapshot.fromSchema, 1);
assert.equal(writtenSnapshot.toSchema, 2);
assert.equal(writtenSnapshot.state.schemaVersion, 1);
assert.equal(writtenSnapshot.state.budgets.EGP.Shopping, 2500, 'the snapshot keeps the pre-migration budget');
assert.equal(writtenSnapshot.state.transactions[0].review, true);
assert.equal(writtenSnapshot.state.transactions[0].status, undefined);
assert.equal(JSON.parse(schema1.data.get('folio_finance_v1')).transactions[0].status, 'suggested');
const second=boot(JSON.parse(schema1.data.get('folio_finance_v1')),{folio_finance_premigration_snapshot:written});
assert.equal(second.data.get('folio_finance_premigration_snapshot'), written, 'a second launch leaves the snapshot alone');

for (const name of ['folio-data.js','assistant.js','payday-runway.js','folio-v2.js']) {
  const source=fs.readFileSync('android/app/src/main/assets/'+name,'utf8');
  assert.equal(source.includes('?.'), false, name+' is parsed by the Android 8 WebView, so it cannot use optional chaining');
  assert.equal(source.includes('??'), false, name+' is parsed by the Android 8 WebView, so it cannot use nullish coalescing');
}
assert.equal(h.includes('?.'), false, 'bundled page cannot use optional chaining');
assert.equal(h.includes('??'), false, 'bundled page cannot use nullish coalescing');

const upgradeYml=fs.readFileSync('.github/workflows/folio-device-upgrade.yml','utf8');
const upgradeDriver=fs.readFileSync('.github/scripts/folio_device_drive.py','utf8');
assert.ok(upgradeYml.includes('releases/download/v0.2.33/app-release.apk'), 'v0.2.33 upgrade stays');
assert.ok(upgradeYml.includes('releases/download/v0.3.46/app-release.apk'), 'schema 1 upgrade uses the published v0.3.46 APK');
assert.ok(upgradeYml.includes('--expect-old 0.3.46'), 'schema 1 upgrade checks the installed version');
assert.ok(upgradeDriver.includes('expect_old'), 'the driver can expect a version other than v0.2.33');
assert.ok(upgradeYml.includes('releases/download/${CANDIDATE_TAG}/app-release.apk'), 'the upgrade installs the candidate tag');
assert.ok(upgradeYml.includes('needs: [upgrade-from-v0233, upgrade-from-schema1]'), 'latest changes only after both upgrade paths');
assert.ok(upgradeYml.includes('-F prerelease=false'), 'a passed upgrade clears the prerelease flag');
assert.ok(upgradeYml.includes('-f make_latest=true'), 'a passed upgrade promotes the candidate to latest');
assert.ok(upgradeYml.includes('-F prerelease=true -f make_latest=false'), 'a failed upgrade marks the candidate as a prerelease and clears latest');
const buildYml=fs.readFileSync('.github/workflows/build-apk.yml','utf8');
assert.ok(buildYml.includes('prerelease: true'), 'main builds publish as prereleases');
assert.ok(buildYml.includes('make_latest: false'), 'a new build does not replace releases/latest');
assert.equal(buildYml.includes('make_latest: true'), false, 'publish does not mark the build latest before the upgrade');
assert.ok(buildYml.includes('126a716dad1de9968cfb293aa4c7b3b7567d22d1ccc36cdf62f3fdbc3ce7767f'), 'the release certificate pin is unchanged');

const flowHome = boot({
  demo: false,
  currency: 'EGP',
  v2Onboarded: true,
  transactions: [
    { id: 'pay', source: 'manual', currency: 'EGP', direction: 'income', amountMinor: 250000, merchant: 'Salary Co', category: 'Salary', occurredAt: Date.now() },
    { id: 'market', source: 'notification', currency: 'EGP', direction: 'expense', amountMinor: 12550, merchant: 'Carrefour', category: 'Food & drinks', occurredAt: Date.now() },
    { id: 'usd', source: 'manual', currency: 'USD', direction: 'expense', amountMinor: 8800, merchant: 'Dollar Mart', category: 'Travel', occurredAt: Date.now() }
  ]
});
flowHome.sandbox.window.scrollTo = () => {};
vm.runInContext("nav('overview')", flowHome.sandbox);
const homeHtml = flowHome.doc.getElementById('root').innerHTML;
assert.ok(homeHtml.includes('Where your money goes'), 'home shows where money goes');
assert.ok(homeHtml.includes('Carrefour'), 'dated spending stays on home');
assert.ok(homeHtml.includes('Quick add') && homeHtml.includes('Voice entry'), 'home offers quick add and voice');
assert.ok(homeHtml.includes('prefer offline speech'), 'home says speech prefers offline');
assert.ok(homeHtml.includes('recognizer may use the network'), 'home says the recognizer may use the network');
const flowHtml = homeHtml.slice(homeHtml.indexOf('class="panel flow-panel"'), homeHtml.indexOf('v2-overview-entry'));
assert.ok(flowHtml.includes('Salary Co') && flowHtml.includes('Food &amp; drinks'), 'the flow names this currency only');
assert.equal(flowHtml.includes('Dollar Mart'), false, 'another currency stays out of the flow');
assert.equal(flowHtml.includes('Travel'), false, 'another currency category stays out of the flow');
assert.ok(flowHtml.includes('another currency'), 'the flow says other currencies were left out');
assert.ok(h.includes('Add transaction') && h.includes('New transaction') && h.includes('Merchant or source'), 'the original transaction dialog stays available');

vm.runInContext('openFastEntry()', flowHome.sandbox);
const sheet = flowHome.doc.getElementById('modal-root').innerHTML;
assert.ok(sheet.includes('Save expense') && sheet.includes('Amount keypad'), 'quick add uses its own sheet');
assert.ok(sheet.includes('Carrefour'), 'recent merchants are offered');
assert.equal(sheet.includes('Dollar Mart'), false, 'quick add ignores other currencies');
assert.equal(sheet.includes('Salary Co'), false, 'expense suggestions ignore income merchants');
vm.runInContext("fastPressKey('1');fastPressKey('2');fastPressKey('.');fastPressKey('5');fastPressKey('0')", flowHome.sandbox);
assert.equal(flowHome.doc.getElementById('fast-amount').textContent, '12.50');
flowHome.doc.getElementById('fast-merchant').value = 'Kiosk';
vm.runInContext("fastPickCategory('Transport');commitFastEntry()", flowHome.sandbox);
const quickSaved = JSON.parse(flowHome.data.get('folio_finance_v1')).transactions;
const kiosk = quickSaved.find(entry => entry.merchant === 'Kiosk');
assert.ok(kiosk, 'quick add stores the expense');
assert.equal(kiosk.amountMinor, 1250);
assert.equal(kiosk.direction, 'expense');
assert.equal(kiosk.category, 'Transport');
assert.equal(kiosk.currency, 'EGP');
assert.equal(kiosk.source, 'manual');
assert.equal(Object.prototype.hasOwnProperty.call(kiosk, 'status'), false, 'quick add leaves status to the ledger rules');
assert.ok(flowHome.doc.getElementById('toast-region').innerHTML.includes('Undo'), 'a saved quick add can be undone');
vm.runInContext('undoFastEntry()', flowHome.sandbox);
assert.equal(JSON.parse(flowHome.data.get('folio_finance_v1')).transactions.some(entry => entry.merchant === 'Kiosk'), false, 'undo removes the quick add');

function nativeApi(events, acked) {
  return {
    notificationAccessGranted() { return true; },
    getCaptureDiagnostics() { return '{"allowed":1,"parsed":1,"unrecognized":0,"lastAt":0,"lastResult":""}'; },
    getObservedSources() { return '[]'; },
    getPendingTransactions() { return JSON.stringify(events); },
    ackTransactions() { acked.n += 1; },
    captureEnabled() { return true; },
    getSourcePackages() { return '[]'; },
    setDarkChrome() {}
  };
}
const intakeWhen = Date.now();
const intakeBoot = boot({
  demo: false,
  currency: 'EGP',
  v2Onboarded: true,
  reportedBalanceMinor: 100000,
  balanceReportedAt: intakeWhen - 86400000,
  transactions: []
});
intakeBoot.sandbox.window.scrollTo = () => {};
const acked = { n: 0 };
const bridge = nativeApi([
  { id: 'pay-5', amountMinor: 500, currency: 'EGP', direction: 'expense', merchant: 'Carrefour', category: 'Food & drinks', occurredAt: intakeWhen, source: 'notification', confidence: 'high', ambiguous: false, statedBalanceMinor: 501000, statedBalanceCurrency: 'EGP' },
  { id: 'low-1', amountMinor: 900, currency: 'EGP', direction: 'expense', merchant: 'Kiosk', category: 'Other', occurredAt: intakeWhen, source: 'notification', confidence: 'low', ambiguous: false },
  { id: 'dup-5', amountMinor: 500, currency: 'EGP', direction: 'expense', merchant: 'Carrefour', category: 'Food & drinks', occurredAt: intakeWhen, source: 'notification', confidence: 'high', ambiguous: false },
  { id: 'vague', amountMinor: 1200, currency: 'EGP', direction: 'expense', merchant: 'Shop', category: 'Other', occurredAt: intakeWhen, source: 'notification', ambiguous: true }
], acked);
intakeBoot.sandbox.FolioNative = bridge;
intakeBoot.sandbox.window.FolioNative = bridge;
vm.runInContext('refreshNative()', intakeBoot.sandbox);
const intakeState = JSON.parse(intakeBoot.data.get('folio_finance_v1'));
const paid = intakeState.transactions.find(row => row.id === 'pay-5');
assert.equal(paid.status, 'confirmed');
assert.equal(paid.autoConfirmed, true);
assert.equal(paid.review, false);
assert.equal(Object.prototype.hasOwnProperty.call(paid, 'statedBalanceMinor'), false, 'a stated balance is not stored on the transaction');
assert.equal(intakeState.reportedBalanceMinor, 100000, 'notification intake does not replace the entered balance');
assert.equal(intakeState.balanceObservations[0].amountMinor, 501000);
assert.equal(intakeState.balanceObservations[0].currency, 'EGP');
assert.equal(intakeState.transactions.find(row => row.id === 'low-1').status, 'suggested');
assert.equal(intakeState.transactions.find(row => row.id === 'dup-5').status, 'duplicate-candidate');
assert.equal(intakeState.transactions.find(row => row.id === 'vague').status, 'suggested', 'an ambiguous amount is not auto-confirmed');
assert.equal(vm.runInContext('txStats(monthTx()).expense', intakeBoot.sandbox), 500, 'only the auto-confirmed amount is in the month total');
vm.runInContext("nav('transactions')", intakeBoot.sandbox);
const intakeHtml = intakeBoot.doc.getElementById('root').innerHTML;
assert.ok(intakeHtml.includes('Auto-saved · Counted'));
assert.ok(intakeHtml.includes('aria-label="Undo Carrefour"'));
assert.ok(intakeHtml.includes('aria-label="Reject Carrefour"'));
assert.ok(intakeHtml.includes('aria-label="Edit Carrefour"'));
assert.ok(intakeHtml.includes('aria-label="Confirm Kiosk"'), 'a low-confidence row still asks for confirm');
vm.runInContext('undoAutoNotifications()', intakeBoot.sandbox);
const undone = JSON.parse(intakeBoot.data.get('folio_finance_v1')).transactions.find(row => row.id === 'pay-5');
assert.equal(undone.status, 'rejected');
assert.equal(undone.autoConfirmed, false);
assert.equal(vm.runInContext('txStats(monthTx()).expense', intakeBoot.sandbox), 0, 'undo removes the auto-confirmed amount from the total');
assert.equal(acked.n, 1, 'the queue is acknowledged after a successful save');

const reviewFirst = boot({
  demo: false,
  currency: 'EGP',
  v2Onboarded: true,
  alwaysReviewNotifications: true,
  transactions: []
});
reviewFirst.sandbox.window.scrollTo = () => {};
const reviewBridge = nativeApi([
  { id: 'held', amountMinor: 500, currency: 'EGP', direction: 'expense', merchant: 'Bakery', category: 'Food & drinks', occurredAt: intakeWhen, source: 'notification', confidence: 'high', ambiguous: false }
], { n: 0 });
reviewFirst.sandbox.FolioNative = reviewBridge;
reviewFirst.sandbox.window.FolioNative = reviewBridge;
vm.runInContext('refreshNative()', reviewFirst.sandbox);
const held = JSON.parse(reviewFirst.data.get('folio_finance_v1')).transactions.find(row => row.id === 'held');
assert.equal(held.status, 'suggested', 'the always-review setting keeps a clear alert unconfirmed');
assert.equal(vm.runInContext('txStats(monthTx()).expense', reviewFirst.sandbox), 0);
vm.runInContext("nav('settings')", reviewFirst.sandbox);
assert.ok(reviewFirst.doc.getElementById('root').innerHTML.includes('Always review notifications'));

console.log('PASS bundled interface and tracking setup checks');
require('./boot.test.cjs');
