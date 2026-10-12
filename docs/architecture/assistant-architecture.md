# Ask Folio assistant engine

The assistant is a deterministic local rules engine. It does not call a network, read the clock, or mutate the caller's state. Speech audio never enters this module. Android's recognizer turns speech into text first; this module only sees that text.

The implementation lives in `android/app/src/main/assets/assistant.js`. Load it in the WebView as a classic script. It exports `window.FolioAssistant` and, under Node, `module.exports`.

This file is not wired into `index.html` or `folio-v2.js`. Those files are the integration points below.

## Function to swap

Replace `FolioV2.planCommand` (`android/app/src/main/assets/folio-v2.js`).

`submitText` currently does:

```javascript
const result = planCommand(t);
message(result.answer);
draft = result.action || null;
```

After `assistant.js` is loaded ahead of `folio-v2.js`, call:

```javascript
const result = FolioAssistant.planCommand(t, state);
message(result.answer);
draft = result.action || null;
```

Pass the live page `state`. The second argument is what keeps a SAR or USD ledger from being treated as EGP. If it is omitted and this file is running as a classic script after the page script, the engine falls back to the page's `state` binding.

Optional swaps, same signatures as today:

| Today | Replacement | Unit |
| --- | --- | --- |
| `FolioV2.planCommand(text)` | `FolioAssistant.planCommand(text, state)` | See below |
| `FolioV2.detectAmount(text)` | `FolioAssistant.detectAmount(text)` | Major units (`20 thousand` stays `20000`) |
| `FolioV2.numberValue(text)` | `FolioAssistant.numberValue(text)` | Major units, same function as `detectAmount` |

`parse` is the structured classifier. `planCommand` is the drop-in superset: it returns every `parse` field plus `answer`, `action`, `proposal`, and `legacy_summary`.

## What `applyDraft` must keep doing

`applyDraft` in `folio-v2.js` is still the only writer. `planCommand` sets `action` only for the branches that function already understands:

| `action.type` | State write | Amount field |
| --- | --- | --- |
| `balance` | `reportedBalanceMinor` and `balanceReportedAt` | `action.amountMinor` |
| `incomePlan` | `monthlyIncomeMinor` (plan, not a transaction) | `action.amountMinor` |
| `budget` | `monthlyBudgetMinor` | `action.amountMinor` |
| `categoryBudget` | `state.budgets[currency][category]` | `action.amount` in **major** units, matching `saveBudget` |
| `expense` / `income` | push a transaction | `action.amountMinor` |

`categoryBudget` also carries `amountMinor` for a future writer. The current `applyDraft` line `currentBudgets()[a.category] = a.amount` must keep using `amount`.

`savings_goal` sets `needs_confirmation` and `proposal.type = 'savingsGoal'`, and leaves `action` undefined. The confirm card therefore does not appear, and `applyDraft` cannot report a save it did not make. To persist a goal, add a branch that stores `proposal.amountMinor` before `persist()`, and teach `submitText` to open the review card for `proposal` when `action` is absent. Do not fall through to `persist()` for an unknown `action.type`.

Transaction writes in `applyDraft` currently force `currency: state.currency`. Copy `action.currency` instead. `planCommand` already withholds `action` when the utterance names a currency other than `state.currency`, so a blind swap cannot file USD under an EGP ledger. There is no conversion either way.

## Parse result

```text
{
  intent,            // one of the intents below
  amount_minor,      // integer minor units, or null
  currency,          // 'EGP' | 'SAR' | 'USD' | null
  category,          // ledger category, savings label, or null
  confidence,        // 0 to 1
  needs_confirmation // true for every data-write intent
}
```

Extra fields the host may read: `currency_explicit`, `merchant`, `warnings` (`recognition_noise`, `truncated`).

Intents: `set_balance`, `set_salary`, `set_budget`, `add_expense`, `add_income`, `savings_goal`, `can_afford`, `safe_to_spend`, `category_spend`, `month_end_projection`, `unknown`.

`needs_confirmation` is true for the six write intents, including a write that still needs an amount. `action` is present only when the write is complete and the currency can be stored as-is. Queries never set `action`.

`unknown` is returned instead of a nearest guess: empty text, greetings, bare amounts, two amounts, two currencies, two categories, two intents, deletes, transfers, "what is my balance", and prices that are not an integer number of minor units (`10.555`).

Confidence:

