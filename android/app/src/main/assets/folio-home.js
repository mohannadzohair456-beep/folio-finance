var fastOpen=false,fastDirection='expense',fastAmount='',fastMerchant='',fastCategory='Other',fastUndo=null,fastUndoTimer=0;
var quickEntryText='',quickEntryMessage='',quickDraft=null,quickEditDirection='expense',quickEditCategory='Other',quickEditAmountText='',quickEditMerchant='';
function voiceLocaleNow(){
  if(window.FolioV2&&typeof FolioV2.currentVoiceLocale==='function')return FolioV2.currentVoiceLocale();
  return 'en-US';
}
function jsArg(value){return String(value==null?'':value).replace(/\\/g,'\\\\').replace(/'/g,'\\x27').replace(/"/g,'\\x22').replace(/&/g,'\\x26').replace(/</g,'\\x3c').replace(/>/g,'\\x3e').replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}
function captureBar(){
  var locale=voiceLocaleNow();
  return `<section class="capture-bar" aria-label="Record money"><div class="capture-actions"><button type="button" class="capture-fast" onclick="openFastEntry()">${icon('plus',16)} Quick add</button><button type="button" class="capture-mic" onclick="FolioV2.requestVoice()" aria-label="Voice entry">${icon('mic',18)} Voice entry</button></div><div class="capture-locales" role="group" aria-label="Voice language"><button type="button" class="capture-locale ${locale==='en-US'?'sel':''}" aria-pressed="${locale==='en-US'?'true':'false'}" onclick="FolioV2.chooseLocale('en-US')">English</button><button type="button" class="capture-locale ${locale==='ar-EG'?'sel':''}" aria-pressed="${locale==='ar-EG'?'true':'false'}" onclick="FolioV2.chooseLocale('ar-EG')">العربية</button></div><p class="capture-hint">Folio asks Android to prefer offline speech. If this phone has no offline pack, Folio says how to install it. The system speech screen's recognizer may use the network. Nothing is saved until you confirm.</p></section>`;
}
function moneyFlowPanel(){
  if(!window.FolioFlow)return '';
  var flow=FolioFlow.buildMoneyFlow(monthAll(),state.currency);
  var intro=`<section class="panel flow-panel" aria-labelledby="flow-title"><div class="panel-heading"><div><h2 id="flow-title">Where your money goes</h2><p>Income sources and spending categories for ${h(monthTitle())}. ${h(state.currency)} only. Currencies are never combined.</p></div><span class="chip">${h(state.currency)}</span></div>`;
  if(flow.empty)return intro+`<div class="empty flow-empty"><div class="bubble">${icon('chart',23)}</div><strong>No ${h(state.currency)} movement this month</strong>Add income and spending in ${h(state.currency)} to see where money comes from and where it goes.</div></section>`;
  var rows='';
  flow.income.forEach(function(node){rows+=`<tr><th scope="row">From</th><td>${h(node.label)}</td><td>${h(fmt(node.amountMinor,flow.currency))}</td></tr>`;});
  flow.expense.forEach(function(node){rows+=`<tr><th scope="row">To</th><td>${h(node.label)}</td><td>${h(fmt(node.amountMinor,flow.currency))}</td></tr>`;});
  var notes='';
  if(flow.excludedCount)notes+=`<p class="tracking-note">${flow.excludedCount} entr${flow.excludedCount===1?'y':'ies'} in another currency ${flow.excludedCount===1?'is':'are'} not in this flow.</p>`;
  if(flow.held)notes+=`<p class="tracking-note">${h(fmt(flow.held,flow.currency))} came in and is not matched to spending this month.</p>`;
  if(flow.uncovered)notes+=`<p class="tracking-note">${h(fmt(flow.uncovered,flow.currency))} of spending has no recorded ${h(flow.currency)} income source this month.</p>`;
  return intro+`<p class="flow-summary">${h(flow.summary)}</p>${FolioFlow.renderFlowSvg(flow)}<table class="flow-table"><caption>Recorded ${h(flow.currency)} this month. Other currencies are not in these figures.</caption><thead><tr><th scope="col">Side</th><th scope="col">Name</th><th scope="col">Amount</th></tr></thead><tbody>${rows}</tbody></table>${notes}</section>`;
}
function fastSuggestions(){
  if(!window.FolioFlow)return {recent:[],frequent:[],categories:[{label:'Other',count:0}]};
  return FolioFlow.rankCaptureSuggestions(state.transactions,state.currency,fastDirection);
}
function chipButtons(list,kind){
  var html='';
  for(var i=0;i<list.length;i++){
    var label=list[i].label;
    var fn=kind==='cat'?'fastPickCategory':'fastPickMerchant';
    var sel=kind==='cat'?fastCategory===label:fastMerchant.toLowerCase()===String(label).toLowerCase();
    html+=`<button type="button" class="fast-chip${sel?' sel':''}" onclick="${fn}('${jsArg(label)}')">${h(label)}</button>`;
  }
  return html;
}
function paintFastEntry(){
  var root=document.getElementById('modal-root');
  if(!root)return;
  var tips=fastSuggestions();
  var recent=tips.recent||[];
  var frequent=[];
  (tips.frequent||[]).forEach(function(item){
    var dup=false;
    for(var i=0;i<recent.length;i++)if(recent[i].label.toLowerCase()===item.label.toLowerCase())dup=true;
    if(!dup)frequent.push(item);
  });
  var cats=tips.categories||[];
  var dir=fastDirection;
  var keys=['1','2','3','4','5','6','7','8','9','.','0','back'];
  var keypad='';
  for(var k=0;k<keys.length;k++){
    var key=keys[k];
    var face=key==='back'?'⌫':key;
    var name=key==='back'?'Delete digit':(key==='.'?'Decimal point':key);
    keypad+=`<button type="button" class="fast-key" aria-label="${name}" onclick="fastPressKey('${key}')">${face}</button>`;
  }
  root.innerHTML=`<div class="fast-scrim" onclick="if(event.target===this)closeFastEntry()"><section class="fast-sheet" role="dialog" aria-modal="true" aria-labelledby="fast-title"><div class="fast-head"><div><p class="eyebrow">QUICK ADD</p><h3 id="fast-title">${dir==='income'?'Record income':'Record an expense'}</h3></div><button type="button" class="close" aria-label="Close quick add" onclick="closeFastEntry()">${icon('close',17)}</button></div><div class="fast-type" role="group" aria-label="Income or expense"><button type="button" class="${dir==='expense'?'selected out':''}" aria-pressed="${dir==='expense'?'true':'false'}" onclick="fastSetDirection('expense')">Expense</button><button type="button" class="${dir==='income'?'selected':''}" aria-pressed="${dir==='income'?'true':'false'}" onclick="fastSetDirection('income')">Income</button></div><div class="fast-amount-wrap"><span class="fast-currency">${h(state.currency)}</span><div id="fast-amount" class="fast-amount" aria-live="polite">${h(fastAmount||'0')}</div></div><div class="fast-keys" role="group" aria-label="Amount keypad">${keypad}</div><label class="fast-field" for="fast-merchant">Merchant</label><input id="fast-merchant" class="textinput" maxlength="90" autocomplete="off" value="${h(fastMerchant)}" oninput="fastSetMerchant(this.value)">${recent.length?`<p class="fast-label">Recent</p><div class="fast-chips">${chipButtons(recent,'merchant')}</div>`:''}${frequent.length?`<p class="fast-label">Frequent</p><div class="fast-chips">${chipButtons(frequent,'merchant')}</div>`:''}<p class="fast-label">Category</p><div class="fast-chips">${chipButtons(cats,'cat')}</div><button type="button" class="fast-save" onclick="commitFastEntry()">Save ${dir==='income'?'income':'expense'}</button></section></div>`;
}
function openFastEntry(){quickDraft=null;fastOpen=true;fastDirection='expense';fastAmount='';fastMerchant='';fastCategory='Other';paintFastEntry();}
function closeFastEntry(){if(!fastOpen)return;fastOpen=false;var root=document.getElementById('modal-root');if(root)root.innerHTML='';}
function rememberFastMerchant(){var node=document.getElementById('fast-merchant');if(fastOpen&&node&&typeof node.value==='string')fastMerchant=String(node.value).slice(0,90);}
function fastSetMerchant(value){fastMerchant=String(value==null?'':value).slice(0,90);}
function fastPressKey(key){if(!window.FolioFlow)return;fastAmount=FolioFlow.keypadAppend(fastAmount,key);var node=document.getElementById('fast-amount');if(node)node.textContent=fastAmount||'0';else if(fastOpen)paintFastEntry();}
function fastSetDirection(dir){
  if(dir!=='income'&&dir!=='expense')return;
  rememberFastMerchant();
  fastDirection=dir;
  var incomeCats={'Salary':1,'Other income':1,'Transfers':1,'Refunds':1};
  if(dir==='income'&&!incomeCats[fastCategory])fastCategory='Salary';
  if(dir==='expense'&&incomeCats[fastCategory])fastCategory='Other';
  if(fastOpen)paintFastEntry();
}
function fastPickMerchant(name){fastMerchant=String(name||'').slice(0,90);if(fastOpen)paintFastEntry();}
function fastPickCategory(name){rememberFastMerchant();fastCategory=String(name||'Other');if(fastOpen)paintFastEntry();}
function commitFastEntry(){
  rememberFastMerchant();
  var merchant=fastMerchant.trim();
  if(!window.FolioFlow){notify('Quick add is unavailable.');return;}
  var minor=FolioFlow.keypadToMinor(fastAmount);
  if(minor==null){notify('Enter an amount up to 2 decimal places.');return;}
  if(!merchant){notify('Add a merchant or source.');return;}
  if(!fastCategory){notify('Choose a category.');return;}
  var row={id:'fast-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),amountMinor:minor,currency:state.currency,direction:fastDirection,merchant:merchant,category:fastCategory,occurredAt:Date.now(),source:'manual'};
  state.transactions.push(row);
  if(!persist()){state.transactions.pop();notify('Could not save. Please check your device storage.');return;}
  fastUndo={id:row.id,summary:fmt(minor,row.currency)+' · '+merchant};
  closeFastEntry();
  render();
  showUndoToast('Saved '+fastUndo.summary);
}
function showUndoToast(text){
  var region=document.getElementById('toast-region');
  if(!region)return;
  region.innerHTML='<div class="toast toast-undo"><span>'+h(text)+'</span><button type="button" class="toast-undo-btn" onclick="undoFastEntry()">Undo</button></div>';
  clearTimeout(fastUndoTimer);
  fastUndoTimer=setTimeout(function(){fastUndo=null;var live=document.getElementById('toast-region');if(live&&live.innerHTML.indexOf('toast-undo')>=0)live.innerHTML='';},7000);
}
function undoFastEntry(){
  if(!fastUndo||!fastUndo.id){notify('Nothing to undo.');return;}
  var id=fastUndo.id,kept=[],removed=null;
  for(var i=0;i<state.transactions.length;i++){var t=state.transactions[i];if(t&&t.id===id&&!removed)removed=t;else kept.push(t);}
  if(!removed){fastUndo=null;notify('That entry is no longer in the list.');return;}
  var previous=state.transactions;
  state.transactions=kept;
  fastUndo=null;
  clearTimeout(fastUndoTimer);
  if(!persist()){state.transactions=previous;notify('Could not remove that entry.');return;}
  var region=document.getElementById('toast-region');
  if(region)region.innerHTML='';
  render();
  notify('Entry removed.');
}
function quickEntryApi(){
  if(typeof FolioQuickEntry!=='undefined'&&FolioQuickEntry&&FolioQuickEntry.parseQuickEntry)return FolioQuickEntry;
  if(window.FolioQuickEntry&&window.FolioQuickEntry.parseQuickEntry)return window.FolioQuickEntry;
  return null;
}
function ensureQuickEntry(){
  if(quickEntryApi())return true;
  if(typeof folioRunDeferred==='function'){try{folioRunDeferred('folio-deferred-quick-entry');}catch(err){}}
  return !!quickEntryApi();
}
function quickEntryRemember(value){quickEntryText=String(value==null?'':value).slice(0,240);}
function quickEntryMessageHtml(){
  if(!quickEntryMessage)return '';
  var parts=String(quickEntryMessage).split('\n'),html='',i;
  for(i=0;i<parts.length;i++)html+='<span class="quick-entry-line">'+h(parts[i])+'</span>';
  return html;
}
function quickEntryMarkup(){
  return '<section class="quick-entry" aria-label="One-line entry"><label class="quick-entry-label" for="quick-entry-input">Add in one line</label><p>Try 150 lunch, +5000 salary, or \u062f\u0641\u0639\u062a 200 \u0645\u0648\u0627\u0635\u0644\u0627\u062a. Nothing is saved until you confirm. \u0645\u0641\u064a\u0634 \u062d\u0627\u062c\u0629 \u0628\u062a\u062a\u0633\u062c\u0644 \u063a\u064a\u0631 \u0644\u0645\u0627 \u062a\u0623\u0643\u0651\u062f.</p><form class="quick-entry-row" onsubmit="return quickEntrySubmit(event)"><input id="quick-entry-input" maxlength="240" autocomplete="off" enterkeyhint="done" placeholder="150 lunch" aria-label="One-line entry" value="'+h(quickEntryText)+'" oninput="quickEntryRemember(this.value)"><button type="submit">Review</button></form><p id="quick-entry-message" class="quick-entry-message" role="status">'+quickEntryMessageHtml()+'</p></section>';
}
function quickEntrySubmit(event){
  if(event&&event.preventDefault)event.preventDefault();
  var node=document.getElementById('quick-entry-input');
  if(node&&typeof node.value==='string')quickEntryRemember(node.value);
  var api=ensureQuickEntry()?quickEntryApi():null;
  if(!api){
    quickEntryMessage='Quick entry is still loading. Try again in a moment. Nothing was saved.\n\u0644\u0633\u0647 \u0628\u064a\u062d\u0645\u0651\u0644. \u062c\u0631\u0651\u0628 \u0643\u0645\u0627\u0646 \u0644\u062d\u0638\u0629. \u0645\u0641\u064a\u0634 \u062d\u0627\u062c\u0629 \u0627\u062a\u0633\u062c\u0644\u062a.';
    quickDraft=null;
    render();
    return false;
  }
  var parsed=api.parseQuickEntry(quickEntryText,{currency:state.currency,now:Date.now()});
  if(!parsed.ok){
    quickEntryMessage=parsed.messageEn+'\n'+parsed.messageAr;
    quickDraft=null;
    var modal=document.getElementById('modal-root');
    if(modal)modal.innerHTML='';
    render();
    return false;
  }
  quickDraft=parsed.draft;
  quickEntryMessage='';
  var live=document.getElementById('quick-entry-message');
  if(live)live.textContent='';
  quickEditDirection=parsed.draft.direction;
  quickEditCategory=parsed.draft.category;
  quickEditMerchant=parsed.draft.merchant;
  quickEditAmountText=api.formatAmountMajor(parsed.draft.amountMinor);
  paintQuickConfirm();
  return false;
}
function readQuickEdits(){
  var amountNode=document.getElementById('quick-confirm-amount');
  var merchantNode=document.getElementById('quick-confirm-merchant');
  var categoryNode=document.getElementById('quick-confirm-category');
  if(amountNode&&typeof amountNode.value==='string')quickEditAmountText=amountNode.value;
  if(merchantNode&&typeof merchantNode.value==='string')quickEditMerchant=merchantNode.value;
  if(categoryNode&&typeof categoryNode.value==='string'&&categoryNode.value)quickEditCategory=categoryNode.value;
}
function paintQuickConfirm(){
  fastOpen=false;
  var root=document.getElementById('modal-root');
  var api=quickEntryApi();
  if(!root||!quickDraft||!api)return;
  var cats=api.categoriesFor(quickEditDirection);
  if(cats.indexOf(quickEditCategory)<0)cats=cats.concat([quickEditCategory]);
  var options='',i;
  for(i=0;i<cats.length;i++)options+='<option'+(cats[i]===quickEditCategory?' selected':'')+'>'+h(cats[i])+'</option>';
  var dir=quickEditDirection;
  root.innerHTML='<div class="fast-scrim" onclick="if(event.target===this)quickEntryCancel()"><section class="fast-sheet" id="quick-confirm" role="dialog" aria-modal="true" aria-labelledby="quick-confirm-title"><div class="fast-head"><div><p class="eyebrow">CONFIRM</p><h3 id="quick-confirm-title">Check this entry</h3></div><button type="button" class="close" aria-label="Close confirm" onclick="quickEntryCancel()">'+icon('close',17)+'</button></div><p class="capture-hint">Today \u00b7 '+h(quickDraft.currency)+'. Nothing is saved until you confirm. \u0645\u0641\u064a\u0634 \u062d\u0627\u062c\u0629 \u0628\u062a\u062a\u0633\u062c\u0644 \u063a\u064a\u0631 \u0644\u0645\u0627 \u062a\u0623\u0643\u0651\u062f.</p><div class="fast-type" role="group" aria-label="Income or expense"><button type="button" class="'+(dir==='expense'?'selected out':'')+'" aria-pressed="'+(dir==='expense'?'true':'false')+'" onclick="quickEntrySetDirection(\'expense\')">Expense</button><button type="button" class="'+(dir==='income'?'selected':'')+'" aria-pressed="'+(dir==='income'?'true':'false')+'" onclick="quickEntrySetDirection(\'income\')">Income</button></div><label class="fast-field" for="quick-confirm-amount">Amount ('+h(quickDraft.currency)+')</label><input id="quick-confirm-amount" class="textinput" inputmode="decimal" autocomplete="off" value="'+h(quickEditAmountText)+'"><label class="fast-field" for="quick-confirm-merchant">Name</label><input id="quick-confirm-merchant" class="textinput" maxlength="90" autocomplete="off" value="'+h(quickEditMerchant)+'"><label class="fast-field" for="quick-confirm-category">Category</label><select id="quick-confirm-category" class="textinput">'+options+'</select><button type="button" class="fast-save" onclick="quickEntryConfirmSave()">Confirm and save</button><button type="button" class="secondary" style="width:100%;margin-top:8px" onclick="quickEntryCancel()">Back</button></section></div>';
}
function quickEntrySetDirection(dir){
  if(dir!=='income'&&dir!=='expense')return;
  readQuickEdits();
  quickEditDirection=dir;
  var api=quickEntryApi();
  var cats=api?api.categoriesFor(dir):[];
  if(cats.indexOf(quickEditCategory)<0)quickEditCategory=dir==='income'?'Other income':'Other';
  paintQuickConfirm();
}
function quickEntryCancel(){
  quickDraft=null;
  var root=document.getElementById('modal-root');
  if(root)root.innerHTML='';
}
function closeQuickEntry(){quickEntryCancel();}
function quickEntryTodayNoon(){
  var today=dateInputValue(Date.now());
  var when=new Date(today+'T12:00:00').getTime();
  return Number.isFinite(when)?when:Date.now();
}
function quickEntryConfirmSave(){
  var api=quickEntryApi();
  if(!quickDraft||!api){notify('Quick entry is still loading. Nothing was saved.');return;}
  readQuickEdits();
  var result=api.confirmQuickEntry(quickDraft,{
    amountText:quickEditAmountText,
    direction:quickEditDirection,
    category:quickEditCategory,
    merchant:quickEditMerchant,
    occurredAt:quickEntryTodayNoon(),
    reviewedAt:Date.now()
  });
  if(!result.ok){notify(result.messageEn+' '+result.messageAr);return;}
  var row=result.transaction;
  row.id='manual-'+Date.now()+'-'+Math.random().toString(36).slice(2,9);
  var before=state.transactions.slice();
  state.transactions.push(row);
  if(!persist()){state.transactions=before;notify('Could not save. Please check your device storage.');return;}
  quickDraft=null;
  quickEntryText='';
  quickEntryMessage='';
  var root=document.getElementById('modal-root');
  if(root)root.innerHTML='';
  render();
  notify('Transaction added');
}
