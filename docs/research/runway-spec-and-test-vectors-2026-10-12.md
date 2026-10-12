# Folio — Independent Payday Money Runway Specification and Test Vectors

**Task:** FOL-105 / GPT-R2. **Date:** 2026-10-12, Africa/Cairo.  
**Repo baseline:** main. Read [GPT-R1 research](hypothesis-validation-2026-10-12.md), [agent task board](../operations/agent-task-board.md), and [existing data-model documentation](../architecture/data-model.md).  
**Independence declaration:** Prepared **without reading `android/app/src/main/assets/payday-runway.js` or any tests for that implementation**. No application code modified. This document is the *independent oracle* for Grok's FOL-107 review, **not a report that Cursor code has passed**. Off-by-default experiment. The report's engineering choices and numeric limits are **ASSUMPTIONS** rather than market-tested findings.

## 1. Short PRD / contract

**User job:** “Given only money I actually have, confirmed activity, due commitments, and reservations, approximately how much discretionary EGP is left until the next expected income day, and per day?” If balances, capture or obligations are uncertain, explicitly say **insufficient data**, not “safe.”

**Who/where:** An opt-in, offline-only Android Folio user with user-reviewed liquid cash/bank/wallet balances. Selected reporting currency = **EGP** for these tests. Other Folio supported currencies must have isolated forecasts; never implicitly convert between them.

**Required inputs:**
- Injected `now` as absolute instant, converted to `Africa/Cairo` local civil date. Do not depend on JS host timezone or current clock.
- `balanceSnapshot = {amountMinor, currency, asOf, includedLiquidAccountIds, userConfirmed}` aggregated **once**, as of one reconciled timestamp. Credit limit, expected loan, and non-liquid debt account are **not** cash. Snapshot includes cash activity **through asOf inclusive**.
- `transactions = [{id,kind,amountMinor,currency,occurredAt,status,sourceAccountId,commitmentId?}]`: confirmed cash expense, actually received income or refund, own-account transfer, credit purchase, credit repayment; `status=confirmed|pending|rejected`. Count **only confirmed transactions strictly after asOf, at/before now**. Unconfirmed notification suggestion does **not** affect authoritative amount. Pending events after snapshot block a user-facing estimate until reviewed. Rejected items ignored.
- `nextIncomeDate` (Cairo `YYYY-MM-DD`, **later than today**) and optional `expectedIncomeMinor`. Future, unreceived salary/contract payments do **not** enter available-now even if forecast amount is large. Unknown next income day => insufficient; no surprise default to 30th.
- Reviewed dated **commitment occurrences** `{id,kind,amountMinor,currency,dueLocalDate,status,paidAt?,linkedConfirmedDebitId?}` with kind in `rent|installment|gamaya_contribution|gamaya_payout|family|utility|subscription|other` and statuses `paid|unpaid` for outflows. Future gam'eya payout is an **expected receipt** (separate `expected` state); only a received confirmed inflow belongs in actual liquid funds. A *partially paid* item stores user-confirmed **remaining outstanding minor units**. Model full principal/fees separately; never double count.
- `reservations = [{id,amountMinor,currency,status:active|released,linkedCommitmentId?}]`: only **additional active buffer** or earmarked savings *not* already included in bills or removed from balance. Released holds excluded.
- Explicit coverage attestations `accountCoverageConfirmed, cashReviewed, commitmentsReviewedAt, reservationsReviewed`. A confirmed empty list `[]` is **not** equivalent to missing/unreviewed `null`.

**Output tagged union:**
```text
{status:"estimate", currency:"EGP", todayCairo, paydayLocalDate,
 daysRemaining, confirmedLiquidMinor, confirmedNetDeltaMinor,
 dueUnpaidMinor, reservationMinor,
 provisionalDiscretionaryMinor, provisionalPerDayMinor,
 inputAsOf, warnings:["This is an estimate, not a guarantee"]}
OR
{status:"insufficient_data", missing:["specificFieldOrReason"],
 provisionalDiscretionaryMinor:null, provisionalPerDayMinor:null}
```

