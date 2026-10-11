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
console.log('PASS bundled interface and tracking setup checks');
