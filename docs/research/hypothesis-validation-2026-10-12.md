# Folio — Egypt User-Need Hypothesis Validation

**Requested path:** docs/research/hypothesis-validation-2026-10-12.md  
**Research cut-off:** 12 October 2026 (Africa/Cairo)  
**Research type:** Source-checked desk research and falsifiable test plan; **not** interviews, product-market fit, demand forecasting, or a market-size estimate.  
**Decision owner:** Mohannad / Grok Folio orchestrator  
**Baseline:** [Existing research brief](egypt-user-need-2026-10-12.md); Folio repository reviewed on 12 October 2026.

## Executive decision

**Rank for next research and engineering investment: H2 (visibility / low effort) > H3 (commitments) > H1 (payday affordability) as a *standalone launch promise*.** This reverses the existing brief's proposed H1-first positioning, provisionally. H1 is an attractive *outcome*, but H2 is a data-quality precondition and H3 defines essential deductions. Build a limited, explicitly provisional H1 calculator only **after** transaction coverage and obligation completeness have visible checks.

- **Source-supported:** Ipsos reported that only 26% of surveyed Egyptians felt confident managing their finances; 60% planned finances monthly, one in two overspent their budget, and one in five saved regularly (5 Nov 2024). These are survey findings, **not** evidence people want an app, payday forecasts, or a subscription. [S1]
- **Source-supported:** CBE reported 79% financial inclusion among Egyptians aged 15+ at end-June 2026, corresponding to 56.4 million active account owners across banking, postal, wallets, and prepaid products. This is **not** the number of multi-account users or a Folio TAM. [S2]
- **Source-supported but anecdotal:** One Egyptian tracker seeker said manual entry caused quitting after two weeks and that Telda plus other bank cards/InstaPay blocked one complete view; other commenters described both similar friction **and** successful long-running manual tracking. This is a self-selected Reddit discussion, not an adoption study. [S3, S4]
- **Source-supported:** The World Bank's Egypt 2024 Global Findex microdata includes 74 affirmative **unweighted records out of 1,001** on saving via a club or person outside family. The site's own warning states these are raw case counts **not population estimates**. Do **not** write “7.4% of Egyptians use gam'eya.” [S5]
- **Assumption:** The initial recruitable cohort is Egyptian Android users who combine more than one payment rail and have at least one meaningful recurring obligation. Its size, retention, willingness to pay, and willingness to grant notification access are **unknown**.

### Evidence weight at a glance

| Hypothesis | Best Egypt-specific evidence | Biggest weakness | Current verdict |
| --- | --- | --- | --- |
| **H1: Payday-to-payday affordability** | Ipsos overspending / anxiety and existing planned-expense offerings [S1, S7, S18] | No sourced evidence that an accurate payday forecast beats a ledger or commitments list in choice and repeat use; inferred bank completeness | **Plausible outcome, weakly validated wedge** |
| **H2: Zero-effort visibility** | First-person multi-rail tracking frustration **and** abandoned-app reports [S3, S4, S6] | Anecdotes are tiny and self-selected; technical capture can never promise all cash/in-app spend | **Strongest direct pain signal; technically risky** |
| **H3: Egyptian commitments** | Real local payment plans and rotating-savings product workflows [S8–S12], Findex instrument [S5] | Providers' customers are not automatically independent-budgeting customers; commitments vary by segment | **Promising differentiated workflow; segment-dependent** |

**Evidence labels used below:** **FACT** = checked original institutional/store/support/source statement; **CLAIM** = provider advertises a capability, no independent test; **ANECDOTE** = public individual report, not a representative sample; **ASSUMPTION** = analytic hypothesis or trial threshold; **UNKNOWN** = evidence not identified. As of this report there are **zero Folio user interview observations or measured retention results** available to this investigation.

---

## H1 — “How much can I spend until payday after bills?”

**Hypothesis:** The prospect of a conservative, accurate “money left until next income” calculation drives stronger repeated use than expense history or upcoming-bill reminders.

### Strongest case *for*

1. **FACT — Egypt:** Ipsos's Nov 2024 public study reports low self-described confidence, frequent financial worry, and overspending despite widespread budgeting attempts. That is consistent with a decision-support problem, although it does **not** identify payday calculations as the solution. [S1]
2. **FACT — adjacent behavior, non-Egypt:** The US CFPB's Nov 2024 Making Ends Meet research reports a deterioration in bill-payment and emergency-expense resilience. Its relevance to Egyptian payday UX is a **transferability assumption**, not direct Egyptian evidence. [S13]
3. **CLAIM — competitors:** Fenvo advertises “safe to spend” and envelope budgets for Egypt; Feloosy publicly advertises a “short before payday?” assistant example and payday-aligned cycle; Wallet provides scheduled payments/cash-flow insights; YNAB uses targets and scheduled transactions. Hence the task is intelligible enough for providers to market it. **Marketing does not prove Egyptian preference, forecast precision, or customer retention.** [S14, S15, S16, S17]
4. **ASSUMPTION:** A person making frequent optional purchases *may* value a real-time verdict more than another retrospective pie chart, **if** balances and upcoming expenses are trustworthy.

### Strongest case *against*