**Precise arithmetic (conservative ASSUMPTION):**
- `D = civilDaysBetween(CairoLocalDate(now), nextIncomeDate)`, where **today included, payday excluded**, so 12 October to 17 October has **D=5**, irrespective of DST/elapsed hours.
- `O = sum(user-confirmed outstanding UNPAID outflows with dueLocalDate <= paydayLocalDate)`. Include overdue. Include due **on** payday because pay arrival order is unknown. Exclude paid bills but require reconciliation with cash ledger.
- `H = sum(active additional reservations)`.
- `I = sum(confirmed actual cash inflow/refund after snapshot through now)`, `E = sum(confirmed actual cash debit/credit repayment in that window)`. Own transfers and credit purchases don't affect *aggregated liquid* cash.
- **`T = B + I − E − O − H`** in integer minor units, including **negative** T.
- **`perDay = floor(T / D)`**, not rounding to nearest and not truncating negative values toward zero. `D <= 0` => insufficient.
- **Projected payday amount is *not* added**. A confirmed salary actually received in the ledger after snapshot *is* included.

**When to return INSUFFICIENT instead of a number:** Missing or unconfirmed liquid snapshot/coverage, missing asOf, snapshot from future or **older than 48 elapsed hours**, missing/older-than-7-days commitment review, cash not reviewed, reservations not reviewed, pending after-snapshot notifications, unresolved duplicate cash movement, unreconciled marked-paid bill, bill-reservation overlap, unknown/missing or non-future payday date, unsupported currency mixing, overflow, malformed/unresolved recurring schedule, or future confirmed transaction timestamp. Always give named `missing[]` keys. **48 hours, 7 days, including payday-due bills, and pending-review fail-closed are ASSUMPTION safety defaults for this experiment**, not empirically validated thresholds.

**Invariant implementation contract:** Pure function with frozen `now`; no reads/writes to accounts, SMS, JSON backup, or network. Experimental UI flag **OFF** by default. No hidden use of predicted incomes or auto-approval of purchases.

## 2. Adversarial financial invariants

