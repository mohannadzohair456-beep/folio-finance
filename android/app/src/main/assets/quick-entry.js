/**
 * One-line quick entry. Deterministic, no DOM, no network, no clock.
 * Nothing here writes the ledger. The caller saves only after confirm.
 * Loaded from a text/plain script on the first Review tap so it does not
 * delay the home shell.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FolioQuickEntry = api;
  if (typeof window !== 'undefined' && window && window !== root) window.FolioQuickEntry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_MINOR = 10000000000;
  var CURRENCIES = { EGP: 1, USD: 1, SAR: 1, AED: 1, EUR: 1, GBP: 1 };
  var EXPENSE_CATEGORIES = ['Food & drinks', 'Shopping', 'Transport', 'Subscriptions', 'Bills & utilities', 'Health', 'Entertainment', 'Housing', 'Education', 'Other'];
  var INCOME_CATEGORIES = ['Salary', 'Transfers', 'Refunds', 'Other income'];
  var ALL_CATEGORIES = EXPENSE_CATEGORIES.concat(INCOME_CATEGORIES);

  var MESSAGES = {
    empty: ['Type an amount and what it was for. Nothing was saved.', 'اكتب المبلغ والحاجة. مفيش حاجة اتسجلت.'],
    'no-amount': ['Folio couldn\'t read an amount in that line. Nothing was saved.', 'مش قادر أقرأ مبلغ في السطر ده. مفيش حاجة اتسجلت.'],
    'many-amounts': ['That line has more than one amount, so Folio didn\'t guess. Nothing was saved.', 'السطر فيه أكتر من مبلغ، فمش هخمّن. مفيش حاجة اتسجلت.'],
    'bad-decimals': ['That amount has more than two decimal places. Folio won\'t round it. Nothing was saved.', 'المبلغ فيه أكتر من رقمين بعد العلامة. مش هقرّبه. مفيش حاجة اتسجلت.'],
    'ambiguous-dot': ['That dot could be decimals or a thousands separator, so Folio didn\'t guess. Nothing was saved.', 'النقطة دي ممكن تكون قروش أو آلاف، فمش هخمّن. مفيش حاجة اتسجلت.'],
    'bad-grouping': ['Folio couldn\'t read that number. Nothing was saved.', 'مش قادر أقرأ الرقم ده. مفيش حاجة اتسجلت.'],
    zero: ['The amount has to be more than zero. Nothing was saved.', 'المبلغ لازم يبقى أكبر من صفر. مفيش حاجة اتسجلت.'],
    'too-large': ['That amount is too large to store. Nothing was saved.', 'المبلغ أكبر من اللي نقدر نسجله. مفيش حاجة اتسجلت.'],
    'no-label': ['Add what the money was for, as well as the amount. Nothing was saved.', 'اكتب المبلغ والحاجة اللي اتدفعت أو اتستلمت. مفيش حاجة اتسجلت.'],
    mixed: ['That line mixes income and spending words, so Folio didn\'t guess. Nothing was saved.', 'السطر فيه كلام دخل ومصروف مع بعض، فمش هخمّن. مفيش حاجة اتسجلت.'],
    currency: ['That line names a different currency. Folio won\'t convert it. Nothing was saved.', 'العملة في السطر مختلفة، ومفيش تحويل. مفيش حاجة اتسجلت.'],
    transfer: ['Folio can\'t tell whether that transfer is money in or money out. Nothing was saved.', 'مش واضح التحويل ده داخل ولا خارج. مفيش حاجة اتسجلت.'],
    'too-long': ['That line is too long. Nothing was saved.', 'السطر طويل زيادة. مفيش حاجة اتسجلت.'],
    'bad-category': ['Pick a category Folio knows. Nothing was saved.', 'اختار تصنيف من القائمة. مفيش حاجة اتسجلت.'],
    'bad-direction': ['Choose income or expense. Nothing was saved.', 'اختار دخل أو مصروف. مفيش حاجة اتسجلت.'],
    'bad-date': ['That entry needs a valid date. Nothing was saved.', 'محتاج تاريخ صحيح. مفيش حاجة اتسجلت.'],
    'no-merchant': ['Add who this was for. Nothing was saved.', 'اكتب الاسم أو المكان. مفيش حاجة اتسجلت.']
  };

  var CURRENCY_WORDS = {
    egp: 'EGP', 'ج': 'EGP', 'جنيه': 'EGP', 'جنيها': 'EGP',
    usd: 'USD', dollar: 'USD', dollars: 'USD', 'دولار': 'USD',
    sar: 'SAR', 'ريال': 'SAR',
    aed: 'AED', 'درهم': 'AED',
    eur: 'EUR', euro: 'EUR', 'يورو': 'EUR',
    gbp: 'GBP'
  };
  var AFFIXES = [
    ['جنيها', 'EGP'], ['جنيه', 'EGP'], ['دولار', 'USD'], ['ريال', 'SAR'], ['درهم', 'AED'], ['يورو', 'EUR'],
    ['dollars', 'USD'], ['dollar', 'USD'], ['euro', 'EUR'],
    ['egp', 'EGP'], ['usd', 'USD'], ['sar', 'SAR'], ['aed', 'AED'], ['eur', 'EUR'], ['gbp', 'GBP'],
    ['ج', 'EGP']
  ];

  var INCOME = {
    salary: { keep: 1, category: 'Salary' },
    paycheck: { keep: 1, category: 'Salary' },
    wage: { keep: 1, category: 'Salary' },
    wages: { keep: 1, category: 'Salary' },
    mortab: { keep: 1, category: 'Salary' },
    rateb: { keep: 1, category: 'Salary' },
    ratib: { keep: 1, category: 'Salary' },
    'مرتب': { keep: 1, category: 'Salary' },
    'راتب': { keep: 1, category: 'Salary' },
    income: { keep: 1, category: 'Other income' },
    refund: { keep: 1, category: 'Refunds' },
    refunded: { keep: 1, category: 'Refunds' },
    'استرداد': { keep: 1, category: 'Refunds' },
    deposit: { keep: 1, category: 'Other income' },
    deposited: { keep: 1, category: 'Other income' },
    received: { keep: 0, category: null },
    got: { keep: 0, category: null },
    earned: { keep: 0, category: null },
    estalamt: { keep: 0, category: null },
    estalmt: { keep: 0, category: null },
    'استلمت': { keep: 0, category: null },
    'قبضت': { keep: 1, category: 'Salary' },
    'جالي': { keep: 0, category: null },
    'جالى': { keep: 0, category: null },
    'اتحوللي': { keep: 0, category: 'Transfers' },
    'اتحولي': { keep: 0, category: 'Transfers' },
    'وصلني': { keep: 0, category: 'Other income' }
  };

  var EXPENSE = {
    paid: 1, spent: 1, spend: 1, bought: 1, buy: 1, purchased: 1, purchase: 1, expense: 1,
    dafa3t: 1, daf3t: 1, dfa3t: 1, dafa3et: 1, sarafet: 1, saraft: 1, sarft: 1,
    eshtareit: 1, eshtarait: 1, eshtarit: 1,
    'دفعت': 1, 'صرفت': 1, 'اشتريت': 1, 'شراء': 1
  };

  var TRANSFER = { transfer: 1, transfers: 1, 'تحويل': 1, 'حولت': 1 };

  var STOP = {
    i: 1, a: 1, an: 1, the: 1, my: 1, for: 1, on: 1, at: 1, to: 1, from: 1, of: 1, and: 1, with: 1, in: 1, it: 1, was: 1, is: 1,
    'على': 1, 'في': 1, 'من': 1, 'عشان': 1, 'و': 1, 'الى': 1, 'إلى': 1
  };

  var CATEGORY_WORDS = [
    ['Food & drinks', ['lunch', 'dinner', 'breakfast', 'brunch', 'snack', 'food', 'coffee', 'cafe', 'restaurant', 'grocery', 'groceries', 'pizza', 'bread', 'kfc', 'اكل', 'طعام', 'غدا', 'غداء', 'فطار', 'فطور', 'عشا', 'عشاء', 'قهوه', 'مطعم', 'سوبرماركت', 'بقاله', 'akl', 'akel', 'ghada', 'futar', '3asha', 'ahwa']],
    ['Transport', ['uber', 'careem', 'taxi', 'cab', 'metro', 'bus', 'fuel', 'petrol', 'gas', 'transport', 'microbus', 'swvl', 'مواصلات', 'اوبر', 'تاكسي', 'مترو', 'بنزين', 'ميكروباص', 'mwasalat', 'muasalat']],
    ['Shopping', ['shopping', 'amazon', 'noon', 'clothes', 'تسوق', 'ملابس', 'امازون']],
    ['Housing', ['rent', 'housing', 'apartment', 'ايجار', 'سكن']],
    ['Bills & utilities', ['bill', 'bills', 'electricity', 'internet', 'vodafone', 'utility', 'utilities', 'phone', 'فاتوره', 'فواتير', 'كهربا', 'كهرباء', 'نت', 'موبايل', 'انترنت']],
    ['Health', ['pharmacy', 'doctor', 'hospital', 'medicine', 'صيدليه', 'دكتور', 'دواء']],
    ['Subscriptions', ['netflix', 'spotify', 'subscription', 'اشتراك', 'نتفليكس']],
    ['Entertainment', ['cinema', 'movie', 'سينما', 'فيلم']],
    ['Education', ['school', 'tuition', 'course', 'مدرسه', 'كورس', 'تعليم']]
  ];

  function foldKeys(table) {
    var out = {};
    var keys = Object.keys(table);
    var i;
    for (i = 0; i < keys.length; i++) out[fold(keys[i])] = table[keys[i]];
    return out;
  }
  INCOME = foldKeys(INCOME);
  EXPENSE = foldKeys(EXPENSE);
  TRANSFER = foldKeys(TRANSFER);
  STOP = foldKeys(STOP);
  CURRENCY_WORDS = foldKeys(CURRENCY_WORDS);

  function fail(code) {
    var pair = MESSAGES[code] || MESSAGES['no-amount'];
    return { ok: false, saved: false, code: code, messageEn: pair[0], messageAr: pair[1] };
  }

  function foldDigits(text) {
    var out = '';
    var i, code;
    for (i = 0; i < text.length; i++) {
      code = text.charCodeAt(i);
      if (code >= 0x0660 && code <= 0x0669) out += String(code - 0x0660);
      else if (code >= 0x06F0 && code <= 0x06F9) out += String(code - 0x06F0);
      else if (code === 0x066B) out += '.';
      else if (code === 0x066C) out += ',';
      else out += text.charAt(i);
    }
    return out;
  }

  function fold(text) {
    return String(text)
      .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .toLowerCase();
  }

  function prepare(raw) {
    var text = String(raw == null ? '' : raw).replace(/\u00a0/g, ' ').replace(/[\u200b\u200e\u200f]/g, '');
    text = foldDigits(text);
    text = text.replace(/\u2212/g, '-').replace(/\uFF0B/g, '+');
    text = text.replace(/[،؛]/g, ' ');
    text = text.replace(/ج\.م/g, ' EGP ');
    text = text.replace(/\bgot paid\b/ig, ' received ');
    text = text.replace(/\bpaid me\b/ig, ' received ');
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  }

  function stripPunct(token) {
    return String(token).replace(/^[\s.,!?;:()[\]"'“”«»]+|[\s.,!?;:()[\]"'“”«»]+$/g, '');
  }

  function parseNumeric(body) {
    var s = String(body == null ? '' : body);
    var sign = '';
    if (!s || !/\d/.test(s)) return null;
    if (s.charAt(0) === '+' || s.charAt(0) === '-') {
      sign = s.charAt(0);
      s = s.slice(1);
    }
    if (s.charAt(s.length - 1) === '+' || s.charAt(s.length - 1) === '-') {
      if (sign) return { type: 'broken', reason: 'bad-grouping' };
      sign = s.charAt(s.length - 1);
      s = s.slice(0, s.length - 1);
    }
    if (!s || !/\d/.test(s)) return null;
    if (!/^[\d.,]+$/.test(s)) return { type: 'broken', reason: 'bad-grouping' };
    if ((s.split('.').length - 1) > 1) return { type: 'broken', reason: 'bad-grouping' };
    var dot = s.indexOf('.');
    var intPart = dot >= 0 ? s.slice(0, dot) : s;
    var frac = dot >= 0 ? s.slice(dot + 1) : '';
    if (intPart.indexOf(',') >= 0) {
      if (!/^\d{1,3}(,\d{3})+$/.test(intPart)) return { type: 'broken', reason: 'bad-grouping' };
      intPart = intPart.replace(/,/g, '');
    }
    if (frac.indexOf(',') >= 0) return { type: 'broken', reason: 'bad-grouping' };
    if (intPart === '') intPart = '0';
    if (!/^\d+$/.test(intPart)) return { type: 'broken', reason: 'bad-grouping' };
    if (frac && !/^\d+$/.test(frac)) return { type: 'broken', reason: 'bad-grouping' };
    if (frac.length === 3) return { type: 'broken', reason: 'ambiguous-dot' };
    if (frac.length > 2 && !/^0+$/.test(frac.slice(2))) return { type: 'broken', reason: 'bad-decimals' };
    if (intPart.length > 12) return { type: 'broken', reason: 'too-large' };
    var cents = (frac + '00').slice(0, 2);
    var minor = Number(intPart) * 100 + Number(cents);
    if (!Number.isSafeInteger(minor) || minor > MAX_MINOR) return { type: 'broken', reason: 'too-large' };
    if (minor <= 0) return { type: 'broken', reason: 'zero' };
    return { type: 'amount', minor: minor, sign: sign, currency: null };
  }

  function peel(token) {
    var folded = fold(token);
    var i, word, code, rest;
    for (i = 0; i < AFFIXES.length; i++) {
      word = AFFIXES[i][0];
      code = AFFIXES[i][1];
      if (folded.length <= word.length) continue;
      if (folded.slice(folded.length - word.length) === word) {
        rest = token.slice(0, token.length - word.length);
        if (parseNumeric(rest) && parseNumeric(rest).type === 'amount') return { currency: code, rest: rest };
      }
      if (folded.slice(0, word.length) === word) {
        rest = token.slice(word.length);
        if (parseNumeric(rest) && parseNumeric(rest).type === 'amount') return { currency: code, rest: rest };
      }
    }
    return null;
  }

  function lookup(table, folded) {
    if (table[folded]) return table[folded];
    if (folded.length > 2 && folded.slice(0, 2) === 'ال' && table[folded.slice(2)]) return table[folded.slice(2)];
    return null;
  }

  function categoryOf(folded) {
    var bare = folded.length > 2 && folded.slice(0, 2) === 'ال' ? folded.slice(2) : folded;
    var i, j, words;
    for (i = 0; i < CATEGORY_WORDS.length; i++) {
      words = CATEGORY_WORDS[i][1];
      for (j = 0; j < words.length; j++) {
        if (fold(words[j]) === folded || fold(words[j]) === bare) return CATEGORY_WORDS[i][0];
      }
    }
    return null;
  }

  function foldWord(token) {
    return fold(token).replace(/^[^\u0600-\u06FFa-z0-9]+|[^\u0600-\u06FFa-z0-9]+$/g, '');
  }

  function classify(token) {
    if (token === '+' || token === '\uFF0B') return { type: 'plus' };
    if (token === '-' || token === '\u2212') return { type: 'minus' };
    var cleaned = stripPunct(token);
    if (!cleaned) return { type: 'skip' };
    if (cleaned === '+' || cleaned === '\uFF0B') return { type: 'plus' };
    if (cleaned === '-' || cleaned === '\u2212') return { type: 'minus' };
    var peeled = peel(cleaned);
    if (peeled) {
      var peeledAmount = parseNumeric(peeled.rest);
      if (peeledAmount && peeledAmount.type === 'amount') {
        peeledAmount.currency = peeled.currency;
        return peeledAmount;
      }
    }
    if (/^[+-]?[\d.,]+[+-]?$/.test(cleaned)) {
      var numeric = parseNumeric(cleaned);
      if (numeric) return numeric;
    }
    var folded = foldWord(cleaned);
    if (!folded) return { type: 'skip' };
    var income = lookup(INCOME, folded);
    if (income) return { type: 'income', keep: income.keep, category: income.category };
    if (lookup(EXPENSE, folded)) return { type: 'expense' };
    if (lookup(TRANSFER, folded)) return { type: 'transfer' };
    var currency = lookup(CURRENCY_WORDS, folded);
    if (currency) return { type: 'currency', currency: currency };
    var category = categoryOf(folded);
    if (category) return { type: 'category', category: category };
    if (lookup(STOP, folded)) return { type: 'stop' };
    if (/\d/.test(cleaned)) return { type: 'broken', reason: 'bad-grouping' };
    return { type: 'word' };
  }

  function merchantFrom(tokens) {
    var real = 0;
    var i;
    for (i = 0; i < tokens.length; i++) if (!tokens[i].stop) real++;
    if (!real) return '';
    var words = [];
    for (i = 0; i < tokens.length; i++) if (!tokens[i].stop) words.push(tokens[i].text);
    return words.join(' ').trim();
  }

  function pushMerchant(list, text, stop) {
    var shown = stripPunct(text);
    if (!shown) return;
    list.push({ text: shown, stop: stop ? 1 : 0 });
  }

  function parseQuickEntry(text, options) {
    var currency = options && typeof options.currency === 'string' ? options.currency : 'EGP';
    if (!CURRENCIES[currency]) return fail('currency');
    var occurredAt = options && Number.isSafeInteger(options.now) ? options.now : null;
    var raw = String(text == null ? '' : text);
    if (raw.length > 240) return fail('too-long');
    var prepared = prepare(raw);
    if (!prepared) return fail('empty');
    var parts = prepared.split(' ');
    var amounts = [];
    var broken = null;
    var income = false;
    var expense = false;
    var currencies = [];
    var merchantTokens = [];
    var category = null;
    var transfer = false;
    var i, kind;
    for (i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      kind = classify(parts[i]);
      if (kind.type === 'amount') {
        amounts.push(kind);
        if (kind.sign === '+') income = true;
        if (kind.sign === '-') expense = true;
        if (kind.currency) currencies.push(kind.currency);
      } else if (kind.type === 'broken') {
        if (!broken) broken = kind.reason;
      } else if (kind.type === 'currency') {
        currencies.push(kind.currency);
      } else if (kind.type === 'plus') {
        income = true;
      } else if (kind.type === 'minus') {
        expense = true;
      } else if (kind.type === 'income') {
        income = true;
        if (kind.keep) pushMerchant(merchantTokens, parts[i], false);
        if (kind.category && !category) category = kind.category;
      } else if (kind.type === 'expense') {
        expense = true;
      } else if (kind.type === 'transfer') {
        transfer = true;
        pushMerchant(merchantTokens, parts[i], false);
        if (!category) category = 'Transfers';
      } else if (kind.type === 'category') {
        pushMerchant(merchantTokens, parts[i], false);
        if (!category) category = kind.category;
      } else if (kind.type === 'stop') {
        pushMerchant(merchantTokens, parts[i], true);
      } else if (kind.type === 'word') {
        pushMerchant(merchantTokens, parts[i], false);
      }
    }
    if (amounts.length > 1 || (amounts.length === 1 && broken)) return fail('many-amounts');
    if (!amounts.length) return fail(broken || 'no-amount');
    for (i = 0; i < currencies.length; i++) if (currencies[i] !== currency) return fail('currency');
    if (income && expense) return fail('mixed');
    if (transfer && !income && !expense) return fail('transfer');
    var direction = income ? 'income' : 'expense';
    var merchant = merchantFrom(merchantTokens);
    if (!merchant) return fail('no-label');
    if (merchant.length > 90) merchant = merchant.slice(0, 90);
    if (!category) category = direction === 'income' ? 'Other income' : 'Other';
    return {
      ok: true,
      saved: false,
      draft: {
        amountMinor: amounts[0].minor,
        direction: direction,
        category: category,
        merchant: merchant,
        currency: currency,
        occurredAt: occurredAt
      }
    };
  }

  function parseAmountOnly(text, expectedCurrency) {
    var prepared = prepare(text);
    if (!prepared) return fail('no-amount');
    var parts = prepared.split(' ');
    var amounts = [];
    var broken = null;
    var words = 0;
    var i, kind;
    for (i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      kind = classify(parts[i]);
      if (kind.type === 'amount') {
        amounts.push(kind);
        if (kind.currency && kind.currency !== expectedCurrency) return fail('currency');
      } else if (kind.type === 'broken') {
        if (!broken) broken = kind.reason;
      } else if (kind.type === 'currency') {
        if (kind.currency !== expectedCurrency) return fail('currency');
      } else if (kind.type !== 'skip' && kind.type !== 'plus' && kind.type !== 'minus') {
        words++;
      } else if (kind.type === 'plus' || kind.type === 'minus') {
        words++;
      }
    }
    if (words) return fail('no-amount');
    if (amounts.length !== 1 || broken) return fail(amounts.length > 1 ? 'many-amounts' : (broken || 'no-amount'));
    return { ok: true, minor: amounts[0].minor };
  }

  function confirmQuickEntry(draft, edits) {
    if (!draft || typeof draft !== 'object') return fail('no-amount');
    var changes = edits && typeof edits === 'object' ? edits : {};
    var direction = changes.direction != null ? changes.direction : draft.direction;
    if (direction !== 'income' && direction !== 'expense') return fail('bad-direction');
    var category = changes.category != null ? String(changes.category) : draft.category;
    if (ALL_CATEGORIES.indexOf(category) < 0) return fail('bad-category');
    var amountMinor = draft.amountMinor;
    if (changes.amountText != null) {
      var parsed = parseAmountOnly(changes.amountText, draft.currency);
      if (!parsed.ok) return parsed;
      amountMinor = parsed.minor;
    } else if (changes.amountMinor != null) {
      amountMinor = changes.amountMinor;
    }
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > MAX_MINOR) return fail('no-amount');
    var merchant = changes.merchant != null ? String(changes.merchant) : draft.merchant;
    merchant = String(merchant == null ? '' : merchant).trim();
    if (merchant.length > 90) merchant = merchant.slice(0, 90);
    if (!merchant) return fail('no-merchant');
    var occurredAt = changes.occurredAt != null ? changes.occurredAt : draft.occurredAt;
    if (!Number.isSafeInteger(occurredAt)) return fail('bad-date');
    var reviewedAt = changes.reviewedAt != null ? changes.reviewedAt : null;
    if (reviewedAt != null && !Number.isSafeInteger(reviewedAt)) return fail('bad-date');
    if (!CURRENCIES[draft.currency]) return fail('currency');
    return {
      ok: true,
      saved: false,
      transaction: {
        amountMinor: amountMinor,
        currency: draft.currency,
        direction: direction,
        merchant: merchant,
        category: category,
        occurredAt: occurredAt,
        reviewedAt: reviewedAt,
        source: 'manual',
        status: 'confirmed',
        review: false
      }
    };
  }

  function commitToLedger(transactions, transaction) {
    var list = Array.isArray(transactions) ? transactions : [];
    if (!transaction || transaction.status !== 'confirmed' || transaction.review !== false) {
      return { ok: false, saved: false, transactions: list };
    }
    if (!Number.isSafeInteger(transaction.amountMinor) || transaction.amountMinor <= 0 || transaction.amountMinor > MAX_MINOR) {
      return { ok: false, saved: false, transactions: list };
    }
    if (transaction.direction !== 'income' && transaction.direction !== 'expense') {
      return { ok: false, saved: false, transactions: list };
    }
    var next = list.slice();
    next.push(transaction);
    return { ok: true, saved: true, transactions: next };
  }

  function formatAmountMajor(minor) {
    var abs = Math.abs(Number(minor) || 0);
    var frac = abs % 100;
    var major = (abs - frac) / 100;
    return String(major) + '.' + (frac < 10 ? '0' : '') + String(frac);
  }

  function categoriesFor(direction) {
    return (direction === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).slice();
  }

  return {
    parseQuickEntry: parseQuickEntry,
    confirmQuickEntry: confirmQuickEntry,
    commitToLedger: commitToLedger,
    formatAmountMajor: formatAmountMajor,
    categoriesFor: categoriesFor,
    categories: ALL_CATEGORIES.slice()
  };
});