1. **Missing causal evidence:** Ipsos “overspend” could stem from income insufficiency, unpredictable costs, choices, or obligations rather than absence of a forecast; there is no controlled evidence for H1 over H2/H3.
2. **A wrong green light is worse than no estimate:** A stale reported balance, uncaptured cash spend, omitted gam'eya payout/contribution, misunderstood credit-card settlement, late installment, or salary arriving late can flip a “safe” verdict into a shortfall. Without source coverage, H1 creates a **trust and safety liability**.
3. **Competition and substitutes:** Envelope budgeting in YNAB already plans scarce present funds against targets and future payments (not exactly a guaranteed payday number); local competitors advertise payday-aligned months and “safe to spend.” A novel label is not a moat. [S14–S18]
4. **Unstable income:** YNAB deliberately recommends planning with money already held rather than treating anticipated pay as available now. This is a sober countermodel to naïve payday projections. [S19]
5. **Segment mismatch (ASSUMPTION):** Users paid per project or daily may not have a fixed “next payday,” making the central metaphor unhelpful.

### What would disprove H1 (pre-registered proposal; not existing data)

Among **8 eligible users with a defined next expected income date** in this week's prototype test, **at most 2** voluntarily select the forecast as the *first* tool they would use for a recent actual purchase decision after seeing all three equally polished concepts; **or** at least **3 of 8** cannot supply the required balance/due-date inputs even with guidance; **or** a blind check of **10 scenario examples** produces any confidently green output with an omitted known essential payment. These are **ASSUMPTION decision thresholds for a small pilot**, not statistical estimates. Revise H1 for narrower cohorts; a failed test is not a statement about all Egyptians.

### H1 competitor reality

- **Egypt — Telda:** sorts its own card spending and advertises budget/insight views, not a verified *cross-provider* runway. **CLAIM**, limited by its payment scope. [S20, S21]
- **Egypt — Fenvo/Feloosy:** explicitly advertise spendable amounts, payday months, and forward questions. **CLAIM**, no tested forecast correctness or retention established. Feloosy's website describes SMS-driven automation more broadly than its Google Play feature description (which emphasizes manual/receipt input): **marketing-channel discrepancy; do not resolve it by guesswork.** [S14, S15, S22]
- **Global — YNAB:** assign money on hand, targets and scheduled bills, manual/file import, eligible-region direct bank import. **FACT about published functions**, no verified Egyptian bank Direct Import: YNAB says banks outside US/Canada/UK/select European countries are unsupported. [S17–S19, S23]
- **Global — Wallet by BudgetBakers:** advertises planned payments, budget forecasts and auto-sync with thousands of global institutions; its own help calls bank sync a premium feature. **Egyptian institution coverage, sync accuracy and actual Egyptian retention unverified.** [S16, S24]

**Interim judgement:** H1 is a strong *desired end state*, not yet a credible primary adoption hook.

---

## H2 — “Show all my spending with almost no work”

**Hypothesis:** The dominant barrier to sustained expense tracking in a relevant Egyptian cohort is the effort of entering/reconciling cash, bank cards, wallets, InstaPay, Telda and installments across sources.

### Strongest case *for*

1. **ANECDOTE — Egypt, 16 Aug 2026:** A public r/PersonalFinanceEgypt author describes abandoning trackers after about two weeks due to manual entry and explicitly wants automatic consolidation of Telda, other bank cards and InstaPay. Commenters mention SMS partial automation and manual InstaPay gaps. Direct expression of the proposed job, **not** prevalence. [S3]
2. **ANECDOTE — Egypt, 25 Sep 2025 and 21 Jun 2026:** Other posters ask for Egypt-supported automatic expense capture; some recount abandoned apps and spreadsheet/notes drift. Together this is qualitative replication across posts, but still convenience-sampled and vulnerable to self-promotion. [S4, S6]
3. **FACT — market infrastructure:** CBE confirms multiple categories of active financial accounts (bank, post, wallets, prepaid). That supports a fragmented-channel *possibility*, **not** the number of individuals using several channels or the cost of entering them. [S2]
4. **CLAIM — competition:** Yabi, Folosy and HomeSum each advertise SMS/notification-assisted transaction capture for Egypt. Their product choices support the plausibility of a customer problem, but can also indicate an already contested market. [S25–S27]

### Strongest case *against*

1. **Contradictory ANECDOTE:** In the same Egyptian threads, people describe using Monefy or Wallet manually for roughly 1.5 years, aided by templates, batch entry or quick accounts. Some users may *prefer* intentional entry and awareness to invisible automation. [S3, S4]
2. **Engineering boundary:** Folio's current Android listener sees **new posted notifications from explicitly allowed packages**, after user opt-in. It does not directly connect to bank ledgers, see historical SMS, or know what cash was spent on. It cannot truthfully claim “zero effort,” “all transactions,” or automatically correct balances. See repository FinanceNotificationListener.java and architecture documentation. [R1, R2]
3. **Privacy/distribution:** Some consumers distrust SMS or notification access. Google Play restricts READ_SMS and related permissions for apps that are not eligible/default handlers. **Do not quietly add broad SMS permissions** as an assumed shortcut; assess current distribution rules separately. [S28]
4. **Crowded proposition:** Google Play publicly displays **100K+ downloads** for Yabi, **1K+** for Folosy, and **100+** for HomeSum at the time of access. These are store-install *bands*, not Egyptian monthly active users, retained users, permission consent rates, or verified working captures. Global competitor Monefy openly does **not** auto-connect to banks, yet remains a functioning manual-entry alternative. [S25–S27, S29]

### What would disprove H2