1. **Integer minor money:** All operands and intermediates are safe integer minor units. Reject decimal major amounts, NaN/Infinity and `abs(value)>Number.MAX_SAFE_INTEGER`; do not use binary floating-point for fractions.
2. **Never mix currencies:** EGP funds must not consume USD obligations or vice versa without a user-confirmed multi-currency reconciliation. No implicit FX rates. The tests refuse foreign entries inside EGP liquid account scope.
3. **Idempotence:** Deterministic inputs with injected clock produce identical results. Calling the forecast never mutates the ledger, obligation status or source data.
4. **Snapshot once:** Posted cash movement at/before snapshot `asOf` is already inside `B`; never replay it. Timestamp equality is inclusive on snapshot side.
5. **Snapshot freshness:** Require explicit user confirmation, accurate account scope, asOf ≤ now, age **≤48 elapsed hours** (ASSUMPTION).
6. **Notification review:** Pending/ambiguous notifications are not authoritative expenses or income. Pending events strictly after snapshot => insufficient until approved/rejected, without leaking a misleading provisional number.
7. **Event timing:** Confirmed transactions cannot be dated in the future. No “future salary” masquerading as an actual ledger credit.
8. **No money duplication:** Select accounts once; duplicate bank/issuer notifications, CSV imports and mirror account entries cannot double the amount. Conflicting IDs block numerical output until reconciled.
9. **Own-account transfer neutrality:** Transfers between two included liquid accounts produce zero aggregated net delta. Cash withdrawal is not an additional expense if counted as an own transfer.
10. **Credit distinction:** Credit-card *purchase* creates liability and is not cash spent from liquid accounts yet; actual settlement reduces cash once. Do not double count outstanding invoice + settlement + original purchase.
11. **Refunds only on receipt:** Only confirmed posted refund after snapshot increases B. Proposed/expected refund is excluded.
12. **Unreceived future income excluded:** Salary, freelance invoice, BNPL/loan availability and gam'eya payout not in liquid assets until received. `expectedIncomeMinor` must not change T/P.
13. **Future payday required:** If income date today or earlier in Cairo, or is absent/unparseable, return insufficient, never divide by zero.
14. **Cairo civil days:** Divisor `D` uses calendar dates in IANA **Africa/Cairo**, not `elapsedMilliseconds/86400000` (fails DST and partial-day rules).
15. **Unpaid means deducted:** All confirmed unpaid commitments due before **or on** payday, including overdue, subtract exactly once; due later than payday do not subtract.
16. **Unique schedule expansion:** Expand recurring obligations into unique occurrences before run; unknown recurrence, day-31 or leap-day policy requires explicit rule. Never double emit an installment occurrence.
17. **Paid reconciliation:** Paid prior to/asOf already reflected in B; paid after snapshot requires *unique linked confirmed cash debit* in (asOf,now]. Marked “paid” alone is not proof of cash leaving.
18. **Outstanding portion only:** For partially paid installments, subtract remaining reviewed principal+fees; confirmed partial debit after snapshot still appears in E.
19. **Gam'eya pay-in != payout:** Scheduled contribution is obligatory cash out; unreceived future payout is no cash; receipt is confirmed income. The full pot is never available before its actual receipt.
20. **No overlapping reservation:** Active extra buffer H can be deducted once. If H is money already earmarked for a bill also in O, flag overlap, don't subtract twice; released reservations zero.
21. **Negative runway is a real shortfall:** Do **not** `Math.max(0,T)`, silently suppress liabilities, or present negative T as zero.
22. **Flooring rule:** `floor(100001/5)=20000`; `floor(-100001/5)=-20001` minor units. No upward rounding and no `D=0` number.
23. **Cairo DST disambiguation:** Parse offset-aware instants; repeated `23:30` at October fallback are distinct instants. Date boundaries use local Cairo date, not system UTC date or an assumed permanent +03 offset.
24. **Missing is different from empty:** Unknown bill list, unreconciled cash activity or absent reserve review must return `insufficient_data`; user-confirmed `[]` may produce an estimate.
25. **Tagged errors:** For error, output **both money fields null**, a stable named reason, and no stale cached successful number. Multiple simultaneous failures should report all relevant keys in stable order.
26. **Account identity:** No accidental inclusion of an overdraft/credit limit or money in excluded family accounts as spendable; in-scope activity must be reconcilable.
27. **No guarantees:** Even on valid inputs, user sees *estimated discretionary headroom*, never “bank-verified safe amount” or payment approval.
28. **App safety:** No new implicit permissions, raw SMS collection, data loss, JSON/CSV migration change, signing identity change or package change (`com.folio.finance.app`). Default flag off; P0 regression gating.
29. **Trust through provenance:** Surface asOf timestamp, pending review count, due-list review state, day count and explicitly omitted expected income. A missing buffer or cash review should never be silently guessed as zero.
30. **Numeric edge robustness:** Overflow in summed bills, debits or final amount => insufficient; preserve exact piaster arithmetic for zero and negative outcomes.

## 3. Exact acceptance vectors (independent oracle)

