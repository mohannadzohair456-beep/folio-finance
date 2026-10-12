/* Folio data layer. No DOM and no network.
   Schema 0 (missing schemaVersion): category budgets are major-unit numbers.
   Schema 1: category budgets are integer minor units (piasters/cents/halalas).
   Schema 2: each transaction has status suggested, confirmed, rejected, or
   duplicate-candidate. Existing rows become confirmed. A notification row
   flagged review:true becomes suggested. Budgets are not converted again.
   Auto-confirm does not rewrite stored statuses. alwaysReviewNotifications
   and balanceObservations are optional and default to off and empty. A bank
   message can note a stated balance; it does not replace a balance the user entered.
   Planning fields monthlyBudgetMinor, monthlyIncomeMinor and reportedBalanceMinor
   were already minor units before schema 1 and are never multiplied again. */
(function (root) {
  'use strict';
  const SCHEMA_VERSION = 2;
  const BUDGET_MINOR_SCHEMA = 1;
  const BALANCE_STALE_MS = 7 * 24 * 60 * 60 * 1000;
  const ACCOUNT_TYPES = { cash: 1, bank: 1, wallet: 1, prepaid: 1, credit: 1 };
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
      balanceUntracked: false,
      accounts: [],
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
      emergencyReserveMinor: null,
      alwaysReviewNotifications: false,
      balanceObservations: []
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

  // A stored ledger is already this person's workspace. A missing onboarding
  // flag must not hide it behind setup, where finishing setup would replace it.
  function storedWorkspaceHasLedger(state) {
    if (!state || typeof state !== 'object') return false;
    if (Array.isArray(state.transactions) && state.transactions.length > 0) return true;
    if (Array.isArray(state.accounts)) {
      for (let i = 0; i < state.accounts.length; i++) {
        const account = state.accounts[i];
        if (account && account.balanceMinor != null && Number.isFinite(Number(account.balanceMinor))) return true;
      }
    }
    if (state.reportedBalanceMinor != null && Number.isFinite(Number(state.reportedBalanceMinor))) return true;
    if (Number(state.monthlyIncomeMinor) > 0) return true;
    if (Number(state.monthlyBudgetMinor) > 0) return true;
    const budgets = state.budgets;
    if (budgets && typeof budgets === 'object') {
      const currencies = Object.keys(budgets);
      for (let i = 0; i < currencies.length; i++) {
        const rows = budgets[currencies[i]];
        if (!rows || typeof rows !== 'object') continue;
        const names = Object.keys(rows);
        for (let j = 0; j < names.length; j++) {
          const amount = Number(rows[names[j]]);
          if (Number.isFinite(amount) && amount !== 0) return true;
        }
      }
    }
    return false;
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
    state.balanceUntracked = input.balanceUntracked === true;
    state.alwaysReviewNotifications = input.alwaysReviewNotifications === true;
    state.balanceObservations = coerceObservations(input.balanceObservations);
    assignAccounts(state, input);

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
    if (state.v2Onboarded !== true && storedWorkspaceHasLedger(state)) state.v2Onboarded = true;
    return { state: state, snapshot: snapshot, migrated: needsMigration };
  }

  function coerceObservations(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (let i = 0; i < list.length && out.length < 30; i++) {
      const row = list[i];
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      const amount = finiteMinor(row.amountMinor);
      const currency = canonicalCurrency(row.currency);
      const at = transactionTime(row.observedAt);
      if (amount == null || !currency || at == null) continue;
      out.push({
        amountMinor: amount,
        currency: currency,
        observedAt: at,
        source: 'notification',
        provenance: 'notification'
      });
    }
    return out;
  }

  function rememberStatedBalance(state, observation) {
    if (!state || !observation) return false;
    const amount = finiteMinor(observation.amountMinor);
    const currency = canonicalCurrency(observation.currency);
    const at = transactionTime(observation.observedAt);
    if (amount == null || !currency || at == null) return false;
    const reported = state.reportedBalanceMinor;
    const reportedAt = state.balanceReportedAt;
    if (!Array.isArray(state.balanceObservations)) state.balanceObservations = [];
    const row = {
      amountMinor: amount,
      currency: currency,
      observedAt: at,
      source: 'notification',
      provenance: 'notification'
    };
    const last = state.balanceObservations[state.balanceObservations.length - 1];
    if (last && last.amountMinor === row.amountMinor && last.currency === row.currency && last.observedAt === row.observedAt) return false;
    state.balanceObservations.push(row);
    if (state.balanceObservations.length > 30) state.balanceObservations = state.balanceObservations.slice(-30);
    state.reportedBalanceMinor = reported;
    state.balanceReportedAt = reportedAt;
    return true;
  }

  function merchantKey(value) {
    return String(value == null ? '' : value).toLowerCase().replace(/[^a-z0-9\u0600-\u06ff ]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function merchantsLooselySame(left, right) {
    const a = merchantKey(left);
    const b = merchantKey(right);
    if (!a || !b) return false;
    if (a === 'card payment' || a === 'incoming transfer' || b === 'card payment' || b === 'incoming transfer') return false;
    if (a === b) return true;
    return a.length >= 4 && b.length >= 4 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0);
  }

  /* High confidence, one clear amount, and not a possible duplicate can be
     confirmed. Everything else stays on the review list. Stored rows are not
     passed through this function during migration. */
  function notificationIntake(transactions, incoming, alwaysReview) {
    const amount = Number(incoming && incoming.amountMinor);
    const direction = incoming && incoming.direction;
    const currency = incoming && incoming.currency;
    const when = transactionTime(incoming && incoming.occurredAt);
    const high = !!(incoming && incoming.confidence === 'high' && incoming.ambiguous !== true && incoming.ambiguous !== 'true');
    let duplicate = false;
    if (Number.isFinite(amount) && when != null && Array.isArray(transactions)) {
      for (let i = 0; i < transactions.length; i++) {
        const row = transactions[i];
        if (!row || row.id === incoming.id) continue;
        if (transactionStatus(row) === 'rejected') continue;
        if (Number(row.amountMinor) !== amount || row.currency !== currency || row.direction !== direction) continue;
        const rowWhen = transactionTime(row.occurredAt);
        if (rowWhen == null || Math.abs(rowWhen - when) > 24 * 60 * 60 * 1000) continue;
        if (merchantsLooselySame(row.merchant, incoming.merchant)) duplicate = true;
      }
    }
    if (duplicate) return { status: 'duplicate-candidate', review: true, autoConfirmed: false };
    if (alwaysReview === true || !high) return { status: 'suggested', review: true, autoConfirmed: false };
    return { status: 'confirmed', review: false, autoConfirmed: true };
  }

  function coerceAccount(entry, index) {
    if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const type = ACCOUNT_TYPES[entry.type] ? entry.type : 'cash';
    const currency = CURRENCIES.indexOf(entry.currency) >= 0 ? entry.currency : null;
    const asOf = transactionTime(entry.asOf);
    const balanceMinor = typeof entry.balanceMinor === 'number' && Number.isSafeInteger(entry.balanceMinor) ? entry.balanceMinor : null;
    return {
      id: typeof entry.id === 'string' && entry.id ? entry.id.slice(0, 80) : 'account-' + index,
      name: typeof entry.name === 'string' ? entry.name.slice(0, 80) : '',
      type: type,
      currency: currency,
      balanceMinor: balanceMinor,
      asOf: asOf,
      provenance: entry.provenance === 'csv' ? 'csv' : 'manual',
      untracked: entry.untracked === true
    };
  }

  function assignAccounts(state, input) {
    if (!Array.isArray(input.accounts)) {
      state.accounts = [];
      if (input.accounts != null) state.legacyAccounts = clone(input.accounts);
      return;
    }
    state.accounts = input.accounts.map(coerceAccount).filter(Boolean);
  }

  function balanceFreshness(record, now) {
    if (!record || record.balanceMinor == null || !Number.isFinite(Number(record.balanceMinor))) return 'unknown';
    const asOf = record.asOf != null ? record.asOf : record.balanceReportedAt;
    if (asOf == null || !Number.isFinite(Number(asOf)) || !Number.isFinite(Number(now))) return 'unknown';
    if (Number(asOf) > Number(now)) return 'unknown';
    if (Number(now) - Number(asOf) > BALANCE_STALE_MS) return 'stale';
    return 'fresh';
  }

  function untrackedMovement(record, transactions) {
    if (record && (record.untracked === true || record.balanceUntracked === true)) return true;
    const asOf = record && (record.asOf != null ? record.asOf : record.balanceReportedAt);
    if (asOf == null || !Number.isFinite(Number(asOf)) || !Array.isArray(transactions)) return false;
    const currency = record.currency;
    return transactions.some(tx => {
      if (!tx || tx.source !== 'notification') return false;
      if (currency && tx.currency && tx.currency !== currency) return false;
      const when = Number(tx.occurredAt);
      return Number.isFinite(when) && when > Number(asOf);
    });
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
      // A spreadsheet is not an account list and does not set a confirmed balance.
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
    balanceFreshness: balanceFreshness,
    untrackedMovement: untrackedMovement,
    transactionStatus: transactionStatus,
    rememberStatedBalance: rememberStatedBalance,
    notificationIntake: notificationIntake,
    summarize: summarize,
    budgetTotalMinor: budgetTotalMinor,
    buildBackup: buildBackup,
    restoreBackup: restoreBackup,
    transactionsFromCsv: transactionsFromCsv
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
