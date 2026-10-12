/* Folio data layer. No DOM and no network.
   Schema 0 (missing schemaVersion): category budgets are major-unit numbers.
   Schema 1: category budgets are integer minor units (piasters/cents/halalas).
   Schema 2: each transaction has status suggested, confirmed, rejected, or
   duplicate-candidate. Existing rows become confirmed. A notification row
   flagged review:true becomes suggested. Budgets are not converted again.
   Planning fields monthlyBudgetMinor, monthlyIncomeMinor and reportedBalanceMinor
   were already minor units before schema 1 and are never multiplied again. */
(function (root) {
  'use strict';
  const SCHEMA_VERSION = 2;
  const BUDGET_MINOR_SCHEMA = 1;
  const STORAGE_KEY = 'folio_finance_v1';
  const SNAPSHOT_KEY = 'folio_finance_premigration_snapshot';
  const RESTORE_SNAPSHOT_KEY = 'folio_finance_pre_restore_snapshot';
  const CURRENCIES = ['EGP', 'USD', 'SAR', 'AED', 'EUR', 'GBP'];
  const DEFAULT_SOURCES = ['com.google.android.apps.messaging', 'com.samsung.android.messaging', 'com.android.mms'];
  const ENVELOPE_KEYS = { folioBackup: 1, exportedAt: 1 };

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function emptyState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      demo: false,
      currency: 'EGP',
      capture: false,
      sources: DEFAULT_SOURCES.slice(),
      budgets: {},
      transactions: [],
      monthlyBudgetMinor: 0,
      monthlyIncomeMinor: 0,
      reportedBalanceMinor: null,
      balanceReportedAt: null,
      v2Onboarded: false,
      legacyUnparsedBudgets: [],
      legacyQueue: [],
      experimentalPaydayRunway: false,
      paydayDate: null,
      paydayAmountMinor: null,
      paydayCurrency: null,
      upcomingBills: null,
      installments: null,
      gameya: null,
      commitments: null,
      savingsReservedMinor: null,
      emergencyReserveMinor: null
    };
  }

  /** Exact major-to-minor conversion for integer and 1–2 decimal strings. */
  function majorToMinor(value) {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return null;
      if (Object.is(value, -0)) return 0;
      if (Number.isInteger(value)) return value * 100;
      return Math.round(value * 100);
    }
    if (value == null) return null;
    const text = String(value).trim().replace(/,/g, '').replace(/\s/g, '');
    if (!text) return null;
    const match = /^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(text);
    if (!match) return null;
    const frac = match[3] || '';
    if (frac.length > 2 && !/^0+$/.test(frac.slice(2))) return null;
    const sign = match[1] === '-' ? -1 : 1;
    const cents = Number(frac.slice(0, 2).padEnd(2, '0') || '0');
    const minor = sign * (Number(match[2]) * 100 + cents);
    return Number.isSafeInteger(minor) ? minor : null;
  }

  function coerceTransaction(entry, index) {
    if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
      return {
        id: 'legacy-' + index,
        merchant: entry == null ? 'Incomplete record' : String(entry).slice(0, 150),
        category: 'Other',
        currency: 'EGP',
        amountMinor: 0,
        occurredAt: 0,
        source: 'legacy',
        incomplete: true,
        status: 'confirmed',
        legacyRaw: entry === undefined ? null : entry
      };
    }
    const copy = Object.assign({}, entry);
    if (copy.id == null || copy.id === '') copy.id = 'legacy-' + index + '-' + (copy.occurredAt || 0);
    if (copy.merchant == null || copy.merchant === '') copy.merchant = 'Transaction';
    if (copy.category == null || copy.category === '') copy.category = 'Other';
    if (copy.source == null || copy.source === '') copy.source = 'manual';
    if (copy.amountMinor == null && copy.amount != null) {
      const minor = majorToMinor(copy.amount);
      if (minor != null) copy.amountMinor = minor;
    }
    if (typeof copy.amountMinor === 'string') {
      const parsedAmount = Number(String(copy.amountMinor).trim());
      if (Number.isSafeInteger(parsedAmount)) copy.amountMinor = parsedAmount;
    }
    const direction = canonicalDirection(copy.direction);
    if (direction && direction !== copy.direction) {
      copy.legacyDirection = copy.direction;
      copy.direction = direction;
    }
    const currency = canonicalCurrency(copy.currency);
    if (currency && currency !== copy.currency) {
      copy.legacyCurrency = copy.currency;
      copy.currency = currency;
    }
    const when = transactionTime(copy.occurredAt);
    if (when != null && when !== copy.occurredAt) {
      copy.legacyOccurredAt = copy.occurredAt;
      copy.occurredAt = when;
    }
    copy.status = transactionStatus(copy);
    return copy;
  }

  function canonicalTxStatus(value) {
    if (typeof value !== 'string') return null;
    const text = value.trim().toLowerCase().replace(/[\s_]+/g, '-');
    if (text === 'suggested' || text === 'unconfirmed') return 'suggested';
    if (text === 'confirmed') return 'confirmed';
    if (text === 'rejected') return 'rejected';
    if (text === 'duplicate-candidate' || text === 'duplicatecandidate') return 'duplicate-candidate';
    return null;
  }

  /* Explicit status wins. Otherwise a notification still flagged for review
     is suggested, and every older row is confirmed. */
  function transactionStatus(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return 'confirmed';
    const explicit = canonicalTxStatus(entry.status);
    if (explicit) return explicit;
    if (entry.source === 'notification' && entry.review === true) return 'suggested';
    return 'confirmed';
  }

  function walkBudgets(budgets, legacy, convert) {
    const out = {};
    if (budgets == null) return out;
    if (typeof budgets !== 'object' || Array.isArray(budgets)) {
      legacy.push({ value: budgets });
      return out;
    }
    Object.keys(budgets).forEach(currency => {
      const cats = budgets[currency];
      const bucket = canonicalCurrency(currency) || currency;
      if (cats == null || typeof cats !== 'object' || Array.isArray(cats)) {
        legacy.push({ currency: currency, value: cats });
        return;
      }
      if (!out[bucket]) out[bucket] = {};
      Object.keys(cats).forEach(cat => {
        const minor = convert(cats[cat]);
        if (minor == null || minor < 0 || !Number.isSafeInteger(minor)) legacy.push({ currency: currency, category: cat, value: cats[cat] });
        else if (Object.prototype.hasOwnProperty.call(out[bucket], cat)) legacy.push({ currency: currency, category: cat, value: cats[cat], reason: 'duplicate-category' });
        else out[bucket][cat] = minor;
      });
    });
    return out;
  }

  function finiteMinor(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isSafeInteger(Math.round(n))) return null;
    return Math.round(n);
  }

  function canonicalCurrency(value) {
    const text = String(value == null ? '' : value).trim().toUpperCase();
    return CURRENCIES.indexOf(text) >= 0 ? text : null;
  }

  /** Epoch millis the v0.2.33 page understood: a number, a numeric string, or a date string. */
  function transactionTime(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
      const time = value.getTime();
      return Number.isFinite(time) ? time : null;
    }
    if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : null;
    const text = String(value).trim().replace(/\u00a0/g, '');
    if (!text) return null;
    if (/^-?\d+(?:\.\d+)?$/.test(text)) {
      const n = Number(text);
      return Number.isFinite(n) ? Math.round(n) : null;
    }
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function canonicalDirection(value) {
    const text = String(value == null ? '' : value).trim().toLowerCase();
    if (text === 'expense' || text === 'debit' || text === 'withdrawal' || text === 'purchase') return 'expense';
    if (text === 'income' || text === 'credit' || text === 'deposit' || text === 'refund') return 'income';
    return '';
  }

  function migrate(input, corruptText) {
    if (typeof corruptText === 'string') {
      return {
        state: emptyState(),
        snapshot: {
          folioSnapshot: 'premigration',
          capturedAt: new Date().toISOString(),
          fromSchema: null,
          reason: 'unparsed',
          raw: corruptText
        },
        migrated: true
      };
    }
    if (input == null) return { state: emptyState(), snapshot: null, migrated: false };
    if (typeof input !== 'object' || Array.isArray(input)) {
      const state = emptyState();
      state.legacyUnparsedTop = input === undefined ? null : clone(input);
      return {
        state: state,
        snapshot: {
          folioSnapshot: 'premigration',
          capturedAt: new Date().toISOString(),
          fromSchema: null,
          reason: 'not-an-object',
          state: clone(input)
        },
        migrated: true
      };
    }

    const fromSchema = Number.isFinite(Number(input.schemaVersion)) ? Number(input.schemaVersion) : 0;
    const legacyDemo = input.demo === true;
    const needsMigration = fromSchema < SCHEMA_VERSION || legacyDemo;
    const snapshot = needsMigration ? {
      folioSnapshot: 'premigration',
      capturedAt: new Date().toISOString(),
      fromSchema: fromSchema,
      toSchema: SCHEMA_VERSION,
      state: clone(input)
    } : null;

    const state = emptyState();
    Object.keys(input).forEach(key => {
      if (Object.prototype.hasOwnProperty.call(emptyState(), key) || ENVELOPE_KEYS[key]) return;
      state[key] = clone(input[key]);
    });

    state.schemaVersion = SCHEMA_VERSION;
    state.demo = false;
    state.currency = CURRENCIES.indexOf(input.currency) >= 0 ? input.currency : 'EGP';
    if (input.currency != null && state.currency !== input.currency) state.legacyCurrency = input.currency;
    state.capture = input.capture === true;
    state.v2Onboarded = input.v2Onboarded === true;
    if (Array.isArray(input.sources)) {
      state.sources = input.sources.filter(item => typeof item === 'string');
      const dropped = input.sources.filter(item => typeof item !== 'string');
      if (dropped.length) state.legacySources = clone(dropped);
    } else if (input.sources == null) {
      state.sources = DEFAULT_SOURCES.slice();
    } else {
      state.sources = DEFAULT_SOURCES.slice();
      state.legacySources = clone(input.sources);
    }

    const balance = input.reportedBalanceMinor;
    if (balance == null || balance === '') state.reportedBalanceMinor = null;
    else {
      const minor = finiteMinor(balance);
      state.reportedBalanceMinor = minor;
      if (minor == null) state.legacyReportedBalance = clone(balance);
    }
    const reportedAt = transactionTime(input.balanceReportedAt);
    state.balanceReportedAt = input.balanceReportedAt == null || input.balanceReportedAt === '' ? null : reportedAt;
    if (input.balanceReportedAt != null && input.balanceReportedAt !== '' && reportedAt == null) {
      state.legacyBalanceReportedAt = clone(input.balanceReportedAt);
    }

    const monthlyBudget = finiteMinor(input.monthlyBudgetMinor);
    state.monthlyBudgetMinor = monthlyBudget == null || monthlyBudget < 0 ? 0 : monthlyBudget;
    if (input.monthlyBudgetMinor != null && state.monthlyBudgetMinor !== monthlyBudget) state.legacyMonthlyBudget = clone(input.monthlyBudgetMinor);
    const monthlyIncome = finiteMinor(input.monthlyIncomeMinor);
    state.monthlyIncomeMinor = monthlyIncome == null || monthlyIncome < 0 ? 0 : monthlyIncome;
    if (input.monthlyIncomeMinor != null && state.monthlyIncomeMinor !== monthlyIncome) state.legacyMonthlyIncome = clone(input.monthlyIncomeMinor);

    const legacyBudgets = Array.isArray(input.legacyUnparsedBudgets) ? clone(input.legacyUnparsedBudgets) : [];
    if (legacyDemo) {
      state.budgets = {};
      if (input.budgets != null) state.legacyDemoBudgets = clone(input.budgets);
    } else if (fromSchema < BUDGET_MINOR_SCHEMA) {
      state.budgets = walkBudgets(input.budgets, legacyBudgets, majorToMinor);
    } else {
      state.budgets = walkBudgets(input.budgets, legacyBudgets, value => {
        const minor = finiteMinor(value);
        return minor == null ? null : minor;
      });
    }
    state.legacyUnparsedBudgets = legacyBudgets;

    const rows = Array.isArray(input.transactions) ? input.transactions : [];
    if (!Array.isArray(input.transactions) && input.transactions != null) state.legacyTransactions = clone(input.transactions);
    state.transactions = rows.map((entry, index) => {
      if (legacyDemo && entry && typeof entry === 'object' && !Array.isArray(entry) && entry.source === 'demo') return null;
      return coerceTransaction(entry, index);
    }).filter(Boolean);
    state.legacyQueue = Array.isArray(input.legacyQueue) ? clone(input.legacyQueue) : [];
    assignRunway(state, input);
    return { state: state, snapshot: snapshot, migrated: needsMigration };
  }

  function strictMinor(value) {
    if (value == null || value === '') return { value: null, invalid: false };
    if (typeof value === 'number' && Number.isSafeInteger(value)) return { value: value, invalid: false };
    return { value: null, invalid: true };
  }

  function assignList(state, input, key, legacyKey) {
    if (input[key] == null) {
      state[key] = null;
      return;
    }
    if (Array.isArray(input[key])) {
      state[key] = clone(input[key]);
      return;
    }
    state[key] = null;
    state[legacyKey] = clone(input[key]);
  }

  function assignNonNegative(state, input, key, legacyKey) {
    const parsed = strictMinor(input[key]);
    if (parsed.invalid || (parsed.value != null && parsed.value < 0)) {
      state[key] = null;
      if (input[key] != null && input[key] !== '') state[legacyKey] = clone(input[key]);
      return;
    }
    state[key] = parsed.value;
  }

  /* Optional payday fields. Null means the user has not answered;
     an empty list means they confirmed there is nothing. */
  function assignRunway(state, input) {
    state.experimentalPaydayRunway = input.experimentalPaydayRunway === true;
    state.paydayDate = typeof input.paydayDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.paydayDate) ? input.paydayDate : null;
    if (input.paydayDate != null && input.paydayDate !== '' && state.paydayDate == null) state.legacyPaydayDate = clone(input.paydayDate);
    const paydayAmount = strictMinor(input.paydayAmountMinor);
    state.paydayAmountMinor = paydayAmount.invalid || paydayAmount.value == null || paydayAmount.value < 0 ? null : paydayAmount.value;
    if (input.paydayAmountMinor != null && input.paydayAmountMinor !== '' && state.paydayAmountMinor == null) state.legacyPaydayAmount = clone(input.paydayAmountMinor);
    state.paydayCurrency = canonicalCurrency(input.paydayCurrency);
    if (input.paydayCurrency != null && input.paydayCurrency !== '' && state.paydayCurrency == null) state.legacyPaydayCurrency = clone(input.paydayCurrency);
    assignList(state, input, 'upcomingBills', 'legacyUpcomingBills');
    assignList(state, input, 'installments', 'legacyInstallments');
    assignList(state, input, 'gameya', 'legacyGameya');
    assignList(state, input, 'commitments', 'legacyCommitments');
    assignNonNegative(state, input, 'savingsReservedMinor', 'legacySavingsReserved');
    assignNonNegative(state, input, 'emergencyReserveMinor', 'legacyEmergencyReserve');
  }

  function summarize(records, primaryCurrency) {
    const primary = primaryCurrency || 'EGP';
    const byCurrency = {};
    (records || []).forEach(entry => {
      if (!entry || typeof entry !== 'object') return;
      const amount = Number(entry.amountMinor);
      if (!Number.isSafeInteger(amount) || amount <= 0) return;
      if (entry.direction !== 'income' && entry.direction !== 'expense') return;
      const currency = entry.currency || '';
      if (!byCurrency[currency]) byCurrency[currency] = { income: 0, expense: 0, net: 0, currency: currency };
      byCurrency[currency][entry.direction] += amount;
      byCurrency[currency].net = byCurrency[currency].income - byCurrency[currency].expense;
    });
    const own = byCurrency[primary] || { income: 0, expense: 0, net: 0, currency: primary };
    return {
      income: own.income,
      expense: own.expense,
      net: own.net,
      currency: primary,
      byCurrency: byCurrency
    };
  }

  function budgetTotalMinor(limits) {
    if (!limits || typeof limits !== 'object') return 0;
    return Object.keys(limits).reduce((sum, key) => {
      const n = Number(limits[key]);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
  }

  function buildBackup(state) {
    const copy = clone(state || emptyState());
    copy.folioBackup = 1;
    copy.schemaVersion = SCHEMA_VERSION;
    copy.exportedAt = new Date().toISOString();
    return copy;
  }

  function restoreBackup(text) {
    if (typeof text !== 'string' || text.length > 2000000) throw Error('Backup is too large (2 MB maximum).');
    const trimmed = text.replace(/^\uFEFF/, '').trim();
    if (!trimmed) throw Error('Backup file is empty.');
    if (trimmed.charAt(0) !== '{' && trimmed.charAt(0) !== '[') {
      throw Error('This is not a Folio JSON backup. Use Import CSV for a transaction spreadsheet so balances and budgets are kept.');
    }
    let parsed;
    try { parsed = JSON.parse(trimmed); }
    catch (e) { throw Error('Backup file is not valid JSON.'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('Backup file must be a Folio JSON object.');
    const looksLikeFolio = parsed.folioBackup === 1 || Array.isArray(parsed.transactions) || (parsed.budgets && typeof parsed.budgets === 'object');
    if (!looksLikeFolio) throw Error('Backup file is missing Folio data.');
    return migrate(parsed, null).state;
  }

  function csvRows(text, delimiter) {
    if (typeof text !== 'string' || text.length > 2000000) throw Error('CSV is too large (2 MB maximum).');
    const rows = [];
    let row = [];
    let field = '';
    let inside = false;
    const csv = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < csv.length; i++) {
      const ch = csv.charAt(i);
      if (ch === '"') {
        if (inside && csv.charAt(i + 1) === '"') { field += '"'; i++; }
        else if (inside) inside = false;
        else if (field === '') inside = true;
        else throw Error('Invalid quote in CSV');
      } else if (ch === delimiter && !inside) {
        row.push(field);
        field = '';
      } else if ((ch === '\r' || ch === '\n') && !inside) {
        row.push(field);
        if (row.some(value => String(value).trim())) rows.push(row);
        row = [];
        field = '';
        if (ch === '\r' && csv.charAt(i + 1) === '\n') i++;
      } else field += ch;
    }
    if (inside) throw Error('Unclosed quoted field in CSV');
    row.push(field);
    if (row.some(value => String(value).trim())) rows.push(row);
    return rows;
  }

  function headerIndex(rows) {
    return rows.findIndex(row => {
      const cols = row.map(value => String(value).trim().toLowerCase());
      const hasDate = cols.indexOf('date') >= 0 || cols.indexOf('transaction date') >= 0;
      const hasAmount = cols.indexOf('amount') >= 0 || cols.indexOf('value') >= 0;
      const hasWho = cols.indexOf('merchant') >= 0 || cols.indexOf('description') >= 0 || cols.indexOf('name') >= 0;
      return hasDate && hasAmount && hasWho;
    });
  }

  function columnMap(header) {
    const cols = header.map(value => String(value).trim().toLowerCase());
    function pick(names) {
      for (let i = 0; i < names.length; i++) {
        const at = cols.indexOf(names[i]);
        if (at >= 0) return at;
      }
      return -1;
    }
    return {
      date: pick(['date', 'transaction date', 'day']),
      direction: pick(['direction', 'type']),
      merchant: pick(['merchant', 'description', 'name', 'payee']),
      category: pick(['category', 'cat']),
      amount: pick(['amount', 'value']),
      currency: pick(['currency', 'ccy']),
      source: pick(['source']),
      sourcePackage: pick(['source package', 'sourcepackage', 'source_package', 'package'])
    };
  }

  function parseCalendarDate(day) {
    day = String(day == null ? '' : day).trim().replace(/\u00a0/g, '');
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    const slash = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(day);
    let year;
    let month;
    let date;
    if (iso) {
      year = Number(iso[1]);
      month = Number(iso[2]);
      date = Number(iso[3]);
    } else if (slash) {
      // Older spreadsheets saved by Excel in Egypt use day/month/year.
      date = Number(slash[1]);
      month = Number(slash[2]);
      year = Number(slash[3]);
    } else if (/^\d{5}(?:\.0+)?$/.test(String(day).trim())) {
      // Excel day count since 1899-12-30, including the fictional 1900-02-29.
      const serial = Number(day);
      const utc = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      year = utc.getUTCFullYear();
      month = utc.getUTCMonth() + 1;
      date = utc.getUTCDate();
    } else return null;
    if (month < 1 || month > 12 || date < 1 || date > 31 || year < 1970 || year > 2100) return null;
    const local = new Date(year, month - 1, date, 12, 0, 0, 0);
    if (local.getFullYear() !== year || local.getMonth() !== month - 1 || local.getDate() !== date) return null;
    return local.getTime();
  }

  function parseDirection(value) {
    const text = String(value || '').trim().toLowerCase();
    if (text === 'expense' || text === 'debit' || text === 'withdrawal' || text === 'purchase') return 'expense';
    if (text === 'income' || text === 'credit' || text === 'deposit' || text === 'refund') return 'income';
    return '';
  }

  function parseAmountCell(raw) {
    let text = String(raw == null ? '' : raw).trim().replace(/\u00a0/g, '');
    text = text.replace(/^(?:EGP|USD|SAR|AED|EUR|GBP|LE|SR)\s*/i, '').replace(/\s*(?:EGP|USD|SAR|AED|EUR|GBP|LE|SR)$/i, '');
    if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(text)) text = text.replace(/,/g, '');
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
    const minor = majorToMinor(text);
    if (minor == null || minor <= 0 || minor > 10000000000) return null;
    return minor;
  }

  function transactionsFromCsv(csv) {
    if (typeof csv === 'string' && csv.replace(/^\uFEFF/, '').trim().charAt(0) === '{') {
      throw Error('This is a JSON backup. Use Import JSON backup.');
    }
    let chosen = null;
    const errors = [];
    [',', ';', '\t'].forEach(delimiter => {
      if (chosen) return;
      try {
        const parsed = csvRows(csv, delimiter);
        const at = headerIndex(parsed);
        if (at >= 0) chosen = { rows: parsed.slice(at), delimiter: delimiter };
      } catch (e) { errors.push(e.message); }
    });
    if (!chosen) throw Error(errors[0] || 'This file does not have the expected Folio CSV columns.');
    const rows = chosen.rows;
    if (rows.length < 2 || rows.length > 3001) throw Error('Choose a Folio CSV containing 1–3000 transactions.');
    const columns = columnMap(rows[0]);
    if (columns.date < 0 || columns.merchant < 0 || columns.amount < 0 || columns.currency < 0) {
      throw Error('This file does not have the expected Folio CSV columns.');
    }
    let hash = 2166136261;
    for (let i = 0; i < csv.length; i++) hash = Math.imul(hash ^ csv.charCodeAt(i), 16777619) >>> 0;
    const fileTag = hash.toString(16);
    const records = [];
    for (let i = 1; i < rows.length; i++) {
      const line = rows[i];
      const cell = name => {
        const at = columns[name];
        return at < 0 ? '' : String(line[at] == null ? '' : line[at]).trim();
      };
      const day = cell('date');
      const when = parseCalendarDate(day);
      const direction = columns.direction < 0 ? '' : parseDirection(cell('direction'));
      const merchant = cell('merchant');
      const category = cell('category');
      const currency = cell('currency').toUpperCase();
      const amountMinor = parseAmountCell(cell('amount'));
      if (when == null) throw Error('Invalid transaction date at row ' + (i + 1));
      if (!direction) throw Error('Unsupported direction at row ' + (i + 1));
      if (CURRENCIES.indexOf(currency) < 0) throw Error('Unsupported currency or direction at row ' + (i + 1));
      if (amountMinor == null) throw Error('Invalid amount at row ' + (i + 1));
      if (merchant.length > 150 || category.length > 100) throw Error('Invalid merchant or category at row ' + (i + 1));
      records.push({
        id: 'csv-' + fileTag + '-' + i,
        merchant: merchant || 'Transaction',
        category: category || 'Other',
        direction: direction,
        currency: currency,
        amountMinor: amountMinor,
        occurredAt: when,
        source: 'import',
        sourcePackage: cell('sourcePackage').slice(0, 140),
        importedSource: cell('source').slice(0, 40),
        status: 'confirmed'
      });
    }
    return records;
  }

  root.FolioData = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    STORAGE_KEY: STORAGE_KEY,
    SNAPSHOT_KEY: SNAPSHOT_KEY,
    RESTORE_SNAPSHOT_KEY: RESTORE_SNAPSHOT_KEY,
    CURRENCIES: CURRENCIES,
    emptyState: emptyState,
    majorToMinor: majorToMinor,
    transactionTime: transactionTime,
    migrate: migrate,
    transactionStatus: transactionStatus,
    summarize: summarize,
    budgetTotalMinor: budgetTotalMinor,
    buildBackup: buildBackup,
    restoreBackup: restoreBackup,
    transactionsFromCsv: transactionsFromCsv
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
