const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const h=fs.readFileSync('android/app/src/main/assets/index.html','utf8');
for(const s of ['Folio — Personal Finance','FolioNative','Overview','Transactions','Analytics','Budgets','Settings'])
  assert.ok(h.includes(s),'Missing '+s);
const script=h.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(script);
new vm.Script(script[1]);
console.log('PASS bundled interface checks');