Among **6 opt-in Android multi-rail participants** who perform real transactions across a 48-hour diary, if **at least 5** say their current method already takes **at most 60 seconds per day**, **at least 5** have no unrecorded transactions in their self-audited period, and **at least 5** prefer their current routine to Folio's assisted workflow, the “manual effort is the leading bottleneck” claim fails for this cohort. Alternatively, an audited Folio capture + one-tap review that cannot reduce work *without unacceptable false financial entries* falsifies the **proposed implementation**, even if the underlying pain remains. **ASSUMPTION thresholds; directional only.**

### H2 competitor reality

- **Egypt — Yabi Money:** Google Play listing says bank transaction SMS parsing, budgets, accounts/cards/wallets/cash, on-device parsing; store shows 100K+ downloads. This is **developer CLAIM** + a visible cumulative install band, **not audited Egypt usage**. Its listed developer is a UAE entity, so do not label its installs as Egyptian. [S25]
- **Egypt — Folosy:** developer advertises offline SMS capture, named supported banks/wallets, budgets, history and backup. Store shows 1K+ installs. Developer's assertion that balance is “always accurate” is **not independently verified**. [S26]
- **Egypt/MENA — HomeSum:** advertises optional SMS + wallet notifications, user review, cash/cards, transfers, voice, receipt scan; store shows 100+ downloads. Actual quality/usage **UNKNOWN**. [S27]
- **Egypt — Telda:** issuer/card-app transaction alerts and category insights, but not evidence of whole-of-Egypt multi-bank aggregation. [S20, S21]
- **Global — Wallet:** claims bank sync, CSV/OFX/XLS import, multiple accounts, planned payments; supports manual cash entry. Egyptian bank coverage and correctness **UNKNOWN**; bank sync is premium. [S16, S24, S30]
- **Global — Monefy:** two-tap manual entry, separate accounts, category budgets, CSV export and optional cloud sync; explicitly does not auto-connect to banks. A direct competitor in **low friction**, not in full automatic capture. [S29, S31]
- **Global — YNAB:** optional linked import in supported regions, manual/file workflows otherwise; expressly excludes Egyptian institutions from Direct Import geography. File import is not available on Android itself per YNAB's current help. [S18, S23, S32]
- **Egypt — Qersh/Ledgr:** self-described local developers publicly discuss SMS parsing, gam'eya/installments and cross-account tracking. **ANECDOTAL developer claims**, not independently tested releases or adoption; important warnings against asserting Folio is “first.” [S33, S34]

**Interim judgement:** The clearest observed statement of unmet need, but Folio must win on **measured capture coverage, correction time, transparency and permission trust**, not “100% automatic.”

---

## H3 — “Remember my real Egyptian obligations”

**Hypothesis:** People have more urgent recurring-payment uncertainty than expense categorization: BNPL/installments, gam'eya pay-ins and payouts, supporting family, school/rent, debt repayment and irregular income. Explicit schedules may create habit without complete automatic capture.

### Strongest case *for*

1. **FACT — actual local workflows:** Sympl documents 3/4/5 weekly, fortnightly or monthly installments and card auto-debit; ContactNow describes installment balances, due dates and payment history; valU advertises selectable long-term purchase plans; Halan advertises consumer financing and salary advances; Khazna advertises earned-wage access and paying bills. These are concrete *financial commitments that can exist*, **not evidence Folio customers use them**. [S8–S12]
2. **FACT — gam'eya is real, with nontrivial timing:** Money Fellows describes contributions, a numbered payout slot, 6/10/12-month circles and fees that vary by slot. A circle's **monthly contribution and future lump-sum payout are different cash-flow events**. The World Bank's Egypt Findex has a savings-club measure and historic World Bank work describes game'ya practice. The current microdata raw count **does not authorize a population-prevalence claim**. [S5, S35, S36]
3. **FACT — broader household role:** Ipsos says family is a key source of financial advice/support in its Egypt report. This makes a household/family-obligation hypothesis reasonable, but **does not measure remittance amounts, frequency or desired app features**. [S1]
4. **CLAIM — directly competing apps:** HomeSum advertises regional installments and gam'eya; Feloosy recurring commitments/payday months; Qersh publicly claims gam'eya/household accounts. Specificity itself is **not unique**. [S22, S27, S33]
5. **ASSUMPTION:** A repayment calendar that prevents forgetting a due payment could earn weekly trust even when the user cannot track every daily cash purchase.

### Strongest case *against*

1. **No segment prevalence proof:** CBE financial inclusion, a BNPL provider's payment plans, or Money Fellows' marketing-user count do not establish how many target users have two-plus monthly obligations, use informal circles, or would switch to Folio. [S2, S35]
2. **Adoption ceiling:** The World Bank Findex savings-club variable has only 74 yes cases out of 1,001 *unweighted survey records* and is not a population estimate; gam'eya-first branding would likely exclude people without circles. [S5]
3. **Provider-native tracking already exists:** Sympl shows due dates and automatically charges a card; ContactNow lets customers inspect/pay installments; Money Fellows handles its own pay-in/out. Users might not need an additional app for each individual provider. [S8, S9, S35]
4. **Error costs:** Duplicate purchase cost vs installment principal, statement settlement, fee and monthly due, gam'eya pay-in/payout, prepayment and a missed installment can all produce serious double-counting. Treat provider-specific inference as unverified until reconciled against a user-approved schedule.
5. **Irregular-income claim is under-sourced:** This report verified the existence of products and a family-support survey observation, **not** the share of irregular earners among Folio prospects or whether they need a “payday.” Label all proposed irregular-income segmentation as **ASSUMPTION**.

