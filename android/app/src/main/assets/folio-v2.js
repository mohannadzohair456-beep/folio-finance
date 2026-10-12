(function v2Bootstrap(){
  'use strict';
  const $=id=>document.getElementById(id);
  const money=n=>fmt(Number(n)||0,state.currency);
  let stage=0, draft=null, dialogue=[], voiceLocale='en-US', showPrivacySheet=false, captureConsent=false;
  const amountText=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n);
  function numberValue(s){
    if(!s)return null;
    const text=String(s).trim().toLowerCase().replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)>=1776?c.charCodeAt(0)-1776:c.charCodeAt(0)-1632)).replace(/,/g,'');
    const m=text.match(/(\d+(?:\.\d+)?)\s*(thousand|million|k|m|ألف|الف|آلاف|مليون|ملايين)?(?=\b|\s|$)/);
    if(m){const v=Number(m[1])*(['million','m','مليون','ملايين'].includes(m[2])?1000000:['thousand','k','ألف','الف','آلاف'].includes(m[2])?1000:1);return Number.isFinite(v)&&v>=0&&v<=100000000?v:null;}
    const ones={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
    let total=0,group=0,found=false;
    for(const w of text.replace(/-/g,' ').split(/\s+/)){
      if(ones[w]!==undefined){group+=ones[w];found=true;}
      else if(w==='hundred'){group=(group||1)*100;found=true;}
      else if(w==='thousand'){total+=(group||1)*1000;group=0;found=true;}
      else if(w==='million'){total+=(group||1)*1000000;group=0;found=true;}
    }
    const result=total+group;return found&&result<=100000000?result:null;
  }
  function detectAmount(text){
    let t=String(text).toLowerCase().replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)>=1776?c.charCodeAt(0)-1776:c.charCodeAt(0)-1632)).replace(/(?:egp|egyptian pounds?|pounds?|جنيه|جنيهات|sar|riyal|usd|dollars?)/gi,' ');
    const amountRe=/(\d[\d,]*(?:\.\d+)?\s*(?:thousand|million|k|m|ألف|الف|آلاف|مليون|ملايين)?)/gi,matches=[];let amountHit;while((amountHit=amountRe.exec(t)))matches.push(amountHit);
    if(matches.length)return numberValue(matches[0][1]);
    const m=t.match(/(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million)(?:[\s-]+(?:and|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million))*/i);
    return m?numberValue(m[0]):null;
  }
  const moneyMinor=n=>Math.round(n*100);
  function estimatedBalance(){
    if(!Number.isFinite(state.reportedBalanceMinor)||!state.balanceReportedAt)return null;
    let delta=0;
    for(const t of state.transactions){if(t.currency!==state.currency||!Number.isFinite(Number(t.amountMinor))||Number(t.occurredAt)<state.balanceReportedAt)continue;
      delta+=(t.direction==='income'?1:t.direction==='expense'?-1:0)*Number(t.amountMinor);
    }
    return state.reportedBalanceMinor+delta;
  }
  function financeSummary(){
    const stats=txStats(monthTx());
    const planned=Number(state.monthlyBudgetMinor)||0;
    const remaining=planned>0?planned-stats.expense:null;
    const balance=estimatedBalance();
    return {stats,planned,remaining,balance};
  }
  function categoryFrom(s){
    const v=s.toLowerCase();
    if(/food|coffee|cafe|restaurant|grocer|lunch|dinner|breakfast|طعام|اكل|مطعم/.test(v))return 'Food & drinks';
    if(/uber|careem|taxi|fuel|transport|metro/.test(v))return 'Transport';
    if(/shopping|amazon|noon|clothes|store/.test(v))return 'Shopping';
    if(/rent|housing/.test(v))return 'Housing';
    if(/electric|internet|phone|bill/.test(v))return 'Bills & utilities';
    if(/doctor|pharmacy|hospital/.test(v))return 'Health';
    if(/subscription|netflix|spotify/.test(v))return 'Subscriptions';
    return 'Other';
  }
  function speechHint(){
    return 'Example: “I have 20,000 EGP in my bank account”, “My monthly budget is 5,000”, or “Can I afford 1,500?”';
  }
  function planCommand(input){
    const raw=String(input||'').trim(),s=raw.toLowerCase().replace(/\s+/g,' '),value=detectAmount(raw);
    if(!raw)return {answer:'Tell me about a balance, budget, salary, expense, or purchase.'};
    if(/can i afford|can i buy|should i spend|هل اقدر|هل أقدر|اقدر اشتري|أقدر أشتري|ينفع اشتري/.test(s)){
      if(value===null||value<=0)return {answer:'How much would this purchase cost? Please include an amount.'};
      const {balance,remaining}=financeSummary(),cost=moneyMinor(value);
      if(balance===null)return {answer:'To estimate affordability, first tell me your current available balance. I cannot see your bank account.'};
      const after=balance-cost;
      let answer=after<0?`Based on your reported balance, this purchase exceeds your estimated available money by ${money(-after)}.`:`Your estimated available balance after this purchase would be ${money(after)}.`;
      if(remaining!==null)answer+=` Your monthly spending budget would have ${money(remaining-cost)} remaining if you make it.`;
      answer+=' These are estimates, not confirmed bank balances. Include upcoming bills and an emergency reserve before deciding.';
      return {answer};
    }
    if(/(?:balance|in (?:my |the )?bank|i have|available money|معايا|رصيد)/.test(s)&&value!==null){
      return {answer:`I can record a ${money(moneyMinor(value))} balance snapshot. This is self-reported, not verified with your bank.`,action:{type:'balance',amountMinor:moneyMinor(value),title:'Record balance snapshot'}};
    }
    if(/salary|monthly income|earn per month|راتبي|مرتب|مرتبي/.test(s)&&value!==null){
      return {answer:`Set your expected monthly income to ${money(moneyMinor(value))}? This is a planning estimate and will not create an income transaction.`,action:{type:'incomePlan',amountMinor:moneyMinor(value),title:'Save expected monthly income'}};
    }
    const catMatch=s.match(/(?:budget for|budget on|limit for)\s+([a-z &]+?)\s+(?:is|of|to|at|=)/);
    if(catMatch&&value!==null){
      const cat=categoryFrom(catMatch[1]);
      return {answer:`Set ${cat} monthly budget to ${money(moneyMinor(value))}?`,action:{type:'categoryBudget',category:cat,amount:value,amountMinor:moneyMinor(value),title:'Set category budget'}};
    }
    if(/budget|spending limit|ميزانية|ميزانيتي/.test(s)&&value!==null){
      return {answer:`Set your overall monthly spending target to ${money(moneyMinor(value))}? This target is separate from your individual category budgets.`,action:{type:'budget',amountMinor:moneyMinor(value),title:'Set monthly budget'}};
    }
    if(/spent|paid|bought|purchased|expense|صرف|دفعت|اشتريت/.test(s)&&value!==null&&value>0){
      const merchantMatch=s.match(/(?:on|at|for)\s+([a-z][a-z0-9 &'-]{1,50})$/);
      const merchant=merchantMatch?merchantMatch[1].replace(/\b\w/g,c=>c.toUpperCase()):'Voice expense';
      return {answer:`Add a ${money(moneyMinor(value))} expense for ${merchant}? Review it before I save anything.`,action:{type:'expense',amountMinor:moneyMinor(value),merchant,category:categoryFrom(s),title:'Record expense'}};
    }
    if(/received|earned|income|got paid|استلمت|دخل/.test(s)&&value!==null&&value>0){
      return {answer:`Add ${money(moneyMinor(value))} as recorded income?`,action:{type:'income',amountMinor:moneyMinor(value),merchant:'Income',category:'Other income',title:'Record income'}};
    }
    if(/how am i doing|summary|my finances|what can i spend|how much left|budget left|monthly spending|وضع|صرفنا/.test(s)){
      const {stats,planned,remaining,balance}=financeSummary();
      let answer=`This month you recorded ${money(stats.income)} income and ${money(stats.expense)} spending (net cash flow ${money(stats.net)}).`;
      if(planned)answer+=` Your monthly budget target is ${money(planned)}, with ${money(remaining)} remaining against recorded expenses.`;
      if(balance!==null)answer+=` Your estimated available balance from your last snapshot is ${money(balance)}.`;
      if(!state.transactions.length)answer+=' No transactions have been recorded yet; I cannot give a complete picture.';
      return {answer};
    }
    return {answer:'I can track expenses, income, reported balances, monthly budgets and estimated affordability. '+speechHint()};
  }
  function message(text,kind='assistant'){
    dialogue.push({kind,text:String(text).slice(0,1200)});
    if(dialogue.length>20)dialogue=dialogue.slice(-20);
  }
  function assistantLedger(){
    const view=Object.assign({},state);
    const table=state.budgets&&state.budgets[state.currency];
    if(table&&typeof table==='object'&&!Array.isArray(table))view.categoryBudgetsMinor=Object.assign({},table);
    view.now=Date.now();
    const offsetMin=-new Date().getTimezoneOffset();
    const sign=offsetMin<0?'-':'+';
    const abs=Math.abs(offsetMin);
    view.timeZone=sign+String(Math.floor(abs/60)).padStart(2,'0')+':'+String(abs%60).padStart(2,'0');
    return view;
  }
  function submitText(){
    const el=$('folio-assistant-input');if(!el)return;
    const t=el.value.trim();if(!t)return;
    message(t,'user');
    const result=window.FolioAssistant?FolioAssistant.planCommand(t,assistantLedger()):planCommand(t);
    message(result.answer);
    draft=result.action||(result.proposal&&result.proposal.type==='savingsGoal'?result.proposal:null);
    render();
    const box=$('assistant-chat');if(box)box.scrollTop=box.scrollHeight;
  }
  function sendExample(t){const el=$('folio-assistant-input');if(el){el.value=t;submitText();}}
  function applyDraft(){
    if(!draft)return;
    const a=draft;draft=null;const timestamp=Date.now();
    if(a.type==='balance'){state.reportedBalanceMinor=a.amountMinor;state.balanceReportedAt=timestamp;}
    else if(a.type==='incomePlan')state.monthlyIncomeMinor=a.amountMinor;
    else if(a.type==='budget')state.monthlyBudgetMinor=a.amountMinor;
    else if(a.type==='categoryBudget'){const minor=Number.isFinite(Number(a.amountMinor))?Math.round(Number(a.amountMinor)):Math.round(Number(a.amount)*100);currentBudgets()[a.category]=minor;}
    else if(a.type==='expense'||a.type==='income'){
      state.transactions.push({id:'assistant-'+timestamp+'-'+Math.random().toString(36).slice(2,7),amountMinor:a.amountMinor,currency:a.currency||state.currency,direction:a.type,merchant:a.merchant,category:a.category,occurredAt:timestamp,source:'assistant'});
    }
    else if(a.type==='savingsGoal'){
      const minor=Math.round(Number(a.amountMinor));
      if(!Number.isSafeInteger(minor)||minor<0||minor>10000000000){message('That savings goal is not a valid amount.');render();return;}
      state.savingsGoalMinor=minor;
      state.savingsGoalCurrency=a.currency||state.currency;
      if(a.category)state.savingsGoalCategory=a.category;
      else delete state.savingsGoalCategory;
    }
    else{message('That change is not something Folio can save.');render();return;}
    if(persist())message('Saved. You can review and edit this information in your financial workspace.');
    render();
  }
  function cancelDraft(){draft=null;message('No changes made.');render();}
  function chooseLocale(locale){voiceLocale=locale;render();}
  function requestVoice(){
    showPrivacySheet=true;render();
  }
  function closeSheet(){showPrivacySheet=false;render();}
  function beginVoice(){
    showPrivacySheet=false;
    render();
    if(!native()||typeof FolioNative.startVoiceRecognition!=='function'){message('Voice input requires the installed Android app and a compatible speech recognition provider. You can type instead.');render();return;}
    try{FolioNative.startVoiceRecognition(voiceLocale);}
    catch(e){message('Speech recognition is unavailable. Please type your request.');render();}
  }
  function onVoiceResult(text,error){
    if(error){message(error);render();return;}
    const input=$('folio-assistant-input');
    if(page!=='assistant')page='assistant';
    render();
    const target=$('folio-assistant-input');if(target){target.value=String(text||'').slice(0,500);target.focus();}
  }
  function onNav(name){page=name;render();}
  function markReady(){state.v2Onboarded=true;persist();stage=0;render();}
  function onboardingField(id,label,placeholder,value){
    return `<label class="v2-field"><span>${label}</span><input id="${id}" type="number" inputmode="decimal" min="0" step="0.01" placeholder="${placeholder}" value="${value||''}"></label>`;
  }
  function captureOnboardFields(){
    if(stage!==1)return true;
    for(const [id,key] of [['onb-balance','reportedBalanceMinor'],['onb-income','monthlyIncomeMinor'],['onb-budget','monthlyBudgetMinor']]){
      const el=$(id),raw=(el&&el.value.trim())||'';
      if(!raw)continue;
      const amount=Number(raw);if(!Number.isFinite(amount)||amount<0||amount>100000000){if(el)el.focus();return false;}
      state[key]=moneyMinor(amount);
      if(key==='reportedBalanceMinor')state.balanceReportedAt=Date.now();
    }
    persist();return true;
  }
  function nextStep(){if(!captureOnboardFields())return;stage=Math.min(3,stage+1);render();}
  function previousStep(){stage=Math.max(0,stage-1);render();}
  function optInCapture(){
    if(!state.capture){state.capture=true;if(native())try{FolioNative.setCaptureEnabled(true);}catch(e){}persist();}
    permissionExplained=true;
    if(native())try{FolioNative.openNotificationSettings();}catch(e){}
    render();
  }
  let permissionExplained=false;
  function explainAccess(){showPrivacySheet=true;render();}
  function onbHtml(){
    const parts=[
      {eyebrow:'YOUR MONEY, SIMPLIFIED',title:'Meet Folio.',desc:'A calmer, smarter way to understand your money and plan the month ahead.',symbol:'◈'},
      {eyebrow:'YOUR FINANCIAL STARTING POINT',title:'Make it yours.',desc:'Enter what you know today. You can change these numbers at any time.',symbol:'◎'},
      {eyebrow:'PRIVACY BY DESIGN',title:'Capture only what you allow.',desc:'Enable optional notification tracking. Folio never needs your banking password.',symbol:'◉'},
      {eyebrow:'READY WHEN YOU ARE',title:'Your financial space is ready.',desc:'Track expenses, set goals, and talk to Folio about everyday decisions.',symbol:'✦'}
    ];
    const d=parts[stage];const isPhone=native();
    return `<div class="v2-onboard"><div class="v2-onboard-inner">
      <header class="v2-onboard-top"><div class="v2-wordmark"><span>◈</span> folio<span>.</span></div><span class="v2-step-label">${stage+1} OF 4</span></header>
      <div class="v2-progress">${[0,1,2,3].map(i=>`<span class="${i<=stage?'current':''}"></span>`).join('')}</div>
      <div class="v2-onboard-hero"><div class="v2-orbit"><div class="v2-orbit-inner">${d.symbol}</div></div><p class="v2-eyebrow">${d.eyebrow}</p><h1>${d.title}</h1><p>${d.desc}</p></div>
      ${stage===0?`<div class="v2-benefits"><div><span>01</span><strong>See the bigger picture</strong><small>Cash flow, budgets, spending habits</small></div><div><span>02</span><strong>Stay in control</strong><small>On-device transaction history</small></div><div><span>03</span><strong>Ask Folio</strong><small>Simple financial guidance, in your words</small></div></div>`:''}
      ${stage===1?`<div class="v2-onboard-form">
        ${onboardingField('onb-balance','Current available balance (EGP)','e.g. 20000',state.reportedBalanceMinor?state.reportedBalanceMinor/100:'')}
        ${onboardingField('onb-income','Expected monthly income (EGP)','e.g. 15000',state.monthlyIncomeMinor?state.monthlyIncomeMinor/100:'')}
        ${onboardingField('onb-budget','Overall monthly spending target (EGP)','e.g. 5000',state.monthlyBudgetMinor?state.monthlyBudgetMinor/100:'')}
        <p>All values are optional. Your balance is a manual snapshot, not a bank connection.</p></div>`:''}
      ${stage===2?`<div class="v2-onboard-permission">
        <div class="v2-permission-title"><span>✦</span><div><strong>Financial notification recognition</strong><small>Optional · Android access</small></div></div>
        <p>When enabled, Folio reads notifications from approved apps on your device to detect payments and transfers. No raw notification messages are saved.</p>
        <div class="v2-permission-status"><span>${permissionStatus?'✓ Permission granted':'○ Permission not granted'}</span><span>${state.capture?'Monitoring enabled':'Monitoring off'}</span></div>
        <button class="v2-outline" type="button" onclick="FolioV2.optInCapture()">${permissionStatus?'Manage notification access':isPhone?'Continue to Android settings':'Available on Android only'}</button>
        <p class="v2-private-note">Android displays its own permission screen; Folio cannot replace it. Granting access is optional. You can turn it on later in Settings.</p>
      </div>`:''}
      ${stage===3?`<div class="v2-finish">
        <div><span>✓</span><strong>Private financial workspace</strong><small>Your records remain on this device.</small></div>
        <div><span>✓</span><strong>Folio Assistant</strong><small>Type or dictate finance updates for review.</small></div>
        <div><span>${permissionStatus?'✓':'○'}</span><strong>Automatic tracking</strong><small>${permissionStatus&&state.capture?'Enabled':'Optional — configure later in Settings'}</small></div>
      </div>`:''}
      <footer class="v2-onboard-footer"><div class="v2-action-line">${stage>0?`<button class="v2-back" onclick="FolioV2.previousStep()">Back</button>`:'<span></span>'}<button class="v2-next" onclick="FolioV2.${stage===3?'markReady()':'nextStep()'}">${stage===3?'Open Folio':'Continue'} <span>→</span></button></div><p>Private by default · No subscription required</p></footer>
    </div></div>`;
  }
  function assistantPage(){
    const stats=financeSummary();
    const goalLine=Number.isFinite(Number(state.savingsGoalMinor))?`<p class="v2-disclaimer">Savings goal: ${money(state.savingsGoalMinor)}${state.savingsGoalCategory?' for '+h(state.savingsGoalCategory):''}. This does not move money.</p>`:'';
    const snapshots=`<div class="v2-snapshots"><div><span>Available estimate</span><strong>${stats.balance===null?'Not set':money(stats.balance)}</strong></div><div><span>Monthly budget left</span><strong>${stats.remaining===null?'Not set':money(stats.remaining)}</strong></div><div><span>Expected income</span><strong>${state.monthlyIncomeMinor?money(state.monthlyIncomeMinor):'Not set'}</strong></div></div>${goalLine}`;
    const chat=`<div class="v2-chat" id="assistant-chat" role="log" aria-live="polite">${dialogue.length?dialogue.map(m=>`<div class="v2-bubble ${m.kind==='user'?'mine':'folio'}">${h(m.text)}</div>`).join(''):`<div class="v2-bubble folio">Hi! I'm Folio, your local financial planning assistant. ${h(speechHint())}</div>`}</div>`;
    return `${heading('FINANCIAL COMPANION','Ask Folio','Simple, transparent planning. You approve every change to your records.')}
      <div class="v2-assistant">${snapshots}
      <div class="v2-chat-shell">${chat}
      ${draft?`<div class="v2-action-review"><span>REVIEW BEFORE SAVING</span><strong>${h(draft.title)}</strong><div class="v2-action-line"><button onclick="FolioV2.cancelDraft()" class="v2-outline">Cancel</button><button onclick="FolioV2.applyDraft()" class="v2-next">Confirm & save</button></div></div>`:''}
      <div class="v2-compose"><textarea id="folio-assistant-input" rows="2" maxlength="500" placeholder="Ask about your money, or record a transaction..." aria-label="Message Folio"></textarea><div class="v2-compose-bottom"><div><button class="v2-mic" onclick="FolioV2.requestVoice()" title="Voice to text" aria-label="Voice to text">🎙 Voice</button><button class="v2-locale ${voiceLocale==='en-US'?'sel':''}" onclick="FolioV2.chooseLocale('en-US')">EN</button><button class="v2-locale ${voiceLocale==='ar-EG'?'sel':''}" onclick="FolioV2.chooseLocale('ar-EG')">AR</button></div><button class="v2-next" onclick="FolioV2.submitText()">Send ↗</button></div></div></div>
      <div class="v2-example-row"><button onclick="FolioV2.sendExample('I have 20000 in my bank')">Set my balance</button><button onclick="FolioV2.sendExample('My monthly budget is 5000')">Set a budget</button><button onclick="FolioV2.sendExample('How am I doing?')">Monthly overview</button><button onclick="FolioV2.sendExample('Can I afford 1500?')">Can I afford it?</button></div>
      <p class="v2-disclaimer">Folio's current assistant uses local rules, not a cloud AI model. Its calculations rely on your recorded data and may be incomplete. Verify balances and upcoming commitments before spending.</p></div>`;
  }
  function privacySheet(){
    return `<div class="v2-scrim" role="presentation"><section role="dialog" aria-modal="true" class="v2-privacy-sheet" aria-label="Speech input information">
    <button class="v2-close" aria-label="Close" onclick="FolioV2.closeSheet()">×</button>
    <span class="v2-eyebrow">VOICE INPUT</span><h2>Talk to Folio</h2><p>Android's speech recognition provider converts your voice into text. Depending on your device, audio may be processed online by that provider. Folio doesn't store the audio recording.</p>
    <p>Review the transcript and approve each proposed financial change before it is saved.</p>
    <button class="v2-next" onclick="FolioV2.beginVoice()">Continue with voice →</button><button class="v2-back" onclick="FolioV2.closeSheet()">Not now</button></section></div>`;
  }
  function render(){
    const root=$('root');if(!root)return;
    if(native() && typeof FolioNative.setDarkChrome==='function') FolioNative.setDarkChrome(!state.v2Onboarded);
    if(!state.v2Onboarded){root.innerHTML=onbHtml();document.body.classList.add('v2-onboarding');}
    else{document.body.classList.remove('v2-onboarding');root.innerHTML=shell(page==='assistant'?assistantPage():({overview,transactions,insights,budgets,settings})[page]());}
    let existing=$('v2-overlay');if(existing)existing.remove();
    if(showPrivacySheet){const overlay=document.createElement('div');overlay.id='v2-overlay';overlay.innerHTML=privacySheet();document.body.appendChild(overlay);}
  }
  // Upgrade old workspaces without changing historical transaction records or capture preferences.
  state.v2Onboarded=state.v2Onboarded===true;
  state.monthlyBudgetMinor=Number(state.monthlyBudgetMinor)||0;
  state.monthlyIncomeMinor=Number(state.monthlyIncomeMinor)||0;
  if(!Number.isFinite(state.reportedBalanceMinor))state.reportedBalanceMinor=null;
  if(!Number.isFinite(state.balanceReportedAt))state.balanceReportedAt=null;
  window.FolioV2={render,onbHtml,assistantPage,submitText,sendExample,planCommand,detectAmount,numberValue,applyDraft,cancelDraft,nextStep,previousStep,markReady,optInCapture,requestVoice,closeSheet,beginVoice,onVoiceResult,chooseLocale,explainAccess,estimatedBalance,financeSummary};
  window.folioGoHome=()=>{if(!state.v2Onboarded){previousStep();return;}onNav('overview');};
  render();
})();