| Situation | Score |
| --- | --- |
| Clear intent, explicit currency, amount present when one is required | 0.95 |
| Amount present, currency defaulted | 0.88 |
| "I have 20.50 USD" with no balance noun | 0.86 |
| "I have 20000" with no balance noun and no currency word | 0.82 |
| Intent is clear but the amount is missing | 0.70 |
| Recognition noise was stripped | subtract 0.05 |
| `unknown` | 0 |

## Amounts, currencies, and voice noise

Minor units are 1/100 of the major unit (piastres, cents, halalas). `20k`, `20 kay`, `20 thousand`, `20 ألف`, `1.5k`, and `2 and a half thousand` are exact. Arabic-Indic (`١٥`) and Persian (`۱۵`) digits are accepted, including `٫` and `٬`. English number words and a bounded Egyptian set (`خمستاشر الف`, `الفين`, `تلاته و عشرين`) are accepted. `20km` is not 20,000.

Unspecified currency is EGP for `parse(text)`. `planCommand(text, state)` uses `state.currency` when the speaker did not name one (`EGP`, `SAR`, `USD`, and also `AED`, `EUR`, `GBP` if that is already the ledger). Named words: EGP (`egp`, `e g p`, `pound`, `le`, `l.e.`, `جنيه`, `ج.م`), SAR (`sar`, `riyal`, `ريال`), USD (`usd`, `dollar`, `bucks`, `$`, `دولار`). `pounds` means EGP here. GBP is not inferred.

The composer limit is 500 characters; longer text is truncated and tagged `truncated`.

Recognizer noise that is removed before classification: fillers (`um`, `like`, `please`, `يعني`, `لو سمحت`), greetings (`hey folio`), repeated words, spelled currencies, `10 point 5`, `20 kay`, a detached `ال`, and ASCII punctuation the recognizer inserts. A warning `recognition_noise` is set when that happens. The intent is still returned when the cleaned sentence is unambiguous.

## State the calculators read

Calculators take a plain object and return a new object. They never write back.

| Field | Meaning | Unit |
| --- | --- | --- |
| `currency` | Ledger. Only this currency is summed | code |
| `reportedBalanceMinor` + `balanceReportedAt` | Self-reported snapshot. Both are required, matching `estimatedBalance` | minor, epoch ms |
| `verifiedBalanceMinor` + `verifiedBalanceAt` | Separate verified snapshot. Never added to the self-reported figure | minor, epoch ms |
| `monthlyIncomeMinor` | Planned salary. Not received cash. `0` means unset | minor |
| `monthlyBudgetMinor` | Overall spending cap. `0` means unset | minor |
| `budgets[currency][category]` | Legacy category cap from `saveBudget` | **major** |
| `categoryBudgetsMinor[category]` | Optional category cap | minor |
| `transactions[]` | `{amountMinor, currency, direction, occurredAt, category}` | minor |
| `upcomingBills[]` | `{amountMinor, currency, dueAt}` | minor |
| `emergencyReserveMinor` | Held back from safe-to-spend | minor |
| `now` | Epoch milliseconds. Required for month windows | ms |
| `timeZone` | Fixed offset `+02:00` or minutes. Missing means UTC, and the result says so | offset |

Snake_case aliases are accepted (`self_reported_balance_minor`, `planned_income_minor`, `upcoming_bills`, …). If both names are present and differ, the field is ignored and `conflicting_fields` is listed.

Same-currency transactions with `occurredAt >= snapshot time` adjust that snapshot only. Older rows are not applied again. Other currencies are counted and excluded. Nothing is converted.

## Calculator results

`canAfford(state, cost)`, `safeToSpend(state, options)`, `monthEndProjection(state)`, and `categorySpend(state, category)` return:

```text
{
  explanation,    // English
  assumed,        // sorted ids of missing inputs that were defaulted, plus modeling assumptions
  currency,
  amount_minor,   // null when the figure would require inventing a balance or mixing currencies
  balance_track,  // 'verified' | 'self_reported' | null
  details
}
```

`canAfford` also returns `affordable` (`true`, `false`, or `null`). `cost` is an integer minor amount, or `{amount_minor, currency}` (`amountMinor` is accepted). A missing cost currency uses the ledger and lists `cost_currency`.

`safeToSpend` cash is the chosen snapshot plus later same-currency income and minus later same-currency expenses. It then subtracts upcoming bills due from `now` through month end, then the emergency reserve. If an overall budget exists, the result is also capped by this month's remaining budget. A category option caps further by that category's remaining budget. Planned income is never added. When no verified snapshot exists, `verified_balance` is listed and the self-reported track is used. When neither snapshot is usable, `amount_minor` is null and the explanation says no balance was invented.

