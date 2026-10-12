/* Payday Money Runway. Experimental, deterministic, no DOM and no network.
   Integer minor units only. Cairo civil dates. Never converts currency.
   Incomplete or stale inputs return status "insufficient data" and no amount. */
(function (root) {
  'use strict';

  var STALE_AFTER_MS = 48 * 60 * 60 * 1000;
  var DAY_MS = 86400000;

  function isInt(value) {
    return typeof value === 'number' && Number.isSafeInteger(value);
  }

  function addCode(list, code) {
    if (list.indexOf(code) < 0) list.push(code);
  }

  function sortCodes(list) {
    var copy = list.slice();
    copy.sort();
    return copy;
  }

  function lastWeekday(year, monthIndex, weekday) {
    var last = new Date(Date.UTC(year, monthIndex + 1, 0));
    var delta = (last.getUTCDay() - weekday + 7) % 7;
    return last.getUTCDate() - delta;
  }

  /* Africa/Cairo without Intl, so API 26 tzdata cannot move the date.
     2011-2022: UTC+2 all year. From 2023: UTC+3 from the last Friday of April
     at 00:00 UTC+2 until the last Thursday of October at 24:00 UTC+3. */
  function cairoOffsetMinutes(utcMs) {
    if (!isInt(utcMs)) return null;
    var year = new Date(utcMs).getUTCFullYear();
    if (year < 2011 || year > 2099) return null;
    if (year < 2023) return 120;
    var utcStart = Date.UTC(year, 3, lastWeekday(year, 3, 5), 0, 0, 0) - 2 * 60 * 60000;
    var utcEnd = Date.UTC(year, 9, lastWeekday(year, 9, 4) + 1, 0, 0, 0) - 3 * 60 * 60000;
    if (utcMs >= utcStart && utcMs < utcEnd) return 180;
    return 120;
  }

  function cairoParts(utcMs) {
    var offset = cairoOffsetMinutes(utcMs);
    if (offset == null) return null;
    var shifted = new Date(utcMs + offset * 60000);
    var year = shifted.getUTCFullYear();
    var month = shifted.getUTCMonth() + 1;
    var day = shifted.getUTCDate();
    return {
      year: year,
      month: month,
      day: day,
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
      offset: offset,
      ymd: year * 10000 + month * 100 + day,
      iso: year + '-' + pad2(month) + '-' + pad2(day)
    };
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function parseYmd(text) {
    if (typeof text !== 'string') return null;
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!match) return null;
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    if (month < 1 || month > 12) return null;
    var utc = Date.UTC(year, month - 1, day);
    var check = new Date(utc);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
    return { year: year, month: month, day: day, ymd: year * 10000 + month * 100 + day, iso: text };
  }

  function civilIndex(parts) {
    return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS);
  }

  /* Floor, including negatives. Truncation would turn -100001/5 into -20000. */
  function floorDiv(n, d) {
    var q = Math.trunc(n / d);
    if (q * d === n || n >= 0) return q;
    return q - 1;
  }

  function addInt(a, b) {
    var sum = a + b;
    return Number.isSafeInteger(sum) ? sum : null;
  }

  function normalizeCurrency(value) {
    if (typeof value !== 'string') return null;
    var text = value.replace(/^\s+|\s+$/g, '').toUpperCase();
    if (!/^[A-Z]{3}$/.test(text)) return null;
    return text;
  }

  function own(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function pickList(src, keys) {
    var found = false;
    var value = null;
    var conflict = false;
    var invalid = false;
    var i;
    for (i = 0; i < keys.length; i++) {
      if (!own(src, keys[i])) continue;
      var raw = src[keys[i]];
      if (raw == null) continue;
      if (!Array.isArray(raw)) { invalid = true; continue; }
      if (!found) { found = true; value = raw; }
      else if (JSON.stringify(value) !== JSON.stringify(raw)) conflict = true;
    }
    return { present: found && !conflict && !invalid, value: found ? value : null, conflict: conflict, invalid: invalid };
  }

  function pickInt(src, keys) {
    var found = false;
    var value = null;
    var conflict = false;
    var invalid = false;
    var i;
    for (i = 0; i < keys.length; i++) {
      if (!own(src, keys[i])) continue;
      var raw = src[keys[i]];
      if (raw == null || raw === '') continue;
      if (!isInt(raw)) { invalid = true; continue; }
      if (!found) { found = true; value = raw; }
      else if (value !== raw) conflict = true;
    }
    return { present: found && !conflict && !invalid, value: found && !conflict && !invalid ? value : null, conflict: conflict, invalid: invalid };
  }

  function firstString(obj, keys) {
    var i;
    for (i = 0; i < keys.length; i++) {
      if (own(obj, keys[i]) && obj[keys[i]] != null && obj[keys[i]] !== '') return obj[keys[i]];
    }
    return null;
  }

  function emptyResult(currency, missing, excluded, payday, extra) {
    var side = extra || {};
    return {
      status: 'insufficient data',
      currency: currency,
      safe_to_spend_minor: null,
      available_now_minor: null,
      per_day_minor: null,
      days: null,
      calendar_days: null,
      remainder_minor: null,
      breakdown: [],
      bills_due: [],
      unconfirmed_transactions: side.unconfirmedTransactions || [],
      unconfirmed_count: (side.unconfirmedTransactions || []).length,
      unconfirmed_net_minor: null,
      unconfirmed_commitments: side.unconfirmedCommitments || [],
      missing: sortCodes(missing),
      excluded: excluded,
      payday: payday
    };
  }

  var KINDS = { rent: 1, installment: 1, family: 1, utility: 1, subscription: 1, other: 1 };

  function normalizeKind(value) {
    if (typeof value !== 'string') return null;
    var text = value.replace(/^\s+|\s+$/g, '').toLowerCase();
    if (text === "gam'eya" || text === 'gameya' || text === 'gam3eya' || text === 'gam’eya') return "gam'eya";
    if (KINDS[text]) return text;
    return null;
  }

  function paidState(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.paid === true) return true;
    if (raw.paid === false) return false;
    if (typeof raw.status === 'string') {
      var status = raw.status.toLowerCase();
      if (status === 'paid') return true;
      if (status === 'unpaid') return false;
    }
    return null;
  }

  function userConfirmed(raw) {
    if (raw.confirmed === true || raw.userConfirmed === true) return true;
    if (raw.confirmed === false || raw.userConfirmed === false) return false;
    return null;
  }

  function isInflow(raw) {
    var flow = raw.flow || raw.event || raw.role;
    if (typeof flow === 'string') {
      var name = flow.toLowerCase();
      if (name === 'payout' || name === 'pay-out' || name === 'inflow') return true;
      if (name === 'pay-in' || name === 'contribution' || name === 'outflow') return false;
    }
    if (raw.payout === true) return true;
    if (raw.direction === 'inflow' || raw.direction === 'income') return true;
    return false;
  }

  function isEstimated(raw) {
    if (raw.amountEstimated === true || raw.estimated === true) return true;
    if (typeof raw.amountKind === 'string' && raw.amountKind.toLowerCase() === 'estimated') return true;
    return false;
  }

  function txnReviewState(tx) {
    var status = typeof tx.status === 'string' ? tx.status.toLowerCase() : '';
    if (status === 'rejected') return 'rejected';
    if (status === 'duplicate-candidate' || status === 'duplicate_candidate') return 'duplicate_candidate';
    if (status === 'suggested' || status === 'unconfirmed') return 'unconfirmed';
    if (status === 'confirmed') return 'confirmed';
    if (tx.review === true || tx.confirmed === false) return 'unconfirmed';
    if (tx.source === 'notification' && tx.review !== false && tx.confirmed !== true) return 'unconfirmed';
    return 'confirmed';
  }

  function obligationId(raw) {
    if (raw.id == null || raw.id === '') return null;
    return String(raw.id);
  }

  function obligationAmount(raw) {
    var hasMinor = own(raw, 'amountMinor') && raw.amountMinor != null;
    var hasSnake = own(raw, 'amount_minor') && raw.amount_minor != null;
    if (hasMinor && hasSnake && raw.amountMinor !== raw.amount_minor) return undefined;
    if (hasMinor) return raw.amountMinor;
    if (hasSnake) return raw.amount_minor;
    return null;
  }

  function dueParts(raw, missing) {
    var keys = ['due', 'dueDate', 'due_on', 'date', 'due_at', 'dueAt'];
    var rawDue = null;
    var foundDue = false;
    var dueKey;
    for (dueKey = 0; dueKey < keys.length; dueKey++) {
      if (!own(raw, keys[dueKey]) || raw[keys[dueKey]] == null || raw[keys[dueKey]] === '') continue;
      if (!foundDue) { foundDue = true; rawDue = raw[keys[dueKey]]; }
      else if (String(rawDue) !== String(raw[keys[dueKey]])) {
        addCode(missing, 'invalid_obligation');
        return null;
      }
    }
    if (typeof rawDue === 'string') {
      var parsed = parseYmd(rawDue);
      if (!parsed) { addCode(missing, 'invalid_obligation'); return null; }
      return parsed;
    }
    if (isInt(rawDue)) {
      var parts = cairoParts(rawDue);
      if (!parts) { addCode(missing, 'unsupported_clock'); return null; }
      return parts;
    }
    addCode(missing, 'invalid_obligation');
    return null;
  }

  function isPaid(raw) {
    if (raw.paid === true) return true;
    if (typeof raw.status === 'string' && raw.status.toLowerCase() === 'paid') return true;
    return false;
  }

  function paidAtMs(raw) {
    var found = false;
    var value = null;
    var keys = ['paidAt', 'paid_at'];
    var i;
    for (i = 0; i < keys.length; i++) {
      if (!own(raw, keys[i]) || raw[keys[i]] == null || raw[keys[i]] === '') continue;
      if (!found) { found = true; value = raw[keys[i]]; }
      else if (value !== raw[keys[i]]) return undefined;
    }
    if (!found) return null;
    if (!isInt(value)) return undefined;
    return value;
  }

  function linkedToCounted(raw, counted) {
    var ids = raw.linkedPaymentIds || raw.linked_payment_ids;
    if (!Array.isArray(ids)) return false;
    var i;
    for (i = 0; i < ids.length; i++) {
      if (ids[i] != null && counted[String(ids[i])]) return true;
    }
    return false;
  }

  function feeToAdd(raw) {
    var fee = own(raw, 'feeMinor') ? raw.feeMinor : raw.fee_minor;
    if (fee == null || fee === '') return 0;
    if (!isInt(fee) || fee < 0) return null;
    if (raw.feePaid === true || raw.fee_paid === true) return 0;
    return fee;
  }

  function considerOne(raw, kind, currency, paydayYmd, snapshotAt, seenIds, counted, missing, excluded, billsDue, sums, unconfirmedCommitments) {
    var id = obligationId(raw);
    if (id != null) {
      if (seenIds[id]) addCode(missing, 'duplicate_obligation');
      seenIds[id] = 1;
    }
    var amount = obligationAmount(raw);
    var rowCurrency = normalizeCurrency(raw.currency);
    var due = dueParts(raw, missing);
    if (!due) return;
    if (!isInt(amount) || amount < 0 || !rowCurrency) {
      addCode(missing, 'invalid_commitment');
      return;
    }
    var pot = own(raw, 'potMinor') ? raw.potMinor : raw.pot_minor;
    if (pot != null && pot !== '' && !isInt(pot)) {
      addCode(missing, 'invalid_commitment');
      return;
    }
    var label = firstString(raw, ['title', 'label', 'name', 'merchant']);
    if (typeof label !== 'string' || !label) label = kind;
    var item = {
      id: id,
      kind: kind,
      label: label,
      amount_minor: amount,
      currency: rowCurrency,
      due: due.iso,
      included: false
    };
    if (kind === "gam'eya" && isInflow(raw)) {
      item.reason = raw.received === true ? 'payout_not_added' : 'unreceived_payout';
      item.pot_minor = isInt(pot) ? pot : null;
      item.included = false;
      excluded.push(item);
      var payoutNext = addInt(sums.payout, amount);
      if (payoutNext == null) addCode(missing, 'invalid_amount');
      else sums.payout = payoutNext;
      return;
    }
    if (paidState(raw) === true) {
      var paidAt = paidAtMs(raw);
      if (paidAt === undefined) {
        addCode(missing, 'invalid_commitment');
        return;
      }
      item.paid_at = paidAt;
      if (linkedToCounted(raw, counted)) {
        item.reason = 'already_in_ledger';
        excluded.push(item);
        return;
      }
      if (paidAt != null && snapshotAt != null && paidAt <= snapshotAt) {
        item.reason = 'paid';
        excluded.push(item);
        return;
      }
      item.reason = 'unreconciled_paid_commitment';
      excluded.push(item);
      addCode(missing, 'unreconciled_paid_commitment');
      return;
    }
    if (paydayYmd != null && due.ymd > paydayYmd) {
      item.reason = 'due_after_payday';
      excluded.push(item);
      return;
    }
    if (rowCurrency !== currency) {
      item.reason = 'foreign_obligation';
      excluded.push(item);
      addCode(missing, 'foreign_obligation');
      return;
    }
    if (userConfirmed(raw) !== true) {
      item.reason = 'unconfirmed_commitment';
      unconfirmedCommitments.push(item);
      excluded.push(item);
      addCode(missing, 'unconfirmed_commitment');
      return;
    }
    if (isEstimated(raw)) {
      item.reason = 'estimated_obligation';
      excluded.push(item);
      addCode(missing, 'estimated_obligation');
      return;
    }
    if (linkedToCounted(raw, counted)) {
      item.reason = 'already_in_ledger';
      excluded.push(item);
      return;
    }
    if (paidState(raw) !== false) {
      addCode(missing, 'invalid_commitment');
      return;
    }
    var fee = feeToAdd(raw);
    if (fee == null) {
      addCode(missing, 'invalid_commitment');
      return;
    }
    var charge = addInt(amount, fee);
    if (charge == null) {
      addCode(missing, 'invalid_amount');
      return;
    }
    item.amount_minor = charge;
    item.fee_minor = fee;
    item.included = true;
    billsDue.push(item);
    var next = addInt(sums[kind], charge);
    if (next == null) addCode(missing, 'invalid_amount');
    else sums[kind] = next;
  }

  function considerCommitment(raw, currency, paydayYmd, snapshotAt, seenIds, counted, missing, excluded, billsDue, sums, unconfirmedCommitments) {
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      addCode(missing, 'invalid_commitment');
      return;
    }
    var kind = normalizeKind(raw.kind);
    if (!kind) {
      addCode(missing, 'invalid_commitment');
      return;
    }
    if (Array.isArray(raw.schedule) && raw.schedule.length) {
      var parentId = obligationId(raw);
      if (parentId != null) {
        if (seenIds[parentId]) addCode(missing, 'duplicate_obligation');
        seenIds[parentId] = 1;
      }
      var s;
      for (s = 0; s < raw.schedule.length; s++) {
        var row = raw.schedule[s];
        if (row == null || typeof row !== 'object' || Array.isArray(row)) {
          addCode(missing, 'invalid_commitment');
          continue;
        }
        var childId = row.id != null && row.id !== '' ? row.id : (parentId ? parentId + '#' + (s + 1) : null);
        considerOne({
          id: childId,
          title: row.title || row.label || raw.title || raw.label,
          kind: kind,
          currency: row.currency || raw.currency,
          amountMinor: own(row, 'amountMinor') || own(row, 'amount_minor') ? (own(row, 'amountMinor') ? row.amountMinor : row.amount_minor) : null,
          due: row.due || row.dueDate || row.date,
          due_at: own(row, 'due_at') ? row.due_at : raw.due_at,
          dueAt: own(row, 'dueAt') ? row.dueAt : raw.dueAt,
          paid: own(row, 'paid') ? row.paid : raw.paid,
          status: row.status || raw.status,
          confirmed: own(row, 'confirmed') ? row.confirmed : raw.confirmed,
          userConfirmed: raw.userConfirmed,
          flow: row.flow || row.event || raw.flow || raw.event || raw.role,
          payout: row.payout === true || raw.payout === true,
          direction: row.direction || raw.direction,
          received: own(row, 'received') ? row.received : raw.received,
          potMinor: own(row, 'potMinor') ? row.potMinor : raw.potMinor,
          feeMinor: own(row, 'feeMinor') ? row.feeMinor : raw.feeMinor,
          feePaid: own(row, 'feePaid') ? row.feePaid : raw.feePaid,
          amountEstimated: row.amountEstimated === true || raw.amountEstimated === true || row.estimated === true || raw.estimated === true,
          amountKind: row.amountKind || raw.amountKind,
          linkedPaymentIds: row.linkedPaymentIds || raw.linkedPaymentIds,
          linked_payment_ids: row.linked_payment_ids || raw.linked_payment_ids,
          paidAt: own(row, 'paidAt') ? row.paidAt : raw.paidAt,
          paid_at: own(row, 'paid_at') ? row.paid_at : raw.paid_at
        }, kind, currency, paydayYmd, snapshotAt, seenIds, counted, missing, excluded, billsDue, sums, unconfirmedCommitments);
      }
      return;
    }
    considerOne(raw, kind, currency, paydayYmd, snapshotAt, seenIds, counted, missing, excluded, billsDue, sums, unconfirmedCommitments);
  }

  function txnTime(tx) {
    var hasAt = own(tx, 'occurredAt') && tx.occurredAt != null;
    var hasSnake = own(tx, 'occurred_at') && tx.occurred_at != null;
    if (hasAt && hasSnake && tx.occurredAt !== tx.occurred_at) return undefined;
    if (hasAt) return tx.occurredAt;
    if (hasSnake) return tx.occurred_at;
    return null;
  }

  function txnAmount(tx) {
    var hasMinor = own(tx, 'amountMinor') && tx.amountMinor != null;
    var hasSnake = own(tx, 'amount_minor') && tx.amount_minor != null;
    if (hasMinor && hasSnake && tx.amountMinor !== tx.amount_minor) return undefined;
    if (hasMinor) return tx.amountMinor;
    if (hasSnake) return tx.amount_minor;
    return null;
  }

  function isTransfer(tx) {
    if (tx.transfer === true) return true;
    if (tx.direction === 'transfer') return true;
    if (typeof tx.category === 'string' && tx.category.toLowerCase() === 'transfers') return true;
    return false;
  }

  function considerTransaction(tx, currency, snapshotAt, nowMs, seenIds, missing, excluded, sums) {
    if (tx == null || typeof tx !== 'object' || Array.isArray(tx)) {
      addCode(missing, 'invalid_transaction');
      return;
    }
    var id = tx.id == null || tx.id === '' ? null : String(tx.id);
    if (id != null) {
      if (seenIds[id]) addCode(missing, 'duplicate_transaction');
      seenIds[id] = 1;
    }
    var at = txnTime(tx);
    if (!isInt(at)) {
      addCode(missing, 'invalid_transaction');
      return;
    }
    if (at < snapshotAt) {
      sums.before += 1;
      return;
    }
    if (at === snapshotAt) {
      sums.at += 1;
      return;
    }
    var amount = txnAmount(tx);
    var rowCurrency = normalizeCurrency(tx.currency);
    var review = txnReviewState(tx);
    if (review === 'confirmed' && nowMs != null && at > nowMs) {
      addCode(missing, 'future_transaction');
      excluded.push({
        reason: 'future_transaction',
        id: id,
        amount_minor: isInt(amount) ? amount : null,
        currency: rowCurrency,
        direction: tx.direction || null,
        occurred_at: at
      });
      return;
    }
    if (review !== 'confirmed') {
      if (!isInt(amount) || amount < 0 || !rowCurrency) {
        addCode(missing, 'invalid_transaction');
        return;
      }
      if (!isTransfer(tx) && tx.direction !== 'income' && tx.direction !== 'expense') {
        addCode(missing, 'invalid_transaction');
        return;
      }
      if (review === 'unconfirmed' && !isTransfer(tx) && rowCurrency === currency) {
        var pendingSigned = tx.direction === 'income' ? amount : -amount;
        var pendingNext = addInt(sums.unconfirmedNet, pendingSigned);
        if (pendingNext == null) addCode(missing, 'invalid_amount');
        else sums.unconfirmedNet = pendingNext;
      }
      var pending = {
        reason: review,
        id: id,
        amount_minor: amount,
        currency: rowCurrency,
        direction: tx.direction || null,
        occurred_at: at,
        source: tx.source || null
      };
      sums.unconfirmed.push(pending);
      excluded.push(pending);
      return;
    }
    if (isTransfer(tx)) {
      excluded.push({ reason: 'transfer', id: id, occurred_at: at });
      return;
    }
    if (!isInt(amount) || amount < 0) {
      addCode(missing, 'invalid_transaction');
      return;
    }
    if (!rowCurrency) {
      addCode(missing, 'invalid_transaction');
      return;
    }
    if (rowCurrency !== currency) {
      excluded.push({ reason: 'other_currency', id: id, amount_minor: amount, currency: rowCurrency, occurred_at: at });
      return;
    }
    if (tx.direction !== 'income' && tx.direction !== 'expense') {
      addCode(missing, 'invalid_transaction');
      return;
    }
    var signed = tx.direction === 'income' ? amount : -amount;
    var next = addInt(sums.net, signed);
    if (next == null) addCode(missing, 'invalid_amount');
    else {
      sums.net = next;
      if (id) sums.counted[id] = 1;
    }
  }

  function evaluate(input) {
    var src = input && typeof input === 'object' ? input : {};
    var missing = [];
    var excluded = [];
    var currency = normalizeCurrency(src.currency);
    if (!currency) addCode(missing, 'currency');

    var now = pickInt(src, ['now']);
    if (now.invalid || now.conflict) addCode(missing, 'now');
    else if (!now.present) addCode(missing, 'now');
    else if (cairoOffsetMinutes(now.value) == null) addCode(missing, 'unsupported_clock');

    var balance = pickInt(src, ['reportedBalanceMinor', 'self_reported_balance_minor']);
    if (balance.invalid || balance.conflict) addCode(missing, 'reported_balance');
    else if (!balance.present) addCode(missing, 'reported_balance');

    var reportedAt = pickInt(src, ['balanceReportedAt', 'self_reported_at']);
    if (reportedAt.invalid || reportedAt.conflict) addCode(missing, 'balance_reported_at');
    else if (!reportedAt.present) addCode(missing, 'balance_reported_at');
    else if (cairoOffsetMinutes(reportedAt.value) == null && now.present) addCode(missing, 'unsupported_clock');

    var txList = pickList(src, ['transactions']);
    if (txList.invalid || txList.conflict || !txList.present) addCode(missing, 'transactions');

    var payday = null;
    var paydayText = null;
    if (!own(src, 'paydayDate') && !own(src, 'payday_date')) addCode(missing, 'payday_date');
    else {
      paydayText = own(src, 'paydayDate') && src.paydayDate != null && src.paydayDate !== '' ? src.paydayDate : src.payday_date;
      if (paydayText == null || paydayText === '') addCode(missing, 'payday_date');
      else {
        payday = parseYmd(paydayText);
        if (!payday) addCode(missing, 'payday_date');
      }
    }

    var paydayAmount = pickInt(src, ['paydayAmountMinor', 'payday_amount_minor']);
    if (paydayAmount.invalid || paydayAmount.conflict || !paydayAmount.present || paydayAmount.value < 0) addCode(missing, 'payday_amount');

    var paydayCurrency = null;
    var paydayCurrencyRaw = own(src, 'paydayCurrency') ? src.paydayCurrency : (own(src, 'payday_currency') ? src.payday_currency : null);
    if (!own(src, 'paydayCurrency') && !own(src, 'payday_currency')) addCode(missing, 'payday_currency');
    else if (paydayCurrencyRaw == null || paydayCurrencyRaw === '') addCode(missing, 'payday_currency');
    else {
      paydayCurrency = normalizeCurrency(paydayCurrencyRaw);
      if (!paydayCurrency) addCode(missing, 'payday_currency');
      else if (currency && paydayCurrency !== currency) addCode(missing, 'payday_currency_mismatch');
    }

    var staleField = pickInt(src, ['staleAfterDays', 'stale_after_days']);
    var staleMs = STALE_AFTER_MS;
    if (own(src, 'staleAfterDays') || own(src, 'stale_after_days')) {
      if (staleField.invalid || staleField.conflict || !staleField.present || staleField.value < 1 || staleField.value > 3660) {
        addCode(missing, 'stale_after_days');
      } else staleMs = staleField.value * DAY_MS;
    }

    var savings = pickInt(src, ['savingsReservedMinor', 'savings_reserved_minor']);
    if (savings.invalid || savings.conflict || !savings.present || savings.value < 0) addCode(missing, 'savings_reserved');

    var emergency = pickInt(src, ['emergencyBufferMinor', 'emergencyReserveMinor', 'emergency_buffer_minor', 'emergency_reserve_minor']);
    if (emergency.invalid || emergency.conflict || !emergency.present || emergency.value < 0) addCode(missing, 'emergency_buffer');

    var commitmentPick = pickList(src, ['commitments']);
    if (commitmentPick.invalid || commitmentPick.conflict || !commitmentPick.present) addCode(missing, 'commitments');

    var today = now.present && cairoOffsetMinutes(now.value) != null ? cairoParts(now.value) : null;
    if (today && payday && today.ymd > payday.ymd) addCode(missing, 'payday_passed');
    if (today && payday && today.ymd === payday.ymd) addCode(missing, 'payday_today');
    if (now.present && reportedAt.present && reportedAt.value > now.value) addCode(missing, 'future_snapshot');
    if (now.present && reportedAt.present && reportedAt.value <= now.value && now.value - reportedAt.value > staleMs) {
      addCode(missing, 'stale_snapshot');
    }

    var paydayInfo = null;
    if (payday || paydayAmount.present || paydayCurrency) {
      paydayInfo = {
        date: payday ? payday.iso : null,
        amount_minor: paydayAmount.present ? paydayAmount.value : null,
        currency: paydayCurrency,
        included: false,
        is_today: !!(today && payday && today.ymd === payday.ymd)
      };
    }

    var seenObligations = {};
    var seenTx = {};
    var billsDue = [];
    var unconfirmedCommitments = [];
    var sums = { rent: 0, installment: 0, "gam'eya": 0, family: 0, utility: 0, subscription: 0, other: 0, payout: 0 };
    var txSums = { net: 0, before: 0, at: 0, unconfirmedNet: 0, unconfirmed: [], counted: {} };
    var paydayYmd = payday ? payday.ymd : null;
    var side = { unconfirmedTransactions: txSums.unconfirmed, unconfirmedCommitments: unconfirmedCommitments };
    var i;
    if (currency && reportedAt.present && txList.present) {
      for (i = 0; i < txList.value.length; i++) considerTransaction(txList.value[i], currency, reportedAt.value, now.present ? now.value : null, seenTx, missing, excluded, txSums);
    }
    if (currency && commitmentPick.present) {
      for (i = 0; i < commitmentPick.value.length; i++) considerCommitment(commitmentPick.value[i], currency, paydayYmd, reportedAt.present ? reportedAt.value : null, seenObligations, txSums.counted, missing, excluded, billsDue, sums, unconfirmedCommitments);
    }
    if (txSums.before) excluded.push({ reason: 'before_snapshot', count: txSums.before });
    if (txSums.at) excluded.push({ reason: 'at_snapshot', count: txSums.at });

    if (missing.length) return emptyResult(currency, missing, excluded, paydayInfo, side);

    var safe = balance.value;
    safe = addInt(safe, txSums.net);
    safe = safe == null ? null : addInt(safe, -sums.rent);
    safe = safe == null ? null : addInt(safe, -sums.installment);
    safe = safe == null ? null : addInt(safe, -sums["gam'eya"]);
    safe = safe == null ? null : addInt(safe, -sums.family);
    safe = safe == null ? null : addInt(safe, -sums.utility);
    safe = safe == null ? null : addInt(safe, -sums.subscription);
    safe = safe == null ? null : addInt(safe, -sums.other);
    safe = safe == null ? null : addInt(safe, -savings.value);
    safe = safe == null ? null : addInt(safe, -emergency.value);
    if (safe == null) {
      addCode(missing, 'invalid_amount');
      return emptyResult(currency, missing, excluded, paydayInfo, side);
    }

    var calendarDays = civilIndex(payday) - civilIndex(today);
    if (calendarDays <= 0) {
      addCode(missing, calendarDays === 0 ? 'payday_today' : 'payday_passed');
      return emptyResult(currency, missing, excluded, paydayInfo, side);
    }
    var days = calendarDays;
    var perDay = floorDiv(safe, days);
    var remainder = safe - perDay * days;
    billsDue.sort(function (a, b) {
      if (a.due < b.due) return -1;
      if (a.due > b.due) return 1;
      if (a.kind < b.kind) return -1;
      if (a.kind > b.kind) return 1;
      var aid = a.id || '';
      var bid = b.id || '';
      if (aid < bid) return -1;
      if (aid > bid) return 1;
      return 0;
    });

    return {
      status: safe < 0 ? 'shortfall' : 'ok',
      currency: currency,
      safe_to_spend_minor: safe,
      available_now_minor: safe,
      per_day_minor: perDay,
      days: days,
      calendar_days: calendarDays,
      remainder_minor: remainder,
      breakdown: [
        { id: 'snapshot', label: 'Reported balance', amount_minor: balance.value, included: true },
        { id: 'transactions', label: 'Confirmed transactions after the snapshot', amount_minor: txSums.net, included: true },
        { id: 'rent', label: 'Rent due on or before payday', amount_minor: -sums.rent, included: true },
        { id: 'installment', label: 'Installments due on or before payday', amount_minor: -sums.installment, included: true },
        { id: 'gameya', label: "Gam'eya pay-ins due on or before payday", amount_minor: -sums["gam'eya"], included: true },
        { id: 'family', label: 'Family support due on or before payday', amount_minor: -sums.family, included: true },
        { id: 'utility', label: 'Utilities due on or before payday', amount_minor: -sums.utility, included: true },
        { id: 'subscription', label: 'Subscriptions due on or before payday', amount_minor: -sums.subscription, included: true },
        { id: 'other', label: 'Other commitments due on or before payday', amount_minor: -sums.other, included: true },
        { id: 'savings', label: 'Savings reservation', amount_minor: -savings.value, included: true },
        { id: 'emergency_buffer', label: 'Emergency buffer', amount_minor: -emergency.value, included: true },
        { id: 'planned_payday', label: 'Planned payday income', amount_minor: paydayAmount.value, included: false },
        { id: 'gam_eya_payouts', label: "Gam'eya payouts", amount_minor: sums.payout, included: false },
        { id: 'unconfirmed_notifications', label: 'Unconfirmed notification transactions', amount_minor: txSums.unconfirmedNet, included: false }
      ],
      bills_due: billsDue,
      unconfirmed_transactions: txSums.unconfirmed,
      unconfirmed_count: txSums.unconfirmed.length,
      unconfirmed_net_minor: txSums.unconfirmedNet,
      unconfirmed_commitments: unconfirmedCommitments,
      missing: [],
      excluded: excluded,
      payday: paydayInfo
    };
  }

  var api = {
    STALE_AFTER_MS: STALE_AFTER_MS,
    evaluate: evaluate,
    cairoOffsetMinutes: cairoOffsetMinutes,
    cairoParts: cairoParts
  };
  root.FolioPaydayRunway = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
