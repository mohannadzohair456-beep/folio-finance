const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const h=fs.readFileSync('android/app/src/main/assets/index.html','utf8');
for(const s of ['Folio — Personal Finance','FolioNative','Overview','Transactions','Analytics','Budgets','Settings'])
  assert.ok(h.includes(s),'Missing '+s);
const script=h.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(script);
new vm.Script(script[1]);
for(const phrase of ['function trackingPanel()', 'function approveObserved(pkg)', 'getCaptureDiagnostics()', 'getObservedSources()', 'Tracking is off', 'Permission required', 'Choose sources']) assert.ok(h.includes(phrase),'Missing tracking setup: '+phrase);
assert.ok(h.includes("transactions:o.transactions.filter(t=>t.source!=='demo')"),'Old demo state must transition while preserving non-demo records');
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
assert.ok(fresh.doc.getElementById('root').innerHTML.includes('Transaction tracking'));
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
assert.equal(Object.keys(recovered.budgets).length,0,'Demo budgets removed');

console.log('PASS bundled interface and tracking setup checks');