`monthEndProjection` starts from that same cash figure, adds planned income not yet seen in this month's received income (`planned_income_still_expected` when that remainder is positive), and subtracts expected outflow. With a budget, outflow is bills plus any remaining budget not already counted as bills. Without a budget, outflow is bills plus a straight daily pace (`spend_pace`) and `monthly_budget` is listed. Received income is reported on its own line and is not treated as the plan.

`categorySpend` sums same-currency expenses for the UTC month of `state.now` (or all history when `now` is missing, listing `now`). `category === null` means every category. A question about an unrecognized topic (`widgets`) is `unknown` at parse time, not forced into Other.

`assumed` ids include: `verified_balance`, `verified_balance_at`, `self_reported_balance`, `balance_reported_at`, `upcoming_bills`, `emergency_reserve`, `monthly_budget`, `category_budget`, `planned_income`, `planned_income_still_expected`, `spend_pace`, `now`, `time_zone`, `transactions`, `currency`, `cost`, `cost_currency`, `no_fx_conversion`, `conflicting_fields`, and the bill/transaction quality ids.

## Commands that stay compatible

These existing utterances still classify and, where they write, still produce the legacy `action.type`:

- `My salary is 15,000` → `incomePlan`
- `My monthly budget is 5,000` → `budget`
- `budget for food is 2000` → `categoryBudget` with `amount` in major units
- `I spent 200 on coffee` → `expense`
- `I have 20000 in my bank` → `balance`
- `Can I afford 3000?` / `Can I afford 1,500?` → no `action`
- `مرتبي ١٥ ألف جنيه` → `incomePlan`
- `دفعت ٢٠٠ جنيه في مطعم` → `expense`
- `20 thousand pounds` and `٢٠ ألف جنيه` → `detectAmount` still returns `20000`

`How am I doing?`, `summary`, `وضع`, `صرفنا`, and `ملخص` stay intent `unknown` on `parse` (they are not a new intent). `planCommand` still fills `answer`, sets `legacy_summary`, and does not set `action`.

Deliberate differences from the first `planCommand`, so a swap does not keep the old mislabels:

- `I received my salary of 15000` is received income (`Salary`), not the monthly plan. `بقبض` stays a plan; `قبضت` / `نزل المرتب` are received.
- `I have a budget of 5000` sets the budget. The old matcher treated every `I have` as a balance.
- `food budget is 2000` is a category budget. The old matcher set the overall budget.
- `what can I spend`, `budget left`, and `how much is left` are `safe_to_spend`.
- Two intents or two categories return `unknown` instead of keeping the first match.
- `detectAmount` still returns the first major-unit amount. `parse` returns `unknown` when the amount is ambiguous.

## Voice path

`MainActivity.startVoiceRecognition` launches `RecognizerIntent` (`ar-EG` or `en-US`, `EXTRA_PREFER_OFFLINE`, one result). The transcript is delivered to `FolioV2.onVoiceResult`, which only fills the text box. The person still presses Send. `submitText` is the only place that must call `FolioAssistant.planCommand`. No Java change is required for the engine itself.

## Tests

`node tests/assistant.test.cjs` runs the engine in Node and in a `vm` global, in Arabic and English. The APK workflow runs that file as its own step. The engine is not loaded by the existing UI tests, so those tests keep covering `folio-v2.js`.

## Limitations

- Explanations are English even when the utterance is Arabic.
- Month boundaries use `state.now` and a fixed `timeZone`. There is no IANA database and no device-local `Date`. Pass `+02:00` for Egypt. Omitting the zone assumes UTC and lists `time_zone` when that zone actually changed a total.
- `كريم` maps to Transport because that is the Arabic spelling of Careem.
- Category `Other` on an expense with no topic is the same explicit bucket as today's `categoryFrom`, not a guessed merchant. Two known categories refuse the sentence.
- Savings goals are not stored until `applyDraft` grows a `savingsGoal` branch.
- AED, EUR, and GBP are ledger currencies only. Speech in those names is not classified.
- Full Modern Standard Arabic grammar and free-form number sentences outside the listed patterns return `unknown`.
- A transaction dated before the snapshot is excluded from cash and still counts in this month's category totals.
- `0` for `monthlyBudgetMinor` and `monthlyIncomeMinor` means unset, matching the current app.