### What would disprove H3

Of **12 recruited target people**, if **fewer than 3** can recall any personal fixed or contingent obligation due in the next 30 days beyond routine basic spending, **fewer than 2** say they currently risk missing/miscalculating an obligation, and after a realistic due-date prototype **fewer than 2** voluntarily save a future commitment for a reminder, do **not** prioritize H3 for that cohort. Run separately among known installment/gam'eya users before rejecting a narrower niche. **ASSUMPTION pilot cutoffs, not nationwide conclusions.**

### H3 competitor reality

- **Egypt — valU:** BNPL/financing and selectable repayment tenors, plus other finance/savings products; **not** evidence of all-provider household budgeting. [S10]
- **Egypt — Sympl:** 3/4/5 installments; the app tracks due dates; automatically debits an eligible bank card. Provider-level scheduling, not an aggregator. [S8]
- **Egypt — Contact/ContactNow:** financing, outstanding dues, due dates, payment history and electronic repayment options; not a demonstrated cross-provider ledger. [S9]
- **Egypt/MENA — MNT-Halan/Halan:** lending, consumer installments, salary advances, transfers and other financial services; financial-service distribution is **not** independent evidence of willingness to use Folio. [S11]
- **Egypt — Khazna:** payroll-linked early salary access, bill pay, salary-slip views and installments; solves liquidity/access, not the same product category as an offline tracker. [S12]
- **Egypt — Money Fellows:** rotating circles with explicit contributions and payout slots; primarily a *savings-circle service*, not a neutral commitments calendar across multiple providers. Self-reported “over 8 million users” on its website is **provider claim**, not independently verified actives, and **not Folio TAM**. [S35]
- **Egypt/MENA — HomeSum and Feloosy:** advertised installment/gam'eya vs broader financial commitments; neither set of marketed capabilities is a proven quality or adoption study. [S22, S27]
- **Global — Wallet:** planned payments, bills and debt/loan accounts; **not culturally exclusive** to Egyptian products. [S16, S30]
- **Global — YNAB:** targets, loans, scheduled transactions and prioritize needs before new dollars are spent; does not publicly advertise an Egyptian gam'eya-native schedule. [S17, S18]
- **Global — Monefy:** manual multi-account tracking and recurring transactions (in paid offering); simpler record-keeping, less explicit native ROSCA model. [S29]

**Interim judgement:** H3 is more directly tied to actionable commitments than H1, but the gam'eya case must be tested within a relevant subsegment and cannot be generalized.

---

## Red-team: the strongest challenge to H1-first

**Best argument for H2 over H1:** Someone already *wants* to know where their money went, but abandons the recording task. Ask them for a balance, bills and daily discretionary spending to produce a forecast and Folio has merely moved the data-entry chore to onboarding and reconciliation. If bank/card/Telda/wallet notification formats are partially available and cash is invisible, Folio can output a *confident wrong* number. A fast, explicit **coverage/reconcile** loop can be valuable *without* the forecast and is an enabler of every future planning feature. In direct local anecdote, people explicitly request centralized low-manual-effort tracking, not a payday prediction. [S3, S4, S6]

**Best argument for H3 over H1:** Missing a known loan repayment, school fee or gam'eya contribution creates a concrete, dated problem. A human can usually recall an obligation schedule more reliably than every last cash expense. A well-modeled due-date calendar, payout vs contribution distinction and reminder may deliver benefit *before* capturing the full spending ledger. It also creates the missing inputs to make any future “safe to spend” calculation safer. Local providers prove these obligations are structurally real, though not how widely users need a cross-provider tool. [S8–S12, S35]

**Case that still favors H1:** A single practical purchase decision can make a compelling demonstration and combine H2+H3 into an outcome, whereas capture and bills alone may feel like unpaid bookkeeping. Test this only with transparent confidence labels and meaningful “would use before buying?” behavior. **ASSUMPTION**, not validated.

**Decision:** H1 should be a *read-only outcome of an accurate ledger plus known commitments*, not a promise placed on the welcome screen before the underlying data is trustworthy.

---

## Ranked recommendation (pre-registered reversal rules)

1. **#1 H2 — “One view with a 15-second check-in.”** Prioritize accuracy/coverage, correction, sources and balances. **Promote to wedge** if pilot assisted capture correctly reflects **at least 85% of independently tallied, *eligible and visible* notification events**, produces **zero unconfirmed high-risk classification** in synthetic tests, and **at least 4/6** testers finish a daily audit in under 60 seconds. **Downgrade** if consent, coverage or reconciliation fails. Those are **ASSUMPTION engineering/pilot gates**; “eligible visible events” excludes unobservable cash and is not a claim of total capture.
2. **#2 H3 — “Never be surprised by what you owe.”** Build fixed-obligation scheduling only if **at least 5/12** real recruited target testers have imminent obligations *and* **at least 3** choose to save one to the prototype; otherwise explore a specific known-obligation cohort and avoid gam'eya-specific marketing. **ASSUMPTION criteria.**
3. **#3 H1 — “Conservative runway, never false certainty.”** Prototype only for someone with a **fresh confirmed balance**, entered next expected income, reviewed cash transactions and confirmed next-due obligations. Raise its rank above H2 if **at least 5/8** eligible testers choose the forecast first for a relevant real purchase, understand uncertainties correctly, **and** voluntarily return to use it on a second occasion within 48 hours. **ASSUMPTION criteria.** Any “safe” decision despite a known omission is a release blocker.