**Shorthand:** Every row explicitly states the snapshot, transactions, payday/**projected** amount, commitments, reservations and injected now. **All amounts are EGP minor units** unless a row explicitly marks USD (which triggers an error). In timestamp columns, `10-12 09:00+03` means **2026-10-12T09:00:00+03:00**; entries with **2028** show full year. `[] reviewed` is a positively attested empty collection. Unless noted beside now, all attestations (`accountsReviewed`, `cashReviewed`, `duesReviewedAt=now`, `holdsReviewed`) are true; no account outside the confirmed liquid snapshot is inferred. Future payday amount is metadata, not cash. Type `gamaya_payout expected` indicates an *expected income event*, not a paid/unpaid debit. Transactions are shown with economic kind, amount, review state and event time. In error rows totals and daily amounts are **null** and the missing key is explicit.

| # / edge | Liquid B@asOf | Transactions | Payday date / expected pay minor | Commitment occurrences | Extra reservations | Cairo now / attestation overrides | Expected total / daily minor, arithmetic or named insufficient reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V01 Reviewed baseline | 100000@10-12 09:00+03 | [] | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **100000** total; **20000** /day; 100000 = 100000; floor(100000/5) = 20000 |
| V02 Larger future salary does not change now | 100000@10-12 09:00+03 | [] | 2026-10-17 / 1500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **100000** total; **20000** /day; 100000 = 100000; floor(100000/5) = 20000 |
| V03 Confirmed debit | 100000@10-12 09:00+03 | expense 12500 confirmed@10-12 09:30+03 | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **87500** total; **17500** /day; 100000 - 12500 = 87500; floor(87500/5) = 17500 |
| V04 Confirmed received income | 100000@10-12 09:00+03 | income 20000 confirmed@10-12 09:30+03 | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **120000** total; **24000** /day; 100000 + 20000 = 120000; floor(120000/5) = 24000 |
| V05 Debit and credit | 100000@10-12 09:00+03 | income 20000 confirmed@10-12 09:30+03; expense 7500 confirmed@10-12 09:45+03 id=t2 | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **112500** total; **22500** /day; 100000 + 20000 - 7500 = 112500; floor(112500/5) = 22500 |
| V06 Pending notification AFTER snapshot | 100000@10-12 09:00+03 | expense 25000 pending@10-12 09:30+03 | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **insufficient_data**: `pendingTransactionReview` (totals **null**) |
| V07 Rejected notification | 100000@10-12 09:00+03 | expense 50000 rejected@10-12 09:30+03 | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **100000** total; **20000** /day; 100000 = 100000; floor(100000/5) = 20000 |
| V08 Old transaction before snapshot | 100000@10-12 09:00+03 | expense 18000 confirmed@10-12 08:00+03 | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **100000** total; **20000** /day; 100000 = 100000; floor(100000/5) = 20000 |
| V09 Event exactly AT snapshot | 100000@10-12 09:00+03 | expense 15000 confirmed@10-12 09:00+03 | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **100000** total; **20000** /day; 100000 = 100000; floor(100000/5) = 20000 |
| V10 Future transaction timestamp | 100000@10-12 09:00+03 | expense 10000 confirmed@10-12 11:00+03 | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **insufficient_data**: `futureTransaction` (totals **null**) |
| V11 Rent due before payday | 100000@10-12 09:00+03 | [] | 2026-10-17 / 500000 | rent 20000 EGP unpaid due 2026-10-15 | [] reviewed | 10-12 10:00+03 | **80000** total; **16000** /day; 100000 - 20000 = 80000; floor(80000/5) = 16000 |
| V12 Bill DUE on payday | 100000@10-12 09:00+03 | [] | 2026-10-17 / 500000 | utility 30000 EGP unpaid due 2026-10-17 | [] reviewed | 10-12 10:00+03 | **70000** total; **14000** /day; 100000 - 30000 = 70000; floor(70000/5) = 14000 |
| V13 Due after payday | 100000@10-12 09:00+03 | [] | 2026-10-17 / 500000 | rent 20000 EGP unpaid due 2026-10-18 | [] reviewed | 10-12 10:00+03 | **100000** total; **20000** /day; 100000 = 100000; floor(100000/5) = 20000 |
| V14 Overdue unpaid contribution | 100000@10-12 09:00+03 | [] | 2026-10-17 / 500000 | family 12000 EGP unpaid due 2026-10-09 | [] reviewed | 10-12 10:00+03 | **88000** total; **17600** /day; 100000 - 12000 = 88000; floor(88000/5) = 17600 |
| V15 Already paid, BEFORE snapshot | 100000@10-12 09:00+03 | [] | 2026-10-17 / 500000 | rent 20000 EGP paid due 2026-10-15 paid@10-12 08:00+03 | [] reviewed | 10-12 10:00+03 | **100000** total; **20000** /day; 100000 = 100000; floor(100000/5) = 20000 |
| V16 Paid AFTER snapshot, linked confirmed debit | 100000@10-12 09:00+03 | expense 20000 confirmed@10-12 09:30+03 id=rentPaid | 2026-10-17 / 500000 | rent 20000 EGP paid due 2026-10-15 paid@10-12 09:30+03 linked=rentPaid | [] reviewed | 10-12 10:00+03 | **80000** total; **16000** /day; 100000 - 20000 = 80000; floor(80000/5) = 16000 |
| V17 Paid AFTER snapshot WITHOUT linked debit | 100000@10-12 09:00+03 | [] | 2026-10-17 / 500000 | rent 20000 EGP paid due 2026-10-15 paid@10-12 09:30+03 | [] reviewed | 10-12 10:00+03 | **insufficient_data**: `unreconciledPaidCommitment` (totals **null**) |
| V18 Three due installment occurrences | 100000@10-12 09:00+03 | [] | 2026-10-17 / 500000 | installment 10000 EGP unpaid due 2026-10-12; installment 10000 EGP unpaid due 2026-10-14; installment 10000 EGP unpaid due 2026-10-16 | [] reviewed | 10-12 10:00+03 | **70000** total; **14000** /day; 100000 - 30000 = 70000; floor(70000/5) = 14000 |
| V19 Part-paid installment: outstanding 6000 only | 100000@10-12 09:00+03 | [] | 2026-10-17 / 500000 | installment 6000 EGP unpaid due 2026-10-16 | [] reviewed | 10-12 10:00+03 | **94000** total; **18800** /day; 100000 - 6000 = 94000; floor(94000/5) = 18800 |
| V20 Gam'eya contribution outflow | 100000@10-12 09:00+03 | [] | 2026-10-17 / 500000 | gamaya_contribution 15000 EGP unpaid due 2026-10-15 | [] reviewed | 10-12 10:00+03 | **85000** total; **17000** /day; 100000 - 15000 = 85000; floor(85000/5) = 17000 |
| V21 Expected gam'eya payout cannot be spent | 100000@10-12 09:00+03 | [] | 2026-10-17 / 500000 | gamaya_payout 90000 EGP expected due 2026-10-16 | [] reviewed | 10-12 10:00+03 | **100000** total; **20000** /day; 100000 = 100000; floor(100000/5) = 20000 |
| V22 Gam'eya payout actually received | 100000@10-12 09:00+03 | income 90000 confirmed@10-12 09:30+03 id=circlePaid | 2026-10-17 / 500000 | gamaya_payout 90000 EGP received due 2026-10-16 paid@10-12 09:30+03 linked=circlePaid | [] reviewed | 10-12 10:00+03 | **190000** total; **38000** /day; 100000 + 90000 = 190000; floor(190000/5) = 38000 |
| V23 Rent and family support | 100000@10-12 09:00+03 | [] | 2026-10-17 / 500000 | rent 18000 EGP unpaid due 2026-10-13; family 7000 EGP unpaid due 2026-10-16 | [] reviewed | 10-12 10:00+03 | **75000** total; **15000** /day; 100000 - 25000 = 75000; floor(75000/5) = 15000 |
| V24 Additional emergency reservation | 100000@10-12 09:00+03 | [] | 2026-10-17 / 500000 | [] reviewed | 12500 active | 10-12 10:00+03 | **87500** total; **17500** /day; 100000 - 12500 = 87500; floor(87500/5) = 17500 |
| V25 Released reservation ignored | 100000@10-12 09:00+03 | [] | 2026-10-17 / 500000 | [] reviewed | 12500 released | 10-12 10:00+03 | **100000** total; **20000** /day; 100000 = 100000; floor(100000/5) = 20000 |
| V26 Bill/reservation overlap blocked | 100000@10-12 09:00+03 | [] | 2026-10-17 / 500000 | rent 20000 EGP unpaid due 2026-10-15 | 20000 active linked=rent | 10-12 10:00+03 | **insufficient_data**: `overlappingReservation` (totals **null**) |
| V27 Included USD bill in EGP calculation | 100000@10-12 09:00+03 | [] | 2026-10-17 / 500000 | installment 10000 USD unpaid due 2026-10-15 | [] reviewed | 10-12 10:00+03 | **insufficient_data**: `currencyConversionNeeded` (totals **null**) |
| V28 Included USD transaction in EGP calculation | 100000@10-12 09:00+03 | expense 10000 confirmed@10-12 09:30+03 id=usd USD | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **insufficient_data**: `currencyConversionNeeded` (totals **null**) |
| V29 Stale 49-hour snapshot | 100000@10-10 09:00+03 | [] | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **insufficient_data**: `staleBalance` (totals **null**) |
| V30 Exactly 48-hour snapshot allowed | 100000@10-10 10:00+03 | [] | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **100000** total; **20000** /day; 100000 = 100000; floor(100000/5) = 20000 |
| V31 Future-dated snapshot | 100000@10-12 11:00+03 | [] | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **insufficient_data**: `futureBalanceSnapshot` (totals **null**) |
| V32 Missing snapshot amount | ∅@10-12 09:00+03 | [] | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **insufficient_data**: `balanceSnapshot.amountMinor` (totals **null**) |
| V33 Missing snapshot asOf | 100000@∅ | [] | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **insufficient_data**: `balanceSnapshot.asOf` (totals **null**) |
| V34 Missing next payday date | 100000@10-12 09:00+03 | [] | ∅ / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **insufficient_data**: `nextIncomeDate` (totals **null**) |
| V35 Payday already passed | 100000@10-18 09:00+03 | [] | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-18 10:00+03 | **insufficient_data**: `futureNextIncomeDate` (totals **null**) |
| V36 Same-day payday after midnight | 100000@10-16 23:30+03 | [] | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-17 00:05+03 | **insufficient_data**: `futureNextIncomeDate` (totals **null**) |
| V37 Missing all-account attestation | 100000@10-12 09:00+03 | [] | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 (account coverage unchecked) | **insufficient_data**: `accountCoverage` (totals **null**) |
| V38 Unreviewed cash transactions | 100000@10-12 09:00+03 | [] | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 (cash unchecked) | **insufficient_data**: `cashCoverage` (totals **null**) |
| V39 Missing obligations list | 100000@10-12 09:00+03 | [] | 2026-10-17 / 500000 | ∅ (not reviewed) | [] reviewed | 10-12 10:00+03 | **insufficient_data**: `commitmentsList` (totals **null**) |
| V40 Commitments reviewed >7 days ago | 100000@10-12 09:00+03 | [] | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 (dues reviewed@10-04 09:00+03) | **insufficient_data**: `commitmentsReview` (totals **null**) |
| V41 Unreviewed reservation list | 100000@10-12 09:00+03 | [] | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 (reservations unchecked) | **insufficient_data**: `reservationsReview` (totals **null**) |
| V42 Negative headroom MUST survive | 20000@10-12 09:00+03 | [] | 2026-10-17 / 500000 | rent 30000 EGP unpaid due 2026-10-15 | 5000 active | 10-12 10:00+03 | **-15000** total; **-3000** /day; 20000 - 30000 - 5000 = -15000; floor(-15000/5) = -3000 |
| V43 Positive piaster remainder | 100001@10-12 09:00+03 | [] | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **100001** total; **20000** /day; 100001 = 100001; floor(100001/5) = 20000 |
| V44 Negative piaster remainder | -100001@10-12 09:00+03 | [] | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **-100001** total; **-20001** /day; -100001 = -100001; floor(-100001/5) = -20001 |
| V45 Zero balance | 0@10-12 09:00+03 | [] | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **0** total; **0** /day; 0 = 0; floor(0/5) = 0 |
| V46 One calendar day remaining | 100000@10-12 09:00+03 | [] | 2026-10-13 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **100000** total; **100000** /day; 100000 = 100000; floor(100000/1) = 100000 |
| V47 Leap day 29 February 2028 | 100000@2028-02-28 09:00+02 | [] | 2028-03-01 / 500000 | rent 20000 EGP unpaid due 2028-02-29 | [] reviewed | 2028-02-28 10:00+02 | **80000** total; **40000** /day; 100000 - 20000 = 80000; floor(80000/2) = 40000 |
| V48 October/November cross-month | 100000@10-31 20:00+02 | [] | 2026-11-02 / 500000 | utility 20000 EGP unpaid due 2026-11-01 | [] reviewed | 10-31 21:00+02 | **80000** total; **40000** /day; 100000 - 20000 = 80000; floor(80000/2) = 40000 |
| V49 DST fallback repeated 23:30 | 100000@10-29 23:30+03 | [] | 2026-10-31 / 500000 | [] reviewed | [] reviewed | 10-29 23:30+02 | **100000** total; **50000** /day; 100000 = 100000; floor(100000/2) = 50000 |
| V50 After Cairo DST fallback | 100000@10-29 23:30+03 | [] | 2026-11-01 / 500000 | [] reviewed | [] reviewed | 10-30 00:30+02 | **100000** total; **50000** /day; 100000 = 100000; floor(100000/2) = 50000 |
| V51 Credit card purchase creates liability | 100000@10-12 09:00+03 | credit_purchase 35000 confirmed@10-12 09:30+03 | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **100000** total; **20000** /day; 100000 = 100000; floor(100000/5) = 20000 |
| V52 Credit card payment is cash debit | 100000@10-12 09:00+03 | credit_repayment 35000 confirmed@10-12 09:30+03 | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **65000** total; **13000** /day; 100000 - 35000 = 65000; floor(65000/5) = 13000 |
| V53 Own-account transfer net cash zero | 100000@10-12 09:00+03 | transfer_own 40000 confirmed@10-12 09:30+03 | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **100000** total; **20000** /day; 100000 = 100000; floor(100000/5) = 20000 |
| V54 Confirmed actual refund | 100000@10-12 09:00+03 | refund 7500 confirmed@10-12 09:30+03 | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **107500** total; **21500** /day; 100000 + 7500 = 107500; floor(107500/5) = 21500 |
| V55 Pending event pre-snapshot cannot rewrite it | 100000@10-12 09:00+03 | expense 7500 pending@10-12 08:45+03 | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **100000** total; **20000** /day; 100000 = 100000; floor(100000/5) = 20000 |
| V56 Unsafe integer balance blocked | 9007199254740992@10-12 09:00+03 | [] | 2026-10-17 / 500000 | [] reviewed | [] reviewed | 10-12 10:00+03 | **insufficient_data**: `invalidMinorUnits` (totals **null**) |
| V57 Expense, subscription, buffer and projected salary | 100000@10-12 09:00+03 | expense 10000 confirmed@10-12 09:30+03 | 2026-10-17 / 900000 | subscription 15000 EGP unpaid due 2026-10-15 | 5000 active | 10-12 10:00+03 | **70000** total; **14000** /day; 100000 - 10000 - 15000 - 5000 = 70000; floor(70000/5) = 14000 |
| V58 Overdue utility and confirmed income | 100000@10-12 09:00+03 | income 30000 confirmed@10-12 09:30+03 | 2026-10-17 / 500000 | utility 25000 EGP unpaid due 2026-10-09 | [] reviewed | 10-12 10:00+03 | **105000** total; **21000** /day; 100000 + 30000 - 25000 = 105000; floor(105000/5) = 21000 |
| V59 Negative floor by one piaster | 0@10-12 09:00+03 | [] | 2026-10-17 / 500000 | rent 100001 EGP unpaid due 2026-10-15 | [] reviewed | 10-12 10:00+03 | **-100001** total; **-20001** /day; 0 - 100001 = -100001; floor(-100001/5) = -20001 |

**Review notes:** 
- V08–V09 prove the snapshot timestamp boundary, V15–V17 linked settlement, V20–V22 gam'eya, V42–V44 negative/rounding, and V47–V50 leap-month-end/DST date handling. V55 deliberately places an unreviewed notification **before** the confirmed snapshot; it must not rewrite the existing confirmed balance.
- **Recurrence / metamorphic requirements, separate from tabular pre-expanded occurrences:** Weekly, fortnightly and monthly 3/4/5-payment schedules; day 31 to February (proposed **ASSUMPTION**: clamp to last day rather than skip); leap-year 29 Feb; payment rescheduling; duplicate id/mirror bank notification; linked partial installment payments; two same-amount real purchases vs duplicates; JSON backup/restore roundtrip; one-piaster underflow/overflow. Each scheduled occurrence needs a unique stable ID, and amendment may not double book previous versions.
- **Additional spring DST check:** Inject `2026-04-23T23:30:00+02:00` and next payday `2026-04-26`: `D=3`. At `2026-04-24T01:30:00+03:00`, `D=2` even though only one elapsed hour passes. Verify with a pinned IANA timezone database, not a handwritten perpetual GMT+3 offset.
- Differential reviewer must reject an implementation that returns a confident “safe” figure for any insufficient row, counts pending/postdated income, drops overdue bills, clamps negative T or uses rounded time differences in place of Cairo civil days.

## 4. Ask Folio: safe wording in English and Egyptian Arabic

**Rule:** Ask Folio must call the **same tested pure forecast** as the Home calculation. The engine may explain a hypothetical purchase `X` as `T-X` **only with status=estimate**; it must never certify that the bank will honor a payment, or imply missing bank/cash spending is absent. EGP minor values are converted to pounds only for **presentation** (/100); display in correct RTL direction, digits and signs. Never translate a positive estimate as “guaranteed.”

| State | English exact example | Egyptian Arabic exact example |
| --- | --- | --- |
| Positive | “Your **estimated discretionary amount** until {date} is **{amount} EGP** (about {daily} EGP/day), based on balances and bills you confirmed. **It's not a guarantee**; missing spending or dues could change it.” | “**المتاح تقديريًا للمصاريف الاختيارية** لحد {date} هو **{amount} جنيه** (حوالي {daily} جنيه في اليوم)، على حسب الرصيد والالتزامات اللي إنت أكّدتها. **ده تقدير مش ضمان**؛ أي مصاريف أو التزامات ناقصة ممكن تغيّره.” |
| Zero | “The provisional discretionary amount is **0 EGP**. That does not guarantee your bills are covered.” | “المتاح تقديريًا هو **صفر جنيه**. ده مش معناه إن كل التزاماتك مضمونة.” |
| Negative | “Your inputs show an **estimated shortfall of {absTotal} EGP** before {date}. Check actual balances and outstanding payments.” | “اللي متسجل عندنا بيشير إلى **عجز تقديري {absTotal} جنيه** قبل {date}. راجع رصيدك الفعلي والالتزامات اللي لسه عليك.” |
| Stale balance | “I can't calculate a reliable estimate. **Confirm an up-to-date balance** first.” | “مش هقدر أحسب تقدير يعتمد عليه دلوقتي. **أكّد رصيدك الحالي** الأول.” |
| Pending notification | “I can't calculate yet. **{n} transaction(s) need review**; unconfirmed notifications aren't treated as final spending or income.” | “مش هقدر أحسب دلوقتي. فيه **{n} عملية محتاجة مراجعة**؛ الإشعارات اللي مش مؤكدة مش بنعتبرها دخل أو مصروف نهائي.” |
| Missed payday | “That payday has passed. **Enter the next expected income date**; future pay isn't counted yet.” | “ميعاد المرتب أو الدخل اللي متسجل عدى. **حدد ميعاد الدخل المتوقع الجاي**؛ الدخل المتوقع مش محسوب قبل ما يوصل.” |
| Unreviewed bills | “Please **review all upcoming bills/installments** even if you have none, then retry.” | “راجع **الفواتير والأقساط اللي جاية** حتى لو ما عندكش التزامات، وبعدها جرّب تاني.” |
| Future gam'eya | “An expected gam'eya payout is **not included until you confirm receiving it**.” | “قبض الجمعية المتوقع **مش محسوب** غير لما تأكّد إنك استلمت الفلوس فعلًا.” |
| Hypothetical purchase | “If you spend {X} EGP now, estimated remaining headroom becomes {after} EGP. **This is not approval or a guarantee.**” | “لو صرفت {X} جنيه دلوقتي، المتاح التقديري بعد الشراء هيبقى {after} جنيه. **ده مش موافقة على الشراء ولا ضمان.**” |
| Data absent | “**Insufficient data:** I still need {missingInput}. I won't guess a spendable amount.” | “**البيانات مش كفاية:** محتاج {missingInput}. مش هخمّن لك مبلغ تقدر تصرفه.” |

**Disallowed** even when T>0: “You're safe to spend {X},” “Guaranteed until payday,” “Your bank verified ...,” “You will receive your gam'eya on time,” “اصرف براحتك”، “أكيد تقدر تشتري”، “المبلغ مضمون”. No green promise badge, fabricated “95% confidence”, speculative credit eligibility, or adding unreceived salary to available cash. If asked for certainty, explain coverage limits and suggest checking actual account balances and upcoming charges.

## 5. Grok adversarial handoff

1. **Lock this file / SHA before opening Cursor code.** Do not tune the independent expected values to match code behavior.
2. Run **all V01–V59** as black-box tests against Cursor's exported function. Compare exact integers, day count, union state, missing reason, and no hidden state mutation; adapt only input *field mapping*, not financial semantics.
3. Investigate mismatches: currency scope, status review, settled-but-unlinked obligations, paid vs unpaid, reservations overlap, net internal transfers, credit settlement, payout receipt, negative rounding, Cairo DST and stale source data. Record dissent and proposed policy explicitly in FOL-107.
4. Keep feature off by default, P0 regression first, no application code edits in this FOL-105 task. Unit passing ≠ real-world forecast accuracy or H1 validation.

**Research integrity:** No fabricated user feedback, statistics, adoption numbers or measurements. All safety thresholds and product-policy choices identified as **ASSUMPTIONS**.
