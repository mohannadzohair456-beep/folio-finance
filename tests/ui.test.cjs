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
function boot(seed){
 const data=new Map(seed?[['folio_finance_v1',JSON.stringify(seed)]]:[]);
 const nodes=new Map();
 const doc={getElementById(id){if(!nodes.has(id))nodes.set(id,{innerHTML:'',value:''});return nodes.get(id);}};
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
for (const name of ['folio-data.js','assistant.js','folio-v2.js','folio-v2.css']) {
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

console.log('PASS bundled interface and tracking setup checks');
