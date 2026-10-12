/**
 * Ask Folio — deterministic on-device assistant engine.
 *
 * Drop-in superset of FolioV2.planCommand / detectAmount / numberValue.
 * No network, no clock reads, no mutation of the caller's state.
 *
 * Swap guide: docs/architecture/assistant-architecture.md
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined' && root) root.FolioAssistant = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_CHARS = 500;
  var MAX_MAJOR = 100000000;
  var MAX_MINOR = MAX_MAJOR * 100;
  var INTENTS = [
    'set_balance', 'set_salary', 'set_budget', 'add_expense', 'add_income',
    'savings_goal', 'can_afford', 'safe_to_spend', 'category_spend',
    'month_end_projection', 'unknown'
  ];
  var WRITES = {
    set_balance: 1, set_salary: 1, set_budget: 1,
    add_expense: 1, add_income: 1, savings_goal: 1
  };
  var LEDGER = { EGP: 1, SAR: 1, USD: 1, AED: 1, EUR: 1, GBP: 1 };
  var MULT = {
    k: 1000, thousand: 1000, thousands: 1000,
    m: 1000000, million: 1000000, millions: 1000000,
    'الف': 1000, 'الاف': 1000, 'تلاف': 1000,
    'مليون': 1000000, 'ملايين': 1000000
  };
  var CURRENCY_TOKEN = {
    egp: 'EGP', le: 'EGP', pound: 'EGP', pounds: 'EGP',
    'جنيه': 'EGP', 'جنيهات': 'EGP', 'جنيها': 'EGP',
    usd: 'USD', dollar: 'USD', dollars: 'USD', bucks: 'USD',
    'دولار': 'USD', 'دولارات': 'USD',
    sar: 'SAR', riyal: 'SAR', riyals: 'SAR', 'ريال': 'SAR', 'ريالات': 'SAR'
  };
  var FILLERS = {
    um: 1, uh: 1, er: 1, ah: 1, hmm: 1, hm: 1, like: 1, please: 1, kindly: 1,
    basically: 1, actually: 1, just: 1, hey: 1, hi: 1, hello: 1, folio: 1,
    okay: 1, ok: 1, well: 1, so: 1, yeah: 1, yep: 1, alright: 1,
    'يعني': 1, 'بقى': 1, 'كده': 1, 'اه': 1, 'يا': 1
  };
  var ONES = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
    seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90
  };
  var AR_ONES = {
    'صفر': 0, 'واحد': 1, 'واحده': 1,
    'اتنين': 2, 'اثنين': 2,
    'تلاته': 3, 'ثلاثه': 3, 'تلات': 3, 'ثلاث': 3,
    'اربعه': 4, 'اربع': 4,
    'خمسه': 5, 'خمس': 5,
    'سته': 6, 'ست': 6,
    'سبعه': 7, 'سبع': 7,
    'تمانيه': 8, 'ثمانيه': 8, 'تمن': 8, 'ثمن': 8,
    'تسعه': 9, 'تسع': 9,
    'عشره': 10, 'عشر': 10,
    'حداشر': 11, 'اتناشر': 12, 'تلتاشر': 13, 'ثلتاشر': 13, 'اربعاتاشر': 14, 'اربعتاشر': 14,
    'خمستاشر': 15, 'ستاشر': 16, 'سبعتاشر': 17, 'تمنتاشر': 18, 'ثمنتاشر': 18, 'تسعتاشر': 19
  };
  var AR_TENS = {
    'عشرين': 20, 'تلاتين': 30, 'ثلاثين': 30, 'اربعين': 40, 'خمسين': 50,
    'ستين': 60, 'سبعين': 70, 'تمانين': 80, 'ثمانين': 80, 'تسعين': 90
  };
  var SPEND_CATS = [
    ['Food & drinks', /\b(food|coffee|cafe|restaurant|grocer\w*|lunch|dinner|breakfast|snack)\b/, ['طعام', 'اكل', 'مطعم', 'قهوه', 'سوبرماركت', 'بقاله', 'فطار']],
    ['Transport', /\b(uber|careem|taxi|fuel|transport|metro|gas|petrol)\b/, ['مواصلات', 'اوبر', 'كريم', 'تاكسي', 'مترو', 'بنزين']],
    ['Shopping', /\b(shopping|amazon|noon|clothes|store)\b/, ['تسوق', 'ملابس', 'امازون']],
    ['Housing', /\b(rent|housing|apartment)\b/, ['ايجار', 'سكن']],
    ['Bills & utilities', /\b(electric\w*|internet|phone|bills?|utilities|vodafone)\b/, ['كهربا', 'فاتوره', 'فواتير', 'موبايل', 'انترنت']],
    ['Health', /\b(doctor|pharmacy|hospital|medicine)\b/, ['دكتور', 'صيدليه', 'مستشفي', 'دواء']],
    ['Subscriptions', /\b(subscription|netflix|spotify)\b/, ['اشتراك', 'نتفليكس']],
    ['Entertainment', /\b(entertainment|cinema|movie|games?)\b/, ['سينما', 'فيلم']],
    ['Education', /\b(education|school|tuition|course)\b/, ['مدرسه', 'كورس', 'تعليم']]
  ];

  function isArChar(ch) {
    return !!ch && ch >= '\u0600' && ch <= '\u06FF';
  }

  function hasAr(text, stem) {
    var from = 0;
    while (from < text.length) {
      var i = text.indexOf(stem, from);
      if (i < 0) return false;
      var beforeOk = i === 0 || !isArChar(text.charAt(i - 1)) || (i >= 2 && text.slice(i - 2, i) === 'ال');
      var after = text.slice(i + stem.length);
      var afterOk = !after || !isArChar(after.charAt(0)) || /^(ي|ك|ه|نا|كم|ها|هم)(?:[^\u0600-\u06FF]|$)/.test(after);
      if (beforeOk && afterOk) return true;
      from = i + 1;
    }
    return false;
  }

  function pow10(n) {
    var p = 1n;
    var i;
    for (i = 0; i < n; i++) p *= 10n;
    return p;
  }

  function toMinor(intStr, fracStr, multiplier) {
    if (!/^\d+$/.test(intStr)) return null;
    var frac = fracStr || '';
    if (frac && !/^\d+$/.test(frac)) return null;
    if (frac.length > 6) return null;
    try {
      var scale = pow10(frac.length);
      var base = BigInt(intStr) * scale + (frac ? BigInt(frac) : 0n);
      var num = base * BigInt(multiplier) * 100n;
      if (scale === 0n || num % scale !== 0n) return null;
      var minor = num / scale;
      if (minor < 0n || minor > BigInt(MAX_MINOR)) return null;
      return Number(minor);
    } catch (err) {
      return null;
    }
  }

  function toMinorHalf(intStr, multiplier) {
    if (!/^\d+$/.test(intStr)) return null;
    try {
      var minor = (BigInt(intStr) * 2n + 1n) * BigInt(multiplier) * 50n;
      if (minor < 0n || minor > BigInt(MAX_MINOR)) return null;
      return Number(minor);
    } catch (err) {
      return null;
    }
  }

  function clean(input) {
    var warnings = [];
    var noisy = false;
    if (input == null) return { tokens: [], noisy: false, warnings: warnings };
    var text = String(input);
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS);
      warnings.push('truncated');
    }
    if (typeof text.normalize === 'function') text = text.normalize('NFKC');
    text = text.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ');
    text = text.replace(/[\u064B-\u065F\u0670\u0640]/g, '');
    text = text.replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
    text = text.toLowerCase();
    text = text.replace(/([a-z])['’]([a-z])/g, '$1$2');
    text = text.replace(/[\u0660-\u0669]/g, function (ch) { return String(ch.charCodeAt(0) - 0x0660); });
    text = text.replace(/[\u06F0-\u06F9]/g, function (ch) { return String(ch.charCodeAt(0) - 0x06F0); });
    text = text.replace(/(\d)[,\u060C\u066C](?=\d{3}(?!\d))/g, '$1');
    text = text.replace(/\u066B/g, '.');
    if (/\be\s+g\s+p\b/.test(text) || /\bu\s+s\s+d\b/.test(text) || /\bs\s+a\s+r\b/.test(text)) noisy = true;
    text = text.replace(/\be\s+g\s+p\b/g, ' egp ');
    text = text.replace(/\bu\s+s\s+d\b/g, ' usd ');
    text = text.replace(/\bs\s+a\s+r\b/g, ' sar ');
    if (/\bl\s*\.\s*e\b/.test(text) || /ج\s*\.\s*م/.test(text)) noisy = true;
    text = text.replace(/\bl\s*\.\s*e\.?/g, ' le ');
    text = text.replace(/ج\s*\.\s*م/g, ' جنيه ');
    if (/(\d)\s+(?:point|dot|نقطه)\s+(\d)/.test(text)) noisy = true;
    text = text.replace(/(\d)\s+(?:point|dot|نقطه)\s+(\d+)/g, '$1.$2');
    text = text.replace(/\$/g, ' usd ');
    text = text.replace(/(\d)\.(\d)/g, '$1<dec>$2');
    text = text.replace(/[.,!?;:()[\]{}"'`~…؟،؛]/g, ' ');
    text = text.replace(/(\d)<dec>(\d)/g, '$1.$2');
    var folded = text;
    text = text.replace(/\byou know\b/g, ' ').replace(/\bkind of\b/g, ' ').replace(/\bsort of\b/g, ' ');
    text = text.replace(/لو سمحت/g, ' ').replace(/من فضلك/g, ' ').replace(/يا فوليو/g, ' ');
    if (text !== folded) noisy = true;
    var rawParts = text.split(/\s+/);
    var tokens = [];
    var i;
    for (i = 0; i < rawParts.length; i++) {
      var tok = rawParts[i];
      if (!tok) continue;
      if (/^(?:um+|uh+|ah+|er+|hmm+|mmm+|اا+|اه+|مم+)$/.test(tok)) { noisy = true; continue; }
      if (FILLERS[tok]) { noisy = true; continue; }
      if (tok === 'kay') { noisy = true; tok = 'k'; }
      else if (tok === 'grand') { noisy = true; tok = 'thousand'; }
      tokens.push(tok);
    }
    var collapsed = [];
    for (i = 0; i < tokens.length; i++) {
      if (collapsed.length && collapsed[collapsed.length - 1] === tokens[i]) { noisy = true; continue; }
      collapsed.push(tokens[i]);
    }
    var joined = [];
    for (i = 0; i < collapsed.length; i++) {
      if (collapsed[i] === 'ال' && i + 1 < collapsed.length && isArChar(collapsed[i + 1].charAt(0))) {
        noisy = true;
        joined.push('ال' + collapsed[i + 1]);
        i++;
      } else joined.push(collapsed[i]);
    }
    return { tokens: joined, noisy: noisy, warnings: warnings };
  }

  function splitCurrency(tokens) {
    var currencies = [];
    var rest = [];
    var i;
    for (i = 0; i < tokens.length; i++) {
      var code = CURRENCY_TOKEN[tokens[i]];
      if (code) {
        if (currencies.indexOf(code) < 0) currencies.push(code);
      } else rest.push(tokens[i]);
    }
    return { currencies: currencies, tokens: rest };
  }

  function parseEnglish(tokens, start) {
    var head = tokens[start];
    if (head === 'a') {
      var nxt = tokens[start + 1];
      if (nxt !== 'hundred' && nxt !== 'thousand' && nxt !== 'million') return null;
    } else if (head !== 'hundred' && head !== 'thousand' && head !== 'million' && ONES[head] == null) {
      return null;
    }
    var total = 0;
    var group = 0;
    var found = false;
    var j = start;
    while (j < tokens.length) {
      var w = tokens[j];
      if (w === 'and') { j++; continue; }
      if (w === 'a' && (tokens[j + 1] === 'hundred' || tokens[j + 1] === 'thousand' || tokens[j + 1] === 'million')) {
        group += 1;
        found = true;
        j++;
        continue;
      }
      if (ONES[w] != null) { group += ONES[w]; found = true; j++; continue; }
      if (w === 'hundred') { group = (group || 1) * 100; found = true; j++; continue; }
      if (w === 'thousand') { total += (group || 1) * 1000; group = 0; found = true; j++; continue; }
      if (w === 'million') { total += (group || 1) * 1000000; group = 0; found = true; j++; continue; }
      break;
    }
    if (!found) return null;
    var major = total + group;
    if (major > MAX_MAJOR) return null;
    return { minor: toMinor(String(major), '', 1), next: j };
  }

  function parseArabic(tokens, start) {
    var head = tokens[start];
    if (head === 'الفين') {
      var dual = toMinor('2000', '', 1);
      return dual == null ? null : { minor: dual, next: start + 1 };
    }
    if (head === 'مليونين') {
      var md = toMinor('2000000', '', 1);
      return md == null ? null : { minor: md, next: start + 1 };
    }
    var starter = AR_ONES[head] != null || AR_TENS[head] != null || head === 'ميه' || head === 'مائه' ||
      head === 'الف' || head === 'الاف' || head === 'تلاف' || head === 'مليون' || head === 'ملايين';
    if (!starter) return null;
    var total = 0;
    var group = 0;
    var found = false;
    var j = start;
    while (j < tokens.length) {
      var w = tokens[j];
      if (w === 'و' || w === 'and') { j++; continue; }
      if (AR_ONES[w] != null) { group += AR_ONES[w]; found = true; j++; continue; }
      if (AR_TENS[w] != null) { group += AR_TENS[w]; found = true; j++; continue; }
      if (w === 'ميه' || w === 'مائه') { group = (group || 1) * 100; found = true; j++; continue; }
      if (w === 'الف' || w === 'الاف' || w === 'تلاف') {
        total += (group || 1) * 1000;
        group = 0;
        found = true;
        j++;
        continue;
      }
      if (w === 'مليون' || w === 'ملايين') {
        total += (group || 1) * 1000000;
        group = 0;
        found = true;
        j++;
        continue;
      }
      break;
    }
    if (!found) return null;
    var major = total + group;
    if (major > MAX_MAJOR) return null;
    var minor = toMinor(String(major), '', 1);
    if (minor == null) return null;
    return { minor: minor, next: j };
  }

  function extractAmounts(tokens) {
    var used = [];
    var minors = [];
    var bad = false;
    var i;
    for (i = 0; i < tokens.length; i++) used.push(false);

    function push(minor) {
      if (minor == null) bad = true;
      else minors.push(minor);
    }

    for (i = 0; i < tokens.length; i++) {
      if (used[i]) continue;
      var tok = tokens[i];
      if (/^\d+(?:\.\d+)?km$/i.test(tok)) { bad = true; used[i] = true; continue; }
      var attached = tok.match(/^(\d+)(?:\.(\d+))?([km])$/i);
      if (attached) {
        used[i] = true;
        push(toMinor(attached[1], attached[2], attached[3].toLowerCase() === 'm' ? 1000000 : 1000));
        continue;
      }
      var plain = tok.match(/^(\d+)(?:\.(\d+))?$/);
      if (!plain) continue;
      used[i] = true;
      var intStr = plain[1];
      var frac = plain[2] || '';
      var j = i;
      if (!frac) {
        while (j + 1 < tokens.length && /^\d{3}$/.test(tokens[j + 1])) {
          j++;
          used[j] = true;
          intStr += tokens[j];
        }
      }
      var half = false;
      if (!frac && tokens[j + 1] === 'and' && tokens[j + 2] === 'a' && tokens[j + 3] === 'half') {
        half = true;
        used[j + 1] = true;
        used[j + 2] = true;
        used[j + 3] = true;
        j += 3;
      }
      var mult = 1;
      if (j + 1 < tokens.length && MULT[tokens[j + 1]] != null) {
        mult = MULT[tokens[j + 1]];
        used[j + 1] = true;
      }
      push(half ? toMinorHalf(intStr, mult) : toMinor(intStr, frac, mult));
    }

    for (i = 0; i < tokens.length; i++) {
      if (used[i]) continue;
      var parsed = isArChar(tokens[i].charAt(0)) ? parseArabic(tokens, i) : parseEnglish(tokens, i);
      if (!parsed) continue;
      var k;
      var overlap = false;
      for (k = i; k < parsed.next; k++) if (used[k]) overlap = true;
      if (overlap || parsed.minor == null) { bad = true; continue; }
      for (k = i; k < parsed.next; k++) used[k] = true;
      minors.push(parsed.minor);
      i = parsed.next - 1;
    }

    for (i = 0; i < tokens.length; i++) {
      if (!used[i] && /\d/.test(tokens[i])) bad = true;
    }
    return { minors: minors, bad: bad };
  }

  function prepare(input) {
    var cleaned = clean(input);
    var split = splitCurrency(cleaned.tokens);
    var amounts = extractAmounts(split.tokens);
    return {
      text: split.tokens.join(' '),
      currencies: split.currencies,
      amounts: amounts,
      noisy: cleaned.noisy,
      warnings: cleaned.warnings.slice()
    };
  }

  function spendCategories(text) {
    var hits = [];
    var i;
    var s;
    for (i = 0; i < SPEND_CATS.length; i++) {
      var name = SPEND_CATS[i][0];
      var en = SPEND_CATS[i][1];
      var ar = SPEND_CATS[i][2];
      var matched = en.test(text);
      if (!matched) {
        for (s = 0; s < ar.length; s++) if (hasAr(text, ar[s])) { matched = true; break; }
      }
      if (matched) hits.push(name);
    }
    return hits;
  }

  function isProjection(text) {
    return /\b(month end|end of (?:the )?month|forecast|projection)\b/.test(text) ||
      /\bproject my\b/.test(text) ||
      hasAr(text, 'اخر الشهر') || hasAr(text, 'نهايه الشهر') || hasAr(text, 'هخلص الشهر') || hasAr(text, 'توقع');
  }

  function isAfford(text, count) {
    if (/\b(can i afford|could i afford|can i buy|could i buy|should i buy|should i spend)\b/.test(text)) return true;
    if (hasAr(text, 'اقدر اشتري') || hasAr(text, 'ينفع اشتري') || hasAr(text, 'اقدر على') || hasAr(text, 'هل يكفي') || hasAr(text, 'لو اشتريت')) return true;
    if (/\b(can|could) i spend\b/.test(text) && count >= 1 && !/\bhow much\b/.test(text)) return true;
    return false;
  }

  function isSafe(text, count) {
    if (/\b(safe to spend|safely spend|how much (?:can|could) i spend|what can i spend|how much (?:is |do i have )?left|budget left|left to spend|money left)\b/.test(text)) return true;
    if (hasAr(text, 'اقدر اصرف') || hasAr(text, 'المتاح للصرف') || hasAr(text, 'الامن للصرف')) return true;
    if (/\b(can|could) i spend\b/.test(text) && count === 0) return true;
    return false;
  }

  function isCategoryQuestion(text, count) {
    if (count > 0) return false;
    if (/\bhow much (?:did|have) i spend\b/.test(text) || /\bwhat did i spend\b/.test(text) || /\bspending on\b/.test(text) || /\bexpenses on\b/.test(text) || /\bmonthly spending\b/.test(text)) return true;
    if (hasAr(text, 'صرفت كام') || hasAr(text, 'كام صرفت') || hasAr(text, 'مصروفات') || hasAr(text, 'مصروف')) return true;
    return false;
  }

  function isSavings(text) {
    if (/\bhow much (?:should|can|could) i save\b/.test(text)) return false;
    return /\b(savings goal|saving goal|emergency fund|save up|put aside)\b/.test(text) ||
      /\b(?:want|wanna|need|plan) to save\b/.test(text) ||
      /\bsave\b/.test(text) ||
      hasAr(text, 'اوفر') || hasAr(text, 'ادخار') || hasAr(text, 'توفير');
  }

  function isBudget(text) {
    return /\b(budget|spending limit|spend limit|limit for)\b/.test(text) ||
      hasAr(text, 'ميزانيه') || hasAr(text, 'ميزانيت') || hasAr(text, 'حد الصرف') || hasAr(text, 'سقف الصرف');
  }

  function isSalary(text) {
    if (/\b(salary|paycheck|monthly income|expected income|income per month)\b/.test(text)) return true;
    if (/\bearn(?:ed|s)?\b/.test(text) && /\b(?:a|per|each)\s+month\b/.test(text)) return true;
    if (hasAr(text, 'مرتب') || hasAr(text, 'راتب') || hasAr(text, 'دخل شهري') || hasAr(text, 'بقبض')) return true;
    return false;
  }

  function isReceived(text) {
    return /\b(received|got paid|was paid|get paid)\b/.test(text) ||
      hasAr(text, 'استلمت') || hasAr(text, 'قبضت') || hasAr(text, 'جالي') || hasAr(text, 'نزل');
  }

  function isIncome(text) {
    if (isReceived(text)) return true;
    if (isSalary(text)) return false;
    if (/\bmy income is\b/.test(text) || /\bincome of\b/.test(text) || /\badd income\b/.test(text)) return true;
    if (/\bearned\b/.test(text) && !/\bearned\s+(?:a|per|each)\s+month\b/.test(text)) return true;
    if (/\b(freelance|bonus|gift|refund)\b/.test(text)) return true;
    if (hasAr(text, 'مكافاه') || hasAr(text, 'هديه') || hasAr(text, 'مرتجع') || hasAr(text, 'عمل حر')) return true;
    return false;
  }

  function isExpense(text) {
    if (/\bgot paid\b|\bwas paid\b|\bget paid\b/.test(text)) {
      return /\b(spent|bought|purchased)\b/.test(text) || hasAr(text, 'صرفت') || hasAr(text, 'اشتريت') || hasAr(text, 'دفعت');
    }
    return /\b(spent|bought|purchased)\b/.test(text) || /\bpaid\b/.test(text) ||
      hasAr(text, 'صرفت') || hasAr(text, 'اشتريت') || hasAr(text, 'دفعت');
  }

  function isBalance(text) {
    return /\b(balance|bank account|in my bank|in the bank)\b/.test(text) ||
      hasAr(text, 'رصيد') || hasAr(text, 'في البنك') || hasAr(text, 'في حسابي') ||
      hasAr(text, 'معايا') || hasAr(text, 'معاي');
  }

  function isDestructive(text) {
    return /\b(delete|remove|undo|erase)\b/.test(text) || hasAr(text, 'احذف') || hasAr(text, 'امسح');
  }

  function isRead(text) {
    if (/\b(what is|whats)\b/.test(text) && /\b(balance|salary|budget|income)\b/.test(text)) return true;
    if (/\b(show|display|tell me)\b/.test(text) && /\bmy (balance|salary|budget|income)\b/.test(text)) return true;
    if (hasAr(text, 'ما هو الرصيد') || hasAr(text, 'ايه رصيد') || hasAr(text, 'كام رصيد') || hasAr(text, 'ما هي الميزانيه')) return true;
    return false;
  }

  function detectIntent(text, count) {
    if (!text || isDestructive(text)) return { intent: 'unknown', implied: false };
    var projection = isProjection(text);
    var afford = isAfford(text, count);
    var safe = isSafe(text, count);
    var cat = isCategoryQuestion(text, count);
    var savings = isSavings(text);
    var budget = isBudget(text) && !safe;
    var received = isReceived(text);
    var salary = isSalary(text) && !received;
    var income = isIncome(text);
    var expense = isExpense(text) && !cat;
    var balance = isBalance(text);
    if (received) salary = false;
    if (salary) income = false;
    var families = [];
    if (projection) families.push('month_end_projection');
    if (afford) families.push('can_afford');
    if (safe) families.push('safe_to_spend');
    if (cat) families.push('category_spend');
    if (savings) families.push('savings_goal');
    if (budget) families.push('set_budget');
    if (salary) families.push('set_salary');
    if (income) families.push('add_income');
    if (expense) families.push('add_expense');
    if (balance) families.push('set_balance');
    if (families.length > 1) return { intent: 'unknown', implied: false };
    if (families.length === 1) {
      if (isRead(text) && families[0] !== 'can_afford' && families[0] !== 'safe_to_spend' && families[0] !== 'category_spend' && families[0] !== 'month_end_projection') {
        return { intent: 'unknown', implied: false };
      }
      return { intent: families[0], implied: false };
    }
    if (isRead(text)) return { intent: 'unknown', implied: false };
    if (/\b(i have|i've got|ive got)\b/.test(text) && count === 1) return { intent: 'set_balance', implied: true };
    return { intent: 'unknown', implied: false };
  }

  function incomeCategory(text) {
    var hits = [];
    if (/\b(salary|paycheck)\b/.test(text) || hasAr(text, 'مرتب') || hasAr(text, 'راتب')) hits.push('Salary');
    if (/\brefund\b/.test(text) || hasAr(text, 'مرتجع')) hits.push('Refunds');
    if (/\b(freelance|bonus|gift)\b/.test(text) || hasAr(text, 'مكافاه') || hasAr(text, 'هديه') || hasAr(text, 'عمل حر')) hits.push('Other income');
    return hits;
  }

  function savingsLabel(text) {
    var match = text.match(/\bfor (?:a |an |the )?([a-z]{3,24})\b/);
    if (!match) return null;
    if (/^(the|and|end|month|me|my|all)$/.test(match[1])) return null;
    return match[1].charAt(0).toUpperCase() + match[1].slice(1);
  }

  function merchantFrom(text) {
    var match = text.match(/\b(?:on|at|for)\s+([a-z][a-z0-9 '&-]{0,40})$/);
    if (match) {
      var name = match[1].trim();
      if (name) return name.replace(/\b[a-z]/g, function (ch) { return ch.toUpperCase(); });
    }
    var ar = text.match(/(?:في|عند)\s+([\u0600-\u06FF]{2,24})/);
    if (ar) return ar[1];
    return null;
  }

  function unknownTopic(text, cats) {
    if (cats.length) return false;
    var match = text.match(/\b(?:on|for)\s+([a-z]{3,24})\b/);
    if (!match) return false;
    return !/^(the|this|that|month|everything|all|me|my)$/.test(match[1]);
  }

  function blank(warnings) {
    return {
      intent: 'unknown',
      amount_minor: null,
      currency: null,
      category: null,
      confidence: 0,
      needs_confirmation: false,
      currency_explicit: false,
      merchant: null,
      warnings: warnings || []
    };
  }

  function score(opts) {
    var c;
    if (opts.missingAmount) c = 70;
    else if (opts.implied) c = opts.explicit ? 86 : 82;
    else if (opts.hasAmount && !opts.explicit) c = 88;
    else c = 95;
    if (opts.noisy) c -= 5;
    return c / 100;
  }

  function ledgerCode(value) {
    if (typeof value !== 'string') return null;
    var code = value.toUpperCase();
    return LEDGER[code] ? code : null;
  }

  function finishWarnings(prepared) {
    var warnings = prepared.warnings.slice();
    if (prepared.noisy && warnings.indexOf('recognition_noise') < 0) warnings.push('recognition_noise');
    return warnings;
  }

  function parse(input, options) {
    var prepared = prepare(input);
    var warnings = finishWarnings(prepared);
    if (prepared.currencies.length > 1 || prepared.amounts.bad) return blank(warnings);
    var count = prepared.amounts.minors.length;
    var found = detectIntent(prepared.text, count);
    if (found.intent === 'unknown' || count > 1) return blank(warnings);
    var minor = count === 1 ? prepared.amounts.minors[0] : null;
    var explicit = prepared.currencies.length === 1 ? prepared.currencies[0] : null;
    var fallback = ledgerCode(options && options.currency) || 'EGP';
    var needsAmount = found.intent === 'can_afford' || !!WRITES[found.intent];
    if (minor === 0 && (found.intent === 'add_expense' || found.intent === 'add_income' || found.intent === 'can_afford' || found.intent === 'savings_goal')) {
      return blank(warnings);
    }
    var category = null;
    var merchant = null;
    var cats = spendCategories(prepared.text);
    if (found.intent === 'add_expense' || found.intent === 'set_budget' || found.intent === 'can_afford' || found.intent === 'category_spend') {
      if (cats.length > 1) return blank(warnings);
      if (cats.length === 1) category = cats[0];
      else if (found.intent === 'add_expense') category = 'Other';
      else if (found.intent === 'category_spend' && unknownTopic(prepared.text, cats)) return blank(warnings);
    } else if (found.intent === 'add_income') {
      var incomeCats = incomeCategory(prepared.text);
      if (incomeCats.length > 1) return blank(warnings);
      category = incomeCats.length === 1 ? incomeCats[0] : 'Other income';
    } else if (found.intent === 'savings_goal') {
      category = savingsLabel(prepared.text);
    }
    if (found.intent === 'add_expense' || found.intent === 'add_income') merchant = merchantFrom(prepared.text);
    var currency = null;
    if (explicit) currency = explicit;
    else if (minor != null) currency = fallback;
    return {
      intent: found.intent,
      amount_minor: minor,
      currency: currency,
      category: category,
      confidence: score({
        missingAmount: needsAmount && minor == null,
        implied: found.implied,
        explicit: !!explicit,
        hasAmount: minor != null,
        noisy: prepared.noisy
      }),
      needs_confirmation: !!WRITES[found.intent],
      currency_explicit: !!explicit,
      merchant: merchant,
      warnings: warnings
    };
  }

  function detectAmount(input) {
    var prepared = prepare(input);
    if (prepared.amounts.bad || !prepared.amounts.minors.length) return null;
    var minor = prepared.amounts.minors[0];
    if (minor > MAX_MINOR) return null;
    return minor / 100;
  }

  function formatMoney(minor, currency) {
    var neg = minor < 0;
    var abs = Math.abs(minor);
    var whole = Math.floor(abs / 100);
    var frac = String(abs % 100).padStart(2, '0');
    var grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return currency + ' ' + (neg ? '-' : '') + grouped + '.' + frac;
  }

  function minorToMajor(minor) {
    var neg = minor < 0;
    var abs = Math.abs(minor);
    var value = Math.floor(abs / 100) + (abs % 100) / 100;
    return neg ? -value : value;
  }

  function uniqSort(list) {
    var seen = {};
    var out = [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (!list[i] || seen[list[i]]) continue;
      seen[list[i]] = 1;
      out.push(list[i]);
    }
    out.sort();
    return out;
  }

  function asState(state) {
    return state && typeof state === 'object' ? state : {};
  }

  function readInt(obj, keys) {
    var seen = false;
    var value = null;
    var conflict = false;
    var invalid = false;
    var i;
    for (i = 0; i < keys.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(obj, keys[i])) continue;
      var raw = obj[keys[i]];
      if (raw == null || raw === '') continue;
      if (typeof raw !== 'number' || !Number.isInteger(raw)) { invalid = true; continue; }
      if (!seen) { seen = true; value = raw; }
      else if (value !== raw) conflict = true;
    }
    return { present: seen && !conflict && !invalid, value: seen && !conflict ? value : null, conflict: conflict || invalid };
  }

  function parseOffset(state, assumed) {
    if (!Object.prototype.hasOwnProperty.call(state, 'timeZone') || state.timeZone == null || state.timeZone === '') {
      assumed.push('time_zone');
      return 0;
    }
    if (typeof state.timeZone === 'number' && Number.isInteger(state.timeZone) && state.timeZone >= -14 * 60 && state.timeZone <= 14 * 60) {
      return state.timeZone;
    }
    if (typeof state.timeZone === 'string' && /^[+-]\d{2}:\d{2}$/.test(state.timeZone)) {
      var sign = state.timeZone.charAt(0) === '-' ? -1 : 1;
      var hours = Number(state.timeZone.slice(1, 3));
      var mins = Number(state.timeZone.slice(4, 6));
      if (hours <= 14 && mins < 60) return sign * (hours * 60 + mins);
    }
    assumed.push('time_zone');
    return 0;
  }

  function resolveClock(state, assumed) {
    var nowField = readInt(state, ['now']);
    if (!nowField.present) {
      assumed.push('now');
      return null;
    }
    var offsetMin = parseOffset(state, assumed);
    var shifted = nowField.value + offsetMin * 60000;
    var date = new Date(shifted);
    var year = date.getUTCFullYear();
    var month = date.getUTCMonth();
    var day = date.getUTCDate();
    var daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return {
      now: nowField.value,
      start: Date.UTC(year, month, 1) - offsetMin * 60000,
      end: Date.UTC(year, month + 1, 1) - offsetMin * 60000 - 1,
      day: day,
      daysInMonth: daysInMonth,
      daysLeft: daysInMonth - day,
      key: year + '-' + String(month + 1).padStart(2, '0')
    };
  }

  function majorToMinor(major) {
    if (typeof major !== 'number' || !Number.isFinite(major) || major < 0) return null;
    var minor = major * 100;
    var rounded = Math.round(minor);
    if (Math.abs(minor - rounded) > 1e-6 || rounded > MAX_MINOR) return null;
    return rounded;
  }

  function readCategoryBudget(state, currency, category) {
    if (!category) return { value: null, invalid: false, legacy: false };
    var maps = [state.categoryBudgetsMinor, state.category_budgets_minor];
    var i;
    for (i = 0; i < maps.length; i++) {
      var table = maps[i];
      if (!table || typeof table !== 'object' || !Object.prototype.hasOwnProperty.call(table, category)) continue;
      var raw = table[category];
      if (raw == null || raw === '') return { value: null, invalid: false, legacy: false };
      if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) return { value: null, invalid: true, legacy: false };
      return { value: raw, invalid: false, legacy: false };
    }
    var legacy = state.budgets && state.budgets[currency];
    if (legacy && typeof legacy === 'object' && Object.prototype.hasOwnProperty.call(legacy, category) && legacy[category] != null && legacy[category] !== '') {
      var converted = majorToMinor(Number(legacy[category]));
      if (converted == null) return { value: null, invalid: true, legacy: true };
      return { value: converted, invalid: false, legacy: true };
    }
    return { value: null, invalid: false, legacy: false };
  }

  function collectTransactions(state, assumed) {
    if (!Array.isArray(state.transactions)) {
      assumed.push('transactions');
      return [];
    }
    var rows = [];
    var invalid = false;
    var missingCurrency = false;
    var i;
    for (i = 0; i < state.transactions.length; i++) {
      var tx = state.transactions[i];
      if (!tx || typeof tx !== 'object') { invalid = true; continue; }
      var amount = tx.amountMinor != null ? tx.amountMinor : tx.amount_minor;
      var at = tx.occurredAt != null ? tx.occurredAt : tx.occurred_at;
      if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 0 ||
          (tx.direction !== 'income' && tx.direction !== 'expense') ||
          typeof at !== 'number' || !Number.isInteger(at)) {
        invalid = true;
        continue;
      }
      if (typeof tx.currency !== 'string' || !tx.currency) {
        missingCurrency = true;
        continue;
      }
      rows.push({
        amount: amount,
        currency: tx.currency.toUpperCase(),
        direction: tx.direction,
        at: at,
        category: tx.category || null
      });
    }
    if (invalid) assumed.push('invalid_transaction');
    if (missingCurrency) assumed.push('transaction_missing_currency');
    return rows;
  }

  function readBills(state, currency, clock, assumed) {
    var hasCamel = Object.prototype.hasOwnProperty.call(state, 'upcomingBills');
    var hasSnake = Object.prototype.hasOwnProperty.call(state, 'upcoming_bills');
    if (!hasCamel && !hasSnake) {
      assumed.push('upcoming_bills');
      return { total: 0, foreign: 0 };
    }
    var list = hasCamel ? state.upcomingBills : state.upcoming_bills;
    if (!Array.isArray(list)) {
      assumed.push('upcoming_bills');
      return { total: 0, foreign: 0 };
    }
    var total = 0;
    var foreign = 0;
    var undated = false;
    var missingCurrency = false;
    var windowAll = !clock;
    var i;
    for (i = 0; i < list.length; i++) {
      var bill = list[i];
      if (!bill || typeof bill !== 'object') continue;
      var amount = bill.amountMinor != null ? bill.amountMinor : bill.amount_minor;
      var due = bill.dueAt != null ? bill.dueAt : bill.due_at;
      if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 0) continue;
      if (typeof bill.currency !== 'string' || !bill.currency) { missingCurrency = true; continue; }
      if (bill.currency.toUpperCase() !== currency) { foreign++; continue; }
      if (typeof due !== 'number' || !Number.isInteger(due)) { undated = true; continue; }
      if (!windowAll) {
        if (due < clock.now || due > clock.end) continue;
      }
      total += amount;
    }
    if (undated) assumed.push('bill_missing_due_date');
    if (missingCurrency) assumed.push('bill_missing_currency');
    if (windowAll && total > 0) assumed.push('bill_window');
    return { total: total, foreign: foreign };
  }

  function analyze(state) {
    var src = asState(state);
    var assumed = [];
    if (readInt(src, ['reportedBalanceMinor', 'self_reported_balance_minor']).conflict ||
        readInt(src, ['verifiedBalanceMinor', 'verified_balance_minor']).conflict) {
      assumed.push('conflicting_fields');
    }
    var currencyField = typeof src.currency === 'string' ? src.currency.toUpperCase() : '';
    var currency = LEDGER[currencyField] ? currencyField : 'EGP';
    if (!LEDGER[currencyField]) assumed.push('currency');
    var clock = resolveClock(src, assumed);
    var verified = readInt(src, ['verifiedBalanceMinor', 'verified_balance_minor']);
    var verifiedAt = readInt(src, ['verifiedBalanceAt', 'verified_balance_at']);
    var reported = readInt(src, ['reportedBalanceMinor', 'self_reported_balance_minor']);
    var reportedAt = readInt(src, ['balanceReportedAt', 'self_reported_at']);
    var track = null;
    var base = null;
    var at = null;
    if (verified.present && verifiedAt.present) {
      track = 'verified';
      base = verified.value;
      at = verifiedAt.value;
    } else if (verified.present && !verifiedAt.present) {
      assumed.push('verified_balance_at');
    }
    if (!track && reported.present && reportedAt.present) {
      track = 'self_reported';
      base = reported.value;
      at = reportedAt.value;
      assumed.push('verified_balance');
    } else if (!track && reported.present && !reportedAt.present) {
      assumed.push('balance_reported_at');
      assumed.push('verified_balance');
    } else if (!track) {
      assumed.push('verified_balance');
      assumed.push('self_reported_balance');
    }
    var rows = collectTransactions(src, assumed);
    var delta = 0;
    var foreign = 0;
    var monthIncome = 0;
    var monthExpense = 0;
    var receivedAll = 0;
    var byCategory = {};
    var r;
    for (r = 0; r < rows.length; r++) {
      var row = rows[r];
      if (row.currency !== currency) { foreign++; continue; }
      var inMonth = !clock || (row.at >= clock.start && row.at <= clock.end);
      if (inMonth && row.direction === 'income') monthIncome += row.amount;
      if (inMonth && row.direction === 'expense') {
        monthExpense += row.amount;
        var key = row.category || 'Other';
        byCategory[key] = (byCategory[key] || 0) + row.amount;
      }
      if (row.direction === 'income') receivedAll += row.amount;
      if (track && row.at >= at) delta += row.direction === 'income' ? row.amount : -row.amount;
    }
    var plannedField = readInt(src, ['monthlyIncomeMinor', 'planned_income_minor']);
    var planned = plannedField.present && plannedField.value > 0 ? plannedField.value : null;
    var budgetField = readInt(src, ['monthlyBudgetMinor', 'monthly_budget_minor']);
    var monthly = budgetField.present && budgetField.value > 0 ? budgetField.value : null;
    var reserveField = readInt(src, ['emergencyReserveMinor', 'emergency_reserve_minor']);
    var reserve = 0;
    if (!reserveField.present) {
      assumed.push('emergency_reserve');
    } else reserve = reserveField.value;
    var bills = readBills(src, currency, clock, assumed);
    var cash = track == null ? null : base + delta;
    return {
      currency: currency,
      assumed: assumed,
      clock: clock,
      track: track,
      cash: cash,
      selfReported: reported.present ? reported.value : null,
      verified: verified.present ? verified.value : null,
      monthIncome: monthIncome,
      monthExpense: monthExpense,
      receivedAll: receivedAll,
      byCategory: byCategory,
      planned: planned,
      monthly: monthly,
      reserve: reserve,
      bills: bills.total,
      foreignTx: foreign,
      foreignBills: bills.foreign,
      foreign: foreign + bills.foreign,
      rows: rows
    };
  }

  function flagSet(list) {
    var set = {};
    var i;
    for (i = 0; i < list.length; i++) set[list[i]] = 1;
    return set;
  }

  function selectFlags(set, names) {
    var out = [];
    var i;
    for (i = 0; i < names.length; i++) if (set[names[i]]) out.push(names[i]);
    return out;
  }

  var CASH_FLAGS = ['currency', 'conflicting_fields', 'verified_balance', 'verified_balance_at', 'self_reported_balance', 'balance_reported_at', 'transactions', 'invalid_transaction', 'transaction_missing_currency'];
  var BILL_FLAGS = ['upcoming_bills', 'bill_missing_due_date', 'bill_missing_currency', 'bill_window'];

  function baseDetails(report, extra) {
    var details = {
      cash_minor: report.cash,
      bills_minor: report.bills,
      reserve_minor: report.reserve,
      planned_income_minor: report.planned,
      received_income_minor: report.clock ? report.monthIncome : report.receivedAll,
      month_income_minor: report.clock ? report.monthIncome : null,
      month_expense_minor: report.clock ? report.monthExpense : null,
      excluded_other_currency: report.foreign,
      month_key: report.clock ? report.clock.key : null
    };
    var key;
    if (extra) for (key in extra) if (Object.prototype.hasOwnProperty.call(extra, key)) details[key] = extra[key];
    return details;
  }

  function explainCommon(report, assumed) {
    var bits = [];
    if (report.planned != null) {
      bits.push('Planned income of ' + formatMoney(report.planned, report.currency) + ' is not received cash and was not included.');
    } else {
      bits.push('No planned income was added to cash.');
    }
    if (report.foreign) {
      bits.push('Excluded ' + report.foreign + ' entry(s) in another currency. Nothing was converted.');
    }
    if (assumed.length) bits.push('Assumed defaults for missing inputs: ' + assumed.join(', ') + '.');
    return bits.join(' ');
  }

  function safeAssumptions(report, categoryMissing) {
    var set = flagSet(report.assumed);
    var assumed = selectFlags(set, CASH_FLAGS.concat(BILL_FLAGS).concat(['emergency_reserve']));
    if (report.monthly == null) assumed.push('monthly_budget');
    else if (!report.clock) assumed.push('now');
    if (report.clock && set.time_zone && (report.monthly != null || !set.upcoming_bills)) assumed.push('time_zone');
    if (categoryMissing) assumed.push('category_budget');
    return uniqSort(assumed);
  }

  function safeToSpend(state, options) {
    var report = analyze(state);
    var category = options && options.category ? options.category : null;
    var safe = null;
    var safeCash = null;
    var budgetRemaining = null;
    var categoryBudget = null;
    var categoryMissing = false;
    if (report.cash != null) {
      safeCash = report.cash - report.bills - report.reserve;
      safe = safeCash;
      if (report.monthly != null && report.clock) {
        budgetRemaining = report.monthly - report.monthExpense;
        if (budgetRemaining < safe) safe = budgetRemaining;
      }
      if (category) {
        var catBudget = readCategoryBudget(asState(state), report.currency, category);
        if (catBudget.invalid || catBudget.value == null) {
          categoryMissing = true;
        } else {
          categoryBudget = catBudget.value;
          var catLeft = catBudget.value - (report.byCategory[category] || 0);
          if (catLeft < safe) safe = catLeft;
        }
      }
    }
    var assumed = safeAssumptions(report, categoryMissing);
    var explanation;
    if (report.cash == null) {
      explanation = 'No spendable balance was calculated. A verified balance with a timestamp, or a self-reported balance with balanceReportedAt, is required. No balance was invented. ' + explainCommon(report, assumed);
    } else if (report.track === 'verified') {
      explanation = 'Safe to spend is ' + formatMoney(safe, report.currency) + ' using the verified balance only. ';
      if (report.selfReported != null) explanation += 'The self-reported balance was kept separate and was not added. ';
      if (budgetRemaining != null && budgetRemaining < safeCash) explanation += 'The monthly budget remaining is the tighter limit. ';
      explanation += explainCommon(report, assumed);
    } else {
      explanation = 'Safe to spend is ' + formatMoney(safe, report.currency) + ' using the self-reported balance, because no verified balance was provided. ';
      if (budgetRemaining != null && budgetRemaining < safeCash) explanation += 'The monthly budget remaining is the tighter limit. ';
      explanation += explainCommon(report, assumed);
    }
    return {
      explanation: explanation,
      assumed: assumed,
      currency: report.currency,
      amount_minor: safe,
      balance_track: report.track,
      details: baseDetails(report, {
        safe_cash_minor: safeCash,
        budget_remaining_minor: budgetRemaining,
        category_budget_minor: categoryBudget
      })
    };
  }

  function normalizeCost(cost, state) {
    var assumed = [];
    var ledger = ledgerCode(asState(state).currency) || 'EGP';
    if (typeof cost === 'number') {
      if (!Number.isInteger(cost) || cost <= 0) return { error: true };
      assumed.push('cost_currency');
      return { amount: cost, currency: ledger, assumed: assumed };
    }
    if (!cost || typeof cost !== 'object') return { error: true };
    var amount = cost.amount_minor != null ? cost.amount_minor : cost.amountMinor;
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) return { error: true };
    var currency = cost.currency ? ledgerCode(cost.currency) : null;
    if (!currency) {
      assumed.push('cost_currency');
      currency = ledger;
    }
    return { amount: amount, currency: currency, assumed: assumed };
  }

  function canAfford(state, cost) {
    var parsed = normalizeCost(cost, state);
    if (parsed.error) {
      return {
        explanation: 'A positive integer cost in minor units is required. No price was guessed.',
        assumed: ['cost'],
        currency: null,
        amount_minor: null,
        affordable: null,
        balance_track: null,
        details: {}
      };
    }
    var safe = safeToSpend(state);
    if (parsed.currency !== safe.currency) {
      return {
        explanation: 'Cannot compare ' + formatMoney(parsed.amount, parsed.currency) + ' with ' + safe.currency + '. Currencies are never converted or mixed.',
        assumed: ['no_fx_conversion'],
        currency: null,
        amount_minor: null,
        affordable: null,
        balance_track: safe.balance_track,
        details: { cost_minor: parsed.amount, cost_currency: parsed.currency, ledger_currency: safe.currency }
      };
    }
    if (safe.amount_minor == null) {
      return {
        explanation: 'Affordability needs a safe-to-spend figure. ' + safe.explanation,
        assumed: uniqSort(safe.assumed.concat(parsed.assumed)),
        currency: parsed.currency,
        amount_minor: null,
        affordable: null,
        balance_track: safe.balance_track,
        details: baseDetails({ cash: null, bills: safe.details.bills_minor, reserve: safe.details.reserve_minor, planned: safe.details.planned_income_minor, monthIncome: safe.details.month_income_minor, receivedAll: safe.details.received_income_minor, clock: safe.details.month_key ? { key: safe.details.month_key } : null, monthExpense: safe.details.month_expense_minor, foreign: safe.details.excluded_other_currency, currency: parsed.currency }, { cost_minor: parsed.amount })
      };
    }
    var left = safe.amount_minor - parsed.amount;
    var verdict = left >= 0
      ? 'Yes. ' + formatMoney(parsed.amount, parsed.currency) + ' fits in safe to spend of ' + formatMoney(safe.amount_minor, parsed.currency) + ', leaving ' + formatMoney(left, parsed.currency) + '. '
      : 'No. ' + formatMoney(parsed.amount, parsed.currency) + ' exceeds safe to spend of ' + formatMoney(safe.amount_minor, parsed.currency) + ' by ' + formatMoney(-left, parsed.currency) + '. ';
    return {
      explanation: verdict + 'Planned income was not treated as received cash. ' + safe.explanation,
      assumed: uniqSort(safe.assumed.concat(parsed.assumed)),
      currency: parsed.currency,
      amount_minor: left,
      affordable: left >= 0,
      balance_track: safe.balance_track,
      details: Object.assign({ cost_minor: parsed.amount }, safe.details)
    };
  }

  function projectionAssumptions(report, extra) {
    var set = flagSet(report.assumed);
    var assumed = selectFlags(set, CASH_FLAGS.concat(BILL_FLAGS).concat(['now']));
    if (report.clock && set.time_zone) assumed.push('time_zone');
    else if (!report.clock && set.time_zone) assumed.push('time_zone');
    var i;
    for (i = 0; i < extra.length; i++) assumed.push(extra[i]);
    return uniqSort(assumed);
  }

  function monthEndProjection(state) {
    var report = analyze(state);
    if (!report.clock) {
      var blocked = projectionAssumptions(report, []);
      return {
        explanation: 'A clock is required to place month end. Pass state.now as epoch milliseconds. Nothing was projected. ' + explainCommon(report, blocked),
        assumed: blocked,
        currency: report.currency,
        amount_minor: null,
        balance_track: report.track,
        details: baseDetails(report, { projected_inflow_minor: null, expected_outflow_minor: null })
      };
    }
    var received = report.monthIncome;
    var plannedRemaining = 0;
    var extra = [];
    if (report.planned == null) extra.push('planned_income');
    else {
      plannedRemaining = Math.max(0, report.planned - received);
      if (plannedRemaining > 0) extra.push('planned_income_still_expected');
    }
    var outflow;
    if (report.monthly != null) {
      var budgetRemaining = report.monthly - report.monthExpense;
      var discretionary = Math.max(0, budgetRemaining - report.bills);
      outflow = report.bills + discretionary;
    } else {
      extra.push('monthly_budget');
      extra.push('spend_pace');
      var elapsed = report.clock.day > 0 ? report.clock.day : 1;
      var pace = Math.round(report.monthExpense * report.clock.daysLeft / elapsed);
      outflow = report.bills + pace;
    }
    var assumed = projectionAssumptions(report, extra);
    if (report.cash == null) {
      return {
        explanation: 'Month-end cash was not projected because no opening balance was available. No balance was invented. ' + explainCommon(report, assumed),
        assumed: assumed,
        currency: report.currency,
        amount_minor: null,
        balance_track: null,
        details: baseDetails(report, { projected_inflow_minor: plannedRemaining, expected_outflow_minor: outflow })
      };
    }
    var projected = report.cash + plannedRemaining - outflow;
    var trackLabel = report.track === 'verified' ? 'verified balance' : 'self-reported balance';
    var explanation = 'Projected month-end cash is ' + formatMoney(projected, report.currency) +
      '. This starts from the ' + trackLabel + ' cash of ' + formatMoney(report.cash, report.currency) +
      ', adds planned income not yet received (' + formatMoney(plannedRemaining, report.currency) +
      '), and subtracts expected outflow of ' + formatMoney(outflow, report.currency) +
      '. Received income this month is ' + formatMoney(received, report.currency) +
      ' and is not the same figure as planned income. ';
    if (report.track === 'verified' && report.selfReported != null) {
      explanation += 'The self-reported balance was kept separate and was not added. ';
    }
    explanation += explainCommon(report, assumed);
    return {
      explanation: explanation,
      assumed: assumed,
      currency: report.currency,
      amount_minor: projected,
      balance_track: report.track,
      details: baseDetails(report, { projected_inflow_minor: plannedRemaining, expected_outflow_minor: outflow })
    };
  }

  function categorySpend(state, category) {
    var report = analyze(state);
    var set = flagSet(report.assumed);
    var assumed = selectFlags(set, ['currency', 'conflicting_fields', 'transactions', 'invalid_transaction', 'transaction_missing_currency']);
    if (!report.clock) assumed.push('now');
    else if (set.time_zone) assumed.push('time_zone');
    assumed = uniqSort(assumed);
    var name = category || null;
    var total = 0;
    var windowNote;
    if (!report.clock) {
      windowNote = 'across the whole history because no clock was provided';
      var i;
      for (i = 0; i < report.rows.length; i++) {
        var row = report.rows[i];
        if (row.currency !== report.currency || row.direction !== 'expense') continue;
        if (name && row.category !== name) continue;
        total += row.amount;
      }
    } else {
      windowNote = 'in ' + report.clock.key;
      total = name ? (report.byCategory[name] || 0) : report.monthExpense;
    }
    var subject = name || 'all categories';
    var explanation = 'Spent ' + formatMoney(total, report.currency) + ' on ' + subject + ' ' + windowNote + '. ';
    if (report.foreignTx) explanation += 'Excluded ' + report.foreignTx + ' entry(s) in another currency. Nothing was converted. ';
    if (assumed.length) explanation += 'Assumed defaults for missing inputs: ' + assumed.join(', ') + '.';
    return {
      explanation: explanation,
      assumed: assumed,
      currency: report.currency,
      amount_minor: total,
      balance_track: report.track,
      details: baseDetails(report, { category: name, excluded_other_currency: report.foreignTx })
    };
  }

  function isLegacySummaryText(text) {
    return /\b(how am i doing|how are my finances|my finances)\b/.test(text) ||
      /\bsummary\b/.test(text) ||
      hasAr(text, 'وضع') || hasAr(text, 'صرفنا') || hasAr(text, 'ملخص');
  }

  function summaryAnswer(state) {
    var spent = categorySpend(state, null);
    var safe = safeToSpend(state);
    var income = spent.details.month_income_minor == null ? 0 : spent.details.month_income_minor;
    var expense = spent.details.month_expense_minor == null ? spent.amount_minor : spent.details.month_expense_minor;
    var planned = safe.details.planned_income_minor;
    var parts = [
      'This month you recorded ' + formatMoney(income, spent.currency) + ' received income and ' + formatMoney(expense, spent.currency) + ' spending.'
    ];
    if (planned != null) parts.push('Planned income of ' + formatMoney(planned, spent.currency) + ' is a salary plan, not received cash.');
    else parts.push('No planned income is on file.');
    if (safe.amount_minor == null) parts.push('Safe to spend is unavailable until a balance snapshot with a time is recorded.');
    else parts.push('Safe to spend from the ' + (safe.balance_track === 'verified' ? 'verified' : 'self-reported') + ' balance is ' + formatMoney(safe.amount_minor, safe.currency) + '.');
    if (!asState(state).transactions || !asState(state).transactions.length) parts.push('No transactions have been recorded yet.');
    return parts.join(' ');
  }

  function ambientState() {
    try {
      if (typeof state === 'object' && state) return state;
    } catch (err) {
      return null;
    }
    return null;
  }

  function currencyMismatch(parsed, state) {
    var ledger = ledgerCode(asState(state).currency);
    return !!(parsed.currency_explicit && ledger && parsed.currency && parsed.currency !== ledger);
  }

  function buildLegacy(parsed) {
    var minor = parsed.amount_minor;
    var proposal;
    var action;
    if (parsed.intent === 'set_balance') {
      action = { type: 'balance', amountMinor: minor, currency: parsed.currency, title: 'Record balance snapshot' };
    } else if (parsed.intent === 'set_salary') {
      action = { type: 'incomePlan', amountMinor: minor, currency: parsed.currency, title: 'Save expected monthly income' };
    } else if (parsed.intent === 'set_budget' && parsed.category) {
      action = {
        type: 'categoryBudget',
        category: parsed.category,
        amount: minorToMajor(minor),
        amountMinor: minor,
        currency: parsed.currency,
        title: 'Set category budget'
      };
    } else if (parsed.intent === 'set_budget') {
      action = { type: 'budget', amountMinor: minor, currency: parsed.currency, title: 'Set monthly budget' };
    } else if (parsed.intent === 'add_expense') {
      action = {
        type: 'expense',
        amountMinor: minor,
        currency: parsed.currency,
        merchant: parsed.merchant || 'Voice expense',
        category: parsed.category || 'Other',
        title: 'Record expense'
      };
    } else if (parsed.intent === 'add_income') {
      action = {
        type: 'income',
        amountMinor: minor,
        currency: parsed.currency,
        merchant: parsed.merchant || 'Income',
        category: parsed.category || 'Other income',
        title: 'Record income'
      };
    } else if (parsed.intent === 'savings_goal') {
      proposal = { type: 'savingsGoal', amountMinor: minor, currency: parsed.currency, category: parsed.category, title: 'Save savings goal' };
      return { action: undefined, proposal: proposal };
    } else {
      return { action: undefined, proposal: null };
    }
    proposal = {
      type: action.type,
      amountMinor: minor,
      currency: parsed.currency,
      category: parsed.category,
      merchant: action.merchant || null,
      title: action.title,
      amount: action.amount == null ? null : action.amount
    };
    return { action: action, proposal: proposal };
  }

  function writeAnswer(parsed, blocked) {
    var money = parsed.amount_minor == null ? null : formatMoney(parsed.amount_minor, parsed.currency || 'EGP');
    if (parsed.intent === 'set_balance') {
      if (money == null) return 'What self-reported balance should I record? This is not verified with your bank.';
      if (blocked) return money + ' is explicit, and it does not match the open ledger. Folio will not convert or file it under a different currency.';
      return 'I can record a self-reported balance snapshot of ' + money + '. This is not a verified bank balance. Confirm before anything is saved.';
    }
    if (parsed.intent === 'set_salary') {
      if (money == null) return 'What expected monthly income should I plan for? This will not create a received-income transaction.';
      if (blocked) return money + ' does not match the open ledger. The salary plan was not queued, and nothing was converted.';
      return 'Set expected monthly income to ' + money + '? This is a plan and will not create a received-income transaction. Confirm before anything is saved.';
    }
    if (parsed.intent === 'set_budget') {
      if (money == null) return 'What monthly spending limit should I use?';
      if (blocked) return money + ' does not match the open ledger. The budget was not queued, and nothing was converted.';
      if (parsed.category) return 'Set the ' + parsed.category + ' monthly budget to ' + money + '? Category budgets stay in major units in the current ledger. Confirm before anything is saved.';
      return 'Set the overall monthly spending target to ' + money + '? This is separate from category budgets. Confirm before anything is saved.';
    }
    if (parsed.intent === 'add_expense') {
      if (money == null) return 'How much was the expense?';
      if (blocked) return money + ' does not match the open ledger. The expense was not queued, and nothing was converted.';
      return 'Add a ' + money + ' expense' + (parsed.merchant ? ' for ' + parsed.merchant : '') + ' in ' + (parsed.category || 'Other') + '? Confirm before anything is saved.';
    }
    if (parsed.intent === 'add_income') {
      if (money == null) return 'How much income was received? This is received money, not the monthly salary plan.';
      if (blocked) return money + ' does not match the open ledger. The income was not queued, and nothing was converted.';
      return 'Add ' + money + ' as received income in ' + (parsed.category || 'Other income') + '? This does not change the salary plan. Confirm before anything is saved.';
    }
    if (parsed.intent === 'savings_goal') {
      if (money == null) return 'How much do you want the savings goal to be? This does not move money.';
      return 'I can store a savings goal of ' + money + (parsed.category ? ' for ' + parsed.category : '') + '. This does not move money. Confirm before anything is saved.';
    }
    return 'Confirm before anything is saved.';
  }

  function planCommand(input, stateObject) {
    var ledger = stateObject && typeof stateObject === 'object' ? stateObject : ambientState();
    var parsed = parse(input, { currency: ledger && ledger.currency });
    var legacy = false;
    var answer;
    var action;
    var proposal = null;
    if (parsed.intent === 'unknown' && isLegacySummaryText(prepare(input).text)) {
      legacy = true;
      answer = summaryAnswer(ledger || {});
    } else if (parsed.intent === 'can_afford') {
      if (parsed.amount_minor == null) answer = 'How much would this purchase cost? Please include an amount.';
      else answer = canAfford(ledger || {}, { amount_minor: parsed.amount_minor, currency: parsed.currency }).explanation;
    } else if (parsed.intent === 'safe_to_spend') {
      answer = safeToSpend(ledger || {}, { category: parsed.category }).explanation;
    } else if (parsed.intent === 'category_spend') {
      answer = categorySpend(ledger || {}, parsed.category).explanation;
    } else if (parsed.intent === 'month_end_projection') {
      answer = monthEndProjection(ledger || {}).explanation;
    } else if (WRITES[parsed.intent]) {
      var blocked = currencyMismatch(parsed, ledger || {});
      answer = writeAnswer(parsed, blocked);
      if (parsed.amount_minor != null) {
        var built = buildLegacy(parsed);
        proposal = built.proposal;
        action = blocked ? undefined : built.action;
      }
    } else {
      answer = 'I can record a self-reported balance, a salary plan, budgets, expenses, received income, and a savings goal. I can also estimate what you can afford, what is safe to spend, category spending, and a month-end projection. I will not guess.';
    }
    return {
      intent: parsed.intent,
      amount_minor: parsed.amount_minor,
      currency: parsed.currency,
      category: parsed.category,
      confidence: parsed.confidence,
      needs_confirmation: parsed.needs_confirmation,
      currency_explicit: parsed.currency_explicit,
      merchant: parsed.merchant,
      warnings: parsed.warnings,
      answer: answer,
      action: action,
      proposal: proposal,
      legacy_summary: legacy
    };
  }

  return {
    INTENTS: INTENTS,
    parse: parse,
    planCommand: planCommand,
    detectAmount: detectAmount,
    numberValue: detectAmount,
    canAfford: canAfford,
    safeToSpend: safeToSpend,
    monthEndProjection: monthEndProjection,
    categorySpend: categorySpend,
    formatMoney: formatMoney
  };
});