These ranks are **research priorities**, not validated market shares, expected revenues or probabilities. A small convenience sample informs what to investigate next; it cannot establish national preference or demand.

---

## Exactly three cheapest validation experiments — 12–18 October 2026

All costs below are **ASSUMPTION estimates**, excluding Mohannad's own time. Ask consent; use rounded hypothetical financial values where possible; do not collect bank statements, SMS bodies, OTPs, precise balances, phone numbers, screenshots of private transactions or names of relatives. Record anonymized task outcomes only. Recruiting via contacts/communities requires community rule compliance; do not present recruit replies as representative.

### Experiment 1 — Blind, recent-behavior comparison (H1 vs H2 vs H3)

**Time / cash (ASSUMPTION):** 2–3 hours; **EGP 0**, using introductions and short calls. Recruit **12** Egyptian Android users: attempt 4 salaried/multi-source, 4 previously abandoned trackers, 4 with installments/irregular income; overlaps allowed. These are recruitment targets, not observed participation.

**Protocol:** Before pitching, ask each person: “Recall the last time you lost track of spending, almost missed a payment, or avoided a purchase because you weren't sure what was left. What exactly happened? What did you do?” Record dated examples and actual workarounds. Randomize order of **three equivalent one-screen concept cards**: A all-sources review, B payday runway with uncertainty label, C commitments calendar. Ask them to pick **one to set up today**, then require a concrete act (agree to book a 10-minute setup, add a fictional obligation or complete a dry-run). Do not lead with AI.

**Measures:** Number with real example for each job, first-choice concept, completed commitment (not hypothetical enthusiasm), setup blockers. **Directional go rule (ASSUMPTION):** Winner obtains **at least 6/12** first choices and **at least 4** genuine follow-through commitments. If split/no follow-through: **no winner**; recruit a more specific cohort.

### Experiment 2 — 48-hour private capture & friction audit (H2 feasibility)

**Time / cash (ASSUMPTION):** 3–5 hours of researcher time over two days; **EGP 0–200** if helping with travel/data. Recruit **6** Android testers who willingly use cards and/or wallet apps plus some cash. Use the current signed package only, opt-in notification access explicitly; testers may decline without penalty. **No server analytics or private message submission.**

**Protocol:** Each tester keeps a private on-device tally of actual purchases/transfers for 48h, noting *counts* by cash/bank/wallet (no merchant, account ID or amount sent to researchers). Folio's captured notifications remain local and need user verification. Tester reports counts of eligible notifications, correct matches, missed entries, false additions, transfers misclassified, time spent correcting and trust/permission discomfort. Separately replay **synthetic non-private** duplicate alerts, OTP/failed alerts, balance lines, refunds, self-transfers, installment charges and repeated equal-amount purchases in local tests; do not add READ_SMS.

**Measures:** Capture recall among **observable eligible events**, false-positive expense rate, manual seconds/day, share of all transactions invisible to notification capture, explicit permission refusals. **Go rule (ASSUMPTION):** combined **at least 30** eligible events across cohort (otherwise inconclusive), **at least 85%** eligible-event recall, no unreviewed false expense in synthetic critical scenarios, and **4/6** find the corrected ledger lower effort than their prior method. If data coverage is poor, pivot to quick reconcile, CSV/file import, templates and bank-specific quality—not “fully automatic” ads.

### Experiment 3 — Obligation-to-runway paper prototype (H3 vs H1)

**Time / cash (ASSUMPTION):** 2–3 hours; **EGP 0**, using a paper/HTML prototype and **8** consenting testers (prefer at least 4 with some known obligations; do not claim results in advance).

