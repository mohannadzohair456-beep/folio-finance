/**
 * Home money flow, quick-add keypad, and voice-draft shaping.
 * No DOM, no network, no clock. Amounts are integer minor units.
 * A flow never adds two currencies together.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FolioFlow = api;
  if (typeof window !== 'undefined' && window && window !== root) window.FolioFlow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_NODES = 6;
  var MAX_MINOR = 10000000000;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function formatMinor(minor, currency) {
    var abs = Math.abs(Number(minor) || 0);
    var frac = abs % 100;
    var major = (abs - frac) / 100;
    var text = String(major) + '.' + (frac < 10 ? '0' : '') + String(frac);
    return currency ? currency + ' ' + text : text;
  }

  function sumAmounts(nodes) {
    var total = 0;
    for (var i = 0; i < nodes.length; i++) total += nodes[i].amountMinor;
    return total;
  }

  function exactFloor(a, b, c, d, e) {
    if (typeof BigInt === 'function') {
      return Number((BigInt(a) * BigInt(b) * BigInt(c)) / (BigInt(d) * BigInt(e)));
    }
    return Math.floor((a / d) * (b / e) * c);
  }

  function textLabel(value, fallback) {
    var text = value == null ? '' : String(value).trim();
    if (!text) return fallback;
    return text.slice(0, 80);
  }

  function addAmount(map, label, amount) {
    if (!map[label]) map[label] = 0;
    map[label] += amount;
  }

  function toNodes(map) {
    var nodes = [];
    Object.keys(map).forEach(function (label) {
      if (map[label] > 0) nodes.push({ label: label, amountMinor: map[label] });
    });
    nodes.sort(function (a, b) {
      return b.amountMinor - a.amountMinor || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
    });
    return nodes;
  }

  function collapse(nodes, otherLabel) {
    if (nodes.length <= MAX_NODES) return nodes;
    var head = nodes.slice(0, MAX_NODES - 1);
    var extra = 0;
    for (var i = MAX_NODES - 1; i < nodes.length; i++) extra += nodes[i].amountMinor;
    if (extra > 0) head.push({ label: otherLabel, amountMinor: extra, grouped: true });
    return head;
  }

  function usableAmount(entry) {
    var amount = Number(entry.amountMinor);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_MINOR) return null;
    return amount;
  }

  function buildMoneyFlow(records, currency) {
    var code = currency || '';
    var incomeMap = {};
    var expenseMap = {};
    var excludedCount = 0;
    var skippedCount = 0;
    (records || []).forEach(function (entry) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        skippedCount++;
        return;
      }
      if (entry.direction !== 'income' && entry.direction !== 'expense') {
        skippedCount++;
        return;
      }
      var amount = usableAmount(entry);
      if (amount == null) {
        skippedCount++;
        return;
      }
      if (entry.currency !== code) {
        excludedCount++;
        return;
      }
      if (entry.direction === 'income') addAmount(incomeMap, textLabel(entry.merchant || entry.category, 'Income'), amount);
      else addAmount(expenseMap, textLabel(entry.category, 'Other'), amount);
    });
    var income = collapse(toNodes(incomeMap), 'Other income sources');
    var expense = collapse(toNodes(expenseMap), 'Other spending');
    var linked = linkAmounts(income, expense);
    var flow = {
      currency: code,
      empty: income.length === 0 && expense.length === 0,
      income: income,
      expense: expense,
      links: linked.links,
      incomeTotal: linked.incomeTotal,
      expenseTotal: linked.expenseTotal,
      pool: linked.pool,
      held: linked.incomeTotal - linked.pool,
      uncovered: linked.expenseTotal - linked.pool,
      excludedCount: excludedCount,
      skippedCount: skippedCount,
      summary: ''
    };
    flow.summary = describeFlow(flow);
    return flow;
  }

  function describeFlow(flow) {
    if (flow.empty) {
      return 'No ' + flow.currency + ' income or spending in this set. Other currencies are not included.';
    }
    var parts = ['This view is ' + flow.currency + ' only.'];
    if (flow.income.length) {
      parts.push(flow.income.map(function (node) {
        return formatMinor(node.amountMinor, flow.currency) + ' from ' + node.label;
      }).join(', ') + '.');
    } else parts.push('No ' + flow.currency + ' income was recorded.');
    if (flow.expense.length) {
      parts.push(flow.expense.map(function (node) {
        return formatMinor(node.amountMinor, flow.currency) + ' to ' + node.label;
      }).join(', ') + '.');
    } else parts.push('No ' + flow.currency + ' spending was recorded.');
    if (flow.excludedCount) {
      parts.push(String(flow.excludedCount) + (flow.excludedCount === 1 ? ' entry in another currency is' : ' entries in another currency are') + ' not included.');
    }
    return parts.join(' ');
  }

  function linkAmounts(income, expense) {
    var incomeTotal = sumAmounts(income);
    var expenseTotal = sumAmounts(expense);
    var pool = incomeTotal < expenseTotal ? incomeTotal : expenseTotal;
    var links = [];
    if (pool <= 0 || !income.length || !expense.length) {
      return { links: links, pool: 0, incomeTotal: incomeTotal, expenseTotal: expenseTotal };
    }
    var cells = [];
    var i;
    var j;
    for (i = 0; i < income.length; i++) {
      for (j = 0; j < expense.length; j++) {
        var ideal = (income[i].amountMinor / incomeTotal) * (expense[j].amountMinor / expenseTotal) * pool;
        cells.push({
          i: i,
          j: j,
          from: income[i].label,
          to: expense[j].label,
          ideal: ideal,
          amount: exactFloor(income[i].amountMinor, expense[j].amountMinor, pool, incomeTotal, expenseTotal)
        });
      }
    }
    function sourceUsed(index) {
      var total = 0;
      for (var k = 0; k < cells.length; k++) if (cells[k].i === index) total += cells[k].amount;
      return total;
    }
    function categoryUsed(index) {
      var total = 0;
      for (var k = 0; k < cells.length; k++) if (cells[k].j === index) total += cells[k].amount;
      return total;
    }
    var used = 0;
    for (i = 0; i < cells.length; i++) used += cells[i].amount;
    var left = pool - used;
    var spins = 0;
    while (left > 0 && spins < pool + 2) {
      var best = -1;
      var bestScore = -1;
      for (i = 0; i < cells.length; i++) {
        var cell = cells[i];
        if (sourceUsed(cell.i) >= income[cell.i].amountMinor) continue;
        if (categoryUsed(cell.j) >= expense[cell.j].amountMinor) continue;
        var score = cell.ideal - cell.amount;
        if (best < 0 || score > bestScore) {
          best = i;
          bestScore = score;
        }
      }
      if (best < 0) break;
      cells[best].amount += 1;
      left -= 1;
      spins++;
    }
    for (i = 0; i < cells.length; i++) {
      if (cells[i].amount > 0) links.push({ from: cells[i].from, to: cells[i].to, amountMinor: cells[i].amount });
    }
    links.sort(function (a, b) {
      if (a.from < b.from) return -1;
      if (a.from > b.from) return 1;
      if (a.to < b.to) return -1;
      if (a.to > b.to) return 1;
      return 0;
    });
    return { links: links, pool: pool - left, incomeTotal: incomeTotal, expenseTotal: expenseTotal };
  }

  function shortLabel(label) {
    var text = String(label);
    if (text.length <= 18) return text;
    return text.slice(0, 17) + '…';
  }

  function renderFlowSvg(flow) {
    if (!flow || flow.empty) return '';
    var income = flow.income || [];
    var expense = flow.expense || [];
    var rowH = 28;
    var gap = 8;
    var rows = Math.max(income.length, expense.length, 1);
    var height = 36 + rows * (rowH + gap);
    var colors = ['#147c68', '#8fb84a', '#e6a47a', '#8290c7', '#d9839a', '#778e9f', '#c4a35a', '#5aa7a7'];
    var left = {};
    var right = {};
    var y0 = 28;
    var i;
    for (i = 0; i < income.length; i++) left[income[i].label] = { y: y0 + i * (rowH + gap), h: rowH, cursor: 0, amount: income[i].amountMinor };
    for (i = 0; i < expense.length; i++) right[expense[i].label] = { y: y0 + i * (rowH + gap), h: rowH, cursor: 0, amount: expense[i].amountMinor };
    var parts = [];
    parts.push('<svg class="flow-svg" viewBox="0 0 640 ' + height + '" role="img" aria-label="' + esc(flow.summary) + '">');
    parts.push('<desc>' + esc(flow.summary) + '</desc>');
    parts.push('<text x="148" y="16" font-size="11" fill="#5d7368">From</text>');
    parts.push('<text x="360" y="16" font-size="11" fill="#5d7368">To</text>');
    (flow.links || []).forEach(function (link) {
      var from = left[link.from];
      var to = right[link.to];
      if (!from || !to) return;
      var h1 = from.amount > 0 ? Math.max(2, from.h * link.amountMinor / from.amount) : 2;
      var h2 = to.amount > 0 ? Math.max(2, to.h * link.amountMinor / to.amount) : 2;
      var y1 = from.y + from.cursor;
      var y2 = to.y + to.cursor;
      from.cursor += h1;
      to.cursor += h2;
      var x1 = 168;
      var x2 = 360;
      var c = (x2 - x1) / 2;
      var d = 'M' + x1 + ',' + round1(y1) + ' C' + (x1 + c) + ',' + round1(y1) + ' ' + (x2 - c) + ',' + round1(y2) + ' ' + x2 + ',' + round1(y2) +
        ' L' + x2 + ',' + round1(y2 + h2) + ' C' + (x2 - c) + ',' + round1(y2 + h2) + ' ' + (x1 + c) + ',' + round1(y1 + h1) + ' ' + x1 + ',' + round1(y1 + h1) + ' Z';
      var color = colors[(income.indexOf ? indexOfLabel(income, link.from) : 0) % colors.length];
      parts.push('<path class="flow-ribbon" d="' + d + '" fill="' + color + '" fill-opacity="0.45"><title>' +
        esc(link.from + ' → ' + link.to + ', ' + formatMinor(link.amountMinor, flow.currency)) + '</title></path>');
    });
    income.forEach(function (node, index) {
      var box = left[node.label];
      parts.push('<rect x="148" y="' + box.y + '" width="20" height="' + box.h + '" rx="4" fill="' + colors[index % colors.length] + '"></rect>');
      parts.push('<text x="140" y="' + (box.y + 18) + '" text-anchor="end" font-size="12" fill="#14382d">' + esc(shortLabel(node.label)) + '</text>');
    });
    expense.forEach(function (node, index) {
      var box = right[node.label];
      parts.push('<rect x="360" y="' + box.y + '" width="20" height="' + box.h + '" rx="4" fill="' + colors[(index + 3) % colors.length] + '"></rect>');
      parts.push('<text x="388" y="' + (box.y + 18) + '" font-size="12" fill="#14382d">' + esc(shortLabel(node.label)) + '</text>');
    });
    if (!income.length) parts.push('<text x="8" y="48" font-size="12" fill="#5d7368">No ' + esc(flow.currency) + ' income</text>');
    if (!expense.length) parts.push('<text x="388" y="48" font-size="12" fill="#5d7368">No ' + esc(flow.currency) + ' spending</text>');
    parts.push('</svg>');
    return parts.join('');
  }

  function indexOfLabel(nodes, label) {
    for (var i = 0; i < nodes.length; i++) if (nodes[i].label === label) return i;
    return 0;
  }

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  function keypadAppend(current, key) {
    var next = String(current || '');
    if (key === 'back') return next.slice(0, -1);
    if (key === '.') {
      if (next.indexOf('.') >= 0) return next;
      return (next || '0') + '.';
    }
    if (!/^\d$/.test(key)) return next;
    var parts = next.split('.');
    if (parts[1] != null && parts[1].length >= 2) return next;
    if (next.indexOf('.') < 0 && parts[0].length >= 9 && next !== '0') return next;
    if (next === '0') return key;
    return next + key;
  }

  function keypadToMinor(text) {
    if (text == null) return null;
    var raw = String(text).trim();
    if (!raw || raw === '.' || raw === '0.') return null;
    if (!/^\d+(\.\d{0,2})?$/.test(raw)) return null;
    var parts = raw.split('.');
    var major = Number(parts[0]);
    var frac = parts[1] || '';
    if (!Number.isSafeInteger(major)) return null;
    var cents = Number((frac + '00').slice(0, 2));
    if (!Number.isSafeInteger(cents)) return null;
    var minor = major * 100 + cents;
    if (!Number.isSafeInteger(minor) || minor <= 0 || minor > MAX_MINOR) return null;
    return minor;
  }

  function rankCaptureSuggestions(records, currency, direction) {
    var rows = [];
    (records || []).forEach(function (entry) {
      if (!entry || entry.currency !== currency || entry.direction !== direction) return;
      var merchant = textLabel(entry.merchant, '');
      if (!merchant) return;
      var when = Number(entry.occurredAt);
      rows.push({
        merchant: merchant,
        category: textLabel(entry.category, direction === 'income' ? 'Other income' : 'Other'),
        at: Number.isFinite(when) ? when : 0
      });
    });
    rows.sort(function (a, b) { return b.at - a.at; });
    var seen = {};
    var recent = [];
    rows.forEach(function (row) {
      var key = row.merchant.toLowerCase();
      if (seen[key]) return;
      seen[key] = 1;
      if (recent.length < 6) recent.push({ label: row.merchant, at: row.at });
    });
    var counts = {};
    var names = {};
    var catCounts = {};
    var catNames = {};
    rows.forEach(function (row) {
      var key = row.merchant.toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
      if (!names[key]) names[key] = row.merchant;
      var catKey = row.category.toLowerCase();
      catCounts[catKey] = (catCounts[catKey] || 0) + 1;
      if (!catNames[catKey]) catNames[catKey] = row.category;
    });
    var frequent = Object.keys(counts).map(function (key) {
      return { label: names[key], count: counts[key] };
    }).sort(function (a, b) {
      return b.count - a.count || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
    }).slice(0, 6);
    var defaults = direction === 'income'
      ? ['Salary', 'Other income', 'Transfers', 'Refunds']
      : ['Food & drinks', 'Transport', 'Shopping', 'Bills & utilities', 'Health', 'Other'];
    var categories = Object.keys(catCounts).map(function (key) {
      return { label: catNames[key], count: catCounts[key] };
    }).sort(function (a, b) {
      return b.count - a.count || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
    });
    defaults.forEach(function (label) {
      var known = false;
      for (var i = 0; i < categories.length; i++) if (categories[i].label.toLowerCase() === label.toLowerCase()) known = true;
      if (!known) categories.push({ label: label, count: 0 });
    });
    return { recent: recent, frequent: frequent, categories: categories.slice(0, 8) };
  }

  function acceptVoiceTranscript(text, plan) {
    var spoken = String(text == null ? '' : text).trim();
    if (!spoken) return { ok: false, reason: 'empty', spoken: '', answer: '', draft: null, saved: false };
    spoken = spoken.slice(0, 500);
    if (typeof plan !== 'function') return { ok: false, reason: 'no-parser', spoken: spoken, answer: '', draft: null, saved: false };
    var result;
    try { result = plan(spoken); }
    catch (error) { return { ok: false, reason: 'parse', spoken: spoken, answer: '', draft: null, saved: false }; }
    var draft = null;
    if (result && result.action && typeof result.action === 'object') draft = result.action;
    else if (result && result.proposal && result.proposal.type === 'savingsGoal') draft = result.proposal;
    return {
      ok: true,
      reason: draft ? 'draft' : 'no-draft',
      spoken: spoken,
      answer: result && result.answer != null ? String(result.answer) : '',
      draft: draft,
      saved: false
    };
  }

  return {
    buildMoneyFlow: buildMoneyFlow,
    renderFlowSvg: renderFlowSvg,
    formatMinor: formatMinor,
    keypadAppend: keypadAppend,
    keypadToMinor: keypadToMinor,
    rankCaptureSuggestions: rankCaptureSuggestions,
    acceptVoiceTranscript: acceptVoiceTranscript
  };
});