**Protocol:** Each person describes, without disclosing private amounts, the *types and due dates* they currently remember for next 30 days (rent, valU/Sympl/Contact, gam'eya contribution/payout, family transfers, subscriptions, irregular expected earnings). Using **fictional rounded figures**, show the same situation first as (a) due-date checklist, then (b) a conservative “spendable before next income” calculation; counterbalance presentation order. Insert one surprise due obligation and one late expected payment. Ask them to decide about a fictional EGP 1,500 purchase and to explain why the verdict changed. Offer to save a *fake* commitment in a test prototype and book a second check-in.

**Measures:** Missing obligations discovered, number who prevent a fictional shortfall, comprehension of “estimated” vs “available now,” task chosen first, actual 48-hour second-use commitment. **Go rule (ASSUMPTION):** **at least 5/8** correctly reject an unsafe purchase after a hidden bill is revealed; **at least 3/8** save an obligation for follow-up; and **zero** “safe” output when source data is known incomplete. If calendar wins, ship H3 before H1; if forecast wins with demonstrated understanding and return use, reconsider H1 rank.

**Friday decision artifact:** One anonymized spreadsheet with *intended recruit count vs actual*, inclusion criteria, interview/task protocol version, verbatim **permission-cleared non-identifying** problem quotes, choice counts, error counts, missing-source list, three pre-registered gates and a build/revise/stop conclusion. **No fabricated observations.**

---

## Exact Folio feature changes implied

### Confirmed baseline from repository (as at 12 Oct 2026)

Folio is an offline Android WebView app using **com.folio.finance.app**. There is no app INTERNET permission; localStorage workspace key is **folio_finance_v1** with schemaVersion 1; amounts are integer minor units by currency; CSV imports transactions and JSON backs up/restores the main workspace. Android **FinanceNotificationListener** processes new notifications after source allowlist + consent, stores structured parsed rows and a review flag, and ingestion deduplication exists. **Ask Folio** is a deterministic, local rule-based command engine supporting affordability-related intents; it is not a bank-connected or generative forecasting service. Existing ledger holds balance snapshots, salary targets, budgets and transactions, but **does not establish reconciled per-account real balances or a future-liability calendar**. [R1–R5]

### P0 — Safety/data confidence, regardless of hypothesis winner

1. **No silent ledger trust.** Add explicit transaction statuses **suggested / confirmed / rejected / duplicate candidate** and preserve existing imported records (migration backwards-compatible). Notify user what was captured vs not observed; don't label all accounts “synced.”
2. **Account/source provenance.** Add optional account IDs and types **cash, bank, wallet, prepaid/card, credit liability**, provenance **manual, notification, CSV**, capture timestamp and reviewedAt; assign to a source only when user confirms. Never treat cash withdrawal, transfer between own accounts, card bill repayment, refund or gam'eya payout as ordinary spending without semantic confirmation.
3. **Balance freshness & integrity.** Add per-account user-confirmed balanceMinor, asOf date, currency, and untracked-movement indicator. Expose stale or unknown state; no silently derived “bank balance” from notification events. A CSV import cannot be assumed to contain every account or transaction.
4. **Private recovery / compatibility.** Version new data fields; add migration tests and JSON roundtrip for obligations/accounts, preserve schema-1 state and compatibility with the signed package **com.folio.finance.app** and permanent signing certificate; prohibit uninstall/reset paths as “fixes.” Avoid logging raw SMS or notifications, keep permission opt-in, and check Google Play policy before any SMS permission plan. [R1–R5, S28]

### P1 — H2 first if Experiment 2 qualifies

5. **15-second “Check-in” home card:** pending notification suggestions, last confirmed balance, source-coverage indicator, “Review 3 / Missing cash? / All caught up?” controls. Completion should be functional entirely offline. Pending is **not** counted as authoritative in the runway.
6. **One-tap reconcile:** approve/edit/split/ignore suggestions with undo, source-specific rules, same-event candidate grouping across Messages and bank notifications, visible “why we think this” without retaining original sensitive bodies. Synthetic fixture tests for Egyptian Arabic numerals, OTPs, posted vs pending, duplicates, refunds and card repayment.
7. **Cash/other quick add:** category templates, amount+account+date in a small sheet, repeated purchase shortcut, voice-to-text review before save; never promise silent cash detection. CSV import should map user-selected accounts and flag fuzzy duplicate candidates; imported files stay local.
8. **Coverage denominator:** a privacy-first optional user tally (“2 cash purchases today?”), with **observed/confirmed/missing/unknown** badges; no percentage “complete” if a source cannot be measured. The existing listener is **not** a direct SMS reader and cannot see all InstaPay/card/cash events. [R1, R2]

### P2 — H3 if obligation-prototype demand qualifies

9. **Commitment entity:** local-only id, title, kind **rent / installment / gam'eya / family / utility / subscription / other**, currency, fixed-or-estimated amountMinor, due date, recurrence rule, start/end, provider label (optional), user confirmation, paid/unpaid, linked ledger payment IDs, and cancellation/state history. **No creditor integration**, account credentials, or automatic deductions.
10. **Installment schedule:** principal, down payment, fees, next date, number/interval of payments, provider label, remaining scheduled obligations; separately model card payment versus actual purchase to avoid double counting. Dates/fees must come from user-confirmed terms, not guessed from notifications.
11. **Gam'eya:** pay-in per period, payout slot/date, any fees, received/not received, and explicit separate inflow/outflow events. **Do not recognize payout as earned income**, and never add the nominal whole pot to spendable funds before receipt.
12. **Irregular income:** confirmed received vs expected uncertain income; optional range/date, reliability status; *projected* income must not increase **available now**. Add overdue/partial/shifted commitment states; local due-date reminders only with opt-in notification permission.

### P3 — H1 gated read-only payday runway (not autonomous advice)

13. Add a **pure deterministic local forecast function** with injected frozen clock. Inputs: selected currency, user-confirmed available balances **as-of**, future user-confirmed obligations before selected review date, money reserved as buffer, reviewed spending since balance snapshot; exclude unreceived future earnings from available-now.
14. Display separately **available now**, **confirmed obligations through date**, **buffer**, **provisional discretionary headroom**, **days until next known inflow**, and an optional **what-if purchase**. Negative headroom remains negative: do not clamp to zero.
15. **Confidence state:** “Estimate — missing cash/account/obligations,” “Needs updated balance,” “Unknown payday,” or “Reviewed inputs as of [date]”; **never green “safe” when material data is missing**. Account for weekends, cross-month obligations, overlapping installments, partial payments, unpaid late dues, refunds, transfers, mismatched currencies, and delayed income.
16. **Ask Folio** queries “Can I spend EGP X?” and “Will I be short?” must invoke the **same** tested forecast function as the Home card, surface data gaps, and never silently execute financial writes. Show the arithmetic and named user-confirmed obligations, not a pretend AI certainty.

### Engineering acceptance/stop gates

- **Tests:** imported JSON schema 1 → next schema roundtrip; reversibility for user-entered commitments; deterministic frozen-clock dates; every currency isolated; minor-unit safe integer overflow; month-end/leap-day rollovers; 3/4/5 Sympl payment frequencies; installment fees; received vs unreceived gam'eya pots; no duplicated card charge + bill repayment; identical notification from two packages; two different same-amount purchases; and transfer-neutral net worth.
- **Product safety:** no positive “safe” verdict with missing or stale inputs, no unauthorized SMS access, no raw financial message collection in analytics, no accidental cloud transmission, no invisible loss of exported JSON data, and no change to permanent package/signature.
- **Rollout:** leave H1 and gam'eya behind experimental flags until users demonstrate value. Focus on actual corrected transactions/obligations, time saved, second-use behavior, and setup abandonment. No DAU, retention, willingness-to-pay, or capture-accuracy statistics are asserted in this document.
- **Do not build now:** real bank credentials/screen scraping, lending or BNPL execution, a money transfer rail, promises of universal SMS support, generic AI-chat embellishment, or new mandatory broad Android permissions.

---

## Source register / verification ledger

All external links below were accessed or cross-checked **12 October 2026**. “Undated” means the live page has no clearly verified publication date; that does not imply today's publication. Live stores and provider pages can change. Links support only the specific fact/claim stated; they are **not** adoption/quality verification.

| ID | Publisher, document and date (if shown) | URL / scope and limitations |
| --- | --- | --- |
| **S1** | Ipsos Egypt, *Spotlight*Egypt — Money & Finance*, **5 Nov 2024** | https://www.ipsos.com/en-eg/spotlightegypt-money-finance — Egypt survey public summary; full methods not independently reconstructed |
| **S2** | Central Bank of Egypt, financial-inclusion announcement, **6 Aug 2026** (as-of June 2026) | https://www.cbe.org.eg/en/news-publications/news/2026/08/06/09/00/financial-inclusion-rates-6-aug-26 — account access, not Folio adoption |
| **S3** | r/PersonalFinanceEgypt, first-person thread, **16 Aug 2026** | https://www.reddit.com/r/PersonalFinanceEgypt/comments/1vprwoy/ — self-selected anecdote; comments include disagreement |
| **S4** | r/PersonalFinanceEgypt, tracking thread, **21 Jun 2026** | https://www.reddit.com/r/PersonalFinanceEgypt/comments/1ubw675/ — includes multi-year manual use; self-selected |
| **S5** | World Bank, Egypt 2024 Findex microdata (published **2025**, last modified **12 Dec 2025**), variable fin17c | https://microdata.worldbank.org/catalog/7897/variable/F1/V64?name=fin17c — **unweighted records; do not cite as population percentages** |
| **S6** | r/PersonalFinanceEgypt, Egyptian automation request, **25 Sep 2025** | https://www.reddit.com/r/PersonalFinanceEgypt/comments/1npsbrx — anecdotal |
| **S7** | Ipsos Egypt, monthly planning and overspending indicators, **5 Nov 2024** | Same source as S1; no payday-specific question substantiated |
| **S8** | Sympl official product/FAQ, **undated** | https://sympl.ai/faqs/ — 3/4/5 payments, due dates, card auto-debit; **provider feature claim** |
| **S9** | Contact official ContactNow channels, **undated** | https://contact.eg/en/payment-channels — balances, due dates, history; **provider claim** |
| **S10** | valU official platform, **undated** | https://valu.com.eg/early_settlement — BNPL terms and services; **provider claim** |
| **S11** | Halan official consumer finance and services, **undated** | https://halan.com/personal-lending/ and https://halan.com/get-money/ — **provider claim** |
| **S12** | Khazna official app services, **undated** | https://khazna.app/ — earned wages, bill payment, salary slips, installments; **provider claim** |
| **S13** | US Consumer Financial Protection Bureau, *Making Ends Meet in 2024*, **20 Nov 2024** | https://www.consumerfinance.gov/data-research/research-reports/making-ends-meet-in-2024-insights-from-the-making-ends-meet-survey/ — **US only**, not Egyptian |
| **S14** | Fenvo official landing page, **undated** | https://fenvo.com/ — EGP, voice/SMS, budget/envelopes, safe-to-spend; **provider claim** |
| **S15** | Feloosy official marketing site, **undated** | https://www.feloosy.com/ — ledger reconciliation and before-payday forecast; **provider claim**, compare S22 |
| **S16** | BudgetBakers Wallet official product page, **undated** | https://budgetbakers.com/en/products/wallet/ — budgets, planned payments, bank sync; global provider claim, Egypt coverage unknown |
| **S17** | YNAB official feature list, **undated** | https://www.ynab.com/features — target, loan planner and reports; provider functions |
| **S18** | YNAB Help, Underfunded Logic, **2 Jul 2026** | https://support.ynab.com/en_us/underfunded-a-guide-BJwPhQO09 — schedules, targets, funding priority |
| **S19** | YNAB Help, Assigning Future Income, **2 Jul 2026** | https://support.ynab.com/en_us/assigning-future-income-an-overview-BJsTo0jCq — only plan spendable current funds |
| **S20** | Telda official site, **undated** | https://telda.app/ — Telda-card notifications and spend categories; provider claim |
| **S21** | Telda App Store developer listing, **current listing undated** | https://apps.apple.com/eg/app/telda/id1519608437 — own-card insights and budgets; **listing not use evidence** |
| **S22** | Feloosy Google Play developer listing, last updated **7 Aug 2026** | https://play.google.com/store/apps/details?id=com.tadbeer.tadbeer — payday cycles, installments, manual/receipt capture; developer claim |
| **S23** | YNAB Help, My bank isn't listed, **10 Nov 2025** | https://support.ynab.com/en_us/my-bank-isnt-listed-HJivlLavle — no Egyptian direct bank import supported according to geography |
| **S24** | BudgetBakers Help, Connect bank, updated **24 Mar 2026** | https://support.budgetbakers.com/hc/en-us/articles/7076796545554-Connect-disconnect-or-reconnect-your-bank — sync premium; availability varies |
| **S25** | Yabi Money Google Play listing, updated **18 Jun 2026** | https://play.google.com/store/apps/details?id=com.yabimoney — developer SMS claims and **100K+ cumulative download band**, not Egyptian MAU |
| **S26** | Folosy Google Play listing, updated **2 Oct 2026** | https://play.google.com/store/apps/details?id=com.folosy.app — developer offline/SMS claims and **1K+ install band**, not demonstrated accuracy |
| **S27** | HomeSum Google Play listing, updated **31 Aug 2026** | https://play.google.com/store/apps/details?id=com.homesum.app — developer SMS/gam'eya claims and **100+ install band** |
| **S28** | Google Play Developer Policy, SMS and Call Log restrictions, **live as of Oct 2026** | https://support.google.com/googleplay/android-developer/answer/9888170 — distribution/compliance, not blanket ban on notification listener |
| **S29** | Monefy official product site, **undated** | https://www.monefy.com/ — explicitly manual, two-tap expense entry and no bank auto-connect; self-reported worldwide scale **not Egyptian adoption** |
| **S30** | BudgetBakers Help, account types, **14 Apr 2026** | https://support.budgetbakers.com/hc/en-us/articles/34453128217618-Adding-an-Account — cash, bank, loan, overdraft, manual |
| **S31** | Monefy official budgeting guide, **undated** | https://www.monefy.com/guide/learn-how-to-budget — manual vs linked, category and account workflows |
| **S32** | YNAB Help, File-based import, **22 Sep 2026** | https://support.ynab.com/en_us/file-based-import-a-guide-Bkj4Sszyo — web/iPad only at accessed date |
| **S33** | Qersh maker's Reddit post, **25 Jul 2026** | https://www.reddit.com/r/TellEgypt/comments/1v62s98/ — self-promotional **developer anecdote**, no independent audit |
| **S34** | Ledgr maker's Reddit post, **31 Jul 2026** | https://www.reddit.com/r/SideProject/comments/1vbzq2l/ — self-promotional **developer anecdote**, no independent audit |
| **S35** | Money Fellows official How It Works, **undated** | https://www.moneyfellows.com/en-us/how-it-works/ — contribution, slots, fees and timing. Provider homepage https://moneyfellows.com/ **self-reports** “8 million users”; actives unverified |
| **S36** | World Bank historical Egypt women/economy research, **older contextual source** | https://documents1.worldbank.org/curated/en/861491551113547855/pdf/134846-WP-PUBLIC-march-2-WB-Women-Study-EN.pdf — describes traditional ROSCAs; **historical**, not current prevalence; do not extract prevalence from PDF without independent validation |

### Folio source register (repository inspected, not external consumer research)

- **R1:** https://github.com/mohannadzohair456-beep/folio-finance/blob/main/android/app/src/main/java/com/folio/finance/FinanceNotificationListener.java — listener permission/source/queue behavior.
- **R2:** https://github.com/mohannadzohair456-beep/folio-finance/blob/main/docs/architecture/data-model.md — schema, minor units, dedup, incomplete rows, CSV/JSON boundaries.
- **R3:** https://github.com/mohannadzohair456-beep/folio-finance/blob/main/android/app/src/main/assets/assistant.js — local intent engine.
- **R4:** https://github.com/mohannadzohair456-beep/folio-finance/blob/main/docs/release/data-migration.md — update/restore and application ID.
- **R5:** https://github.com/mohannadzohair456-beep/folio-finance/blob/main/README.md — offline permissions and current product structure.

### Caveats and open questions

1. **No invented market size or interviews:** Folio conversion, willingness to pay, cohort population, active Egyptian app usage, and competitor transaction accuracy are **UNKNOWN**.
2. **Survey transferability:** Ipsos methodology was not re-estimated from microdata here, and public landing-page indicators cannot alone support subgroup claims; CFPB evidence is US only; World Bank microdata unweighted records are **not survey-weighted population estimates**.
3. **Store installation bands:** Cumulative installs can include other countries, reinstallations, inactive accounts, and prior versions. Treat them as **store-listed bands only**, not proof of habit or commercial success.
4. **Provider claims:** Neither a promotional line like “automatic/accurate” nor advertising “millions of users” is an independent audit. Feloosy's web and store descriptions differ; operational behavior **not tested**.
5. **Question that decides the roadmap:** Can Folio provide a lower-effort, *corrected and confidence-labeled* view while protecting private data, and do real users come back for that or for obligation reminders? This report specifies how to find out; it does not pretend the answer is already known.
