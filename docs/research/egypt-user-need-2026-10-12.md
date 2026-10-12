# Folio — Egyptian User Needs & Product Positioning Research
**Date:** 2026-10-12 (Africa/Cairo)  
**Research status:** Desk research / hypotheses — NOT validated product-market fit  
**Audience:** Product owner, Grok lead engineer, ChatGPT research/implementation, Cursor development

## 1. Executive hypothesis
**Candidate job-to-be-done:** "Before I spend money, tell me what I can safely spend until my next payday, after rent, bills, installments, savings, and irregular expenses — without making me manually register every transaction."

**Proposed positioning:** **Folio = Your payday-to-payday money copilot for Egypt.** Make the future actionable; don't just explain last month's spending.

This is a **hypothesis**, not a proven consumer demand or a release-ready feature. Test on target users before treating it as a differentiator.

## 2. Grounded market observations
- Egypt's Central Bank reports **79%** financial inclusion among adults 15+ at June 2026, **56.4 million** active account owners (bank/post/wallet/prepaid). This demonstrates digital financial usage but says nothing about willingness to use Folio or pay for it. Source: https://www.cbe.org.eg/en/news-publications/news/2026/08/06/09/00/financial-inclusion-rates-6-aug-26
- Ipsos Egypt spotlight (November 2024) reports **26%** financially confident, roughly **1 in 2** exceeding budgets, and **1 in 5** regularly saving. Different sample/time from the CBE figures; do NOT combine statistics to derive TAM. Source: https://www.ipsos.com/en-eg/spotlightegypt-money-finance
- Real qualitative posts describe (a) abandoning trackers because repeated manual entry is tiresome, (b) card+Telda+Instapay+wallet payments creating fragmented visibility, and (c) a desire for automation. Reddit is **anecdotal, self-selected**, not a statistically representative sample. Sources:
  - https://www.reddit.com/r/PersonalFinanceEgypt/comments/1vprwoy/
  - https://www.reddit.com/r/PersonalFinanceEgypt/comments/1ubw675/
  - https://www.reddit.com/r/PersonalFinanceEgypt/comments/1hd8ofu/
- U.S. CFPB research identifies difficulty meeting bills, the importance of saving buffers, and cash-flow uncertainty as finance-management problems. It may provide product-design principles, **not automatically Egyptian market evidence**. Source: https://www.consumerfinance.gov/data-research/research-reports/making-ends-meet-in-2024-insights-from-the-making-ends-meet-survey/

## 3. Competitive landscape: relevant publicly advertised features
These are store/website marketing claims, **not independently validated quality or reliability tests**.

| Product | Advertised capabilities | Implication for Folio |
| --- | --- | --- |
| Yabi Money | Egyptian bank SMS capture and budget tracking | SMS capture by itself is not a unique proposition |
| Folosy | Offline automatic bank notification tracking, Arabic/English, backup | Privacy/offline by itself is not unique |
| Fenvo | Voice expense input, SMS, wallets, envelope budgets, savings goals, "safe to spend" | Voice and a safe-to-spend label are not unique; accuracy and usefulness must differ |
| Feloosy | Cash/cards/net worth, installment commitments, payday-aligned cycle, Arabic assistant | Bills, installments, and an assistant are existing competitive features |
| HomeSum | SMS and wallet alerts, receipt entry, installments, cash/card views | Multiple-source capture and installments have competition |

Sources:
- https://play.google.com/store/apps/details?id=com.yabimoney
- https://play.google.com/store/apps/details?id=com.folosy.app
- https://fenvo.com/
- https://play.google.com/store/apps/details?id=com.tadbeer.tadbeer
- https://play.google.com/store/apps/details?id=com.homesum.app

**Do not claim Folio is 'first', 'only', or uniquely AI-powered.** Compare measured accuracy, retention, and effort rather than feature checklists.

## 4. Three highest-priority unmet-needs hypotheses
H1. **Payday runway / safe-to-spend accuracy**: Users value a reliable forecast after unavoidable expenses more than retrospective charts. Test whether they return to the forecast before purchases. Existing competitors advertise this, so differentiate on trust and measured accuracy.
H2. **Low-friction full-spend coverage**: Users quit trackers when they must reconcile cash, cards, Telda, wallets, Instapay, bank notifications. Do not assume notification access reads everything. A 15-second check-in, manual voice entry, and quick reconcile flow may help.
H3. **Egypt-first commitment planning**: Payment installments, rent, utilities, school fees, subscriptions, debt obligations, and occasional gam'eya contributions may be more valuable than generic percentage-based categories. Validate which obligations recur most often in the selected cohort.

## 5. Initial target segment and positioning experiments
Provisional segment: 22–35-year-old Android users in Egypt who receive regular or irregular income and pay via a mixture of cash, bank card, Instapay, and mobile wallets. This is a **recruitment hypothesis** (not yet segmentation evidence).

Compare these user-facing pitches without leading interviewees:
A. "Track everything automatically from one place."
B. "Know what's safe to spend until payday."
C. "Tell your money assistant your situation; it builds and maintains your plan."

**Success criterion to choose:** Users demonstrate which problem is worth solving using recent actual behaviors, return-use observations, and a credible signup/test commitment, not just verbal enthusiasm.

## 6. Research sprint: evidence before feature proliferation
### Next 10–12 interviews (not fabricated)
- Include both app adopters and tracker abandoners, salaried and irregular income, card/cash/multi-wallet combinations.
- Ask about the **last real time** they unexpectedly ran short of money before payday.
- Ask how they knew what was safe to spend and which financial obligations surprised them.
- Ask for a walk-through of their last week of payments and their current method of recording them; **do not request bank messages containing personal data**.
- Ask what automatic financial recognition gets wrong and what would make them distrust an app.
- Show **three low-fidelity concepts** (spending history, assistant, payday runway) in randomized order.
- Capture verbatim problem descriptions, frequency, workarounds, severity, willingness to return; never claim the research happened without records.

### Behavior-backed validation
- Recruit >=10 target users for interviews; >=5 independent test installations where feasible.
- Three-session test: setup, log 3+ transactions, use forecast before a hypothetical purchase.
- Ask users to predict their money-left-on-payday, then compare forecast clarity and manual effort.
- Track: time to first valid transaction, missing transaction rate per test case, weekly self-reported manual capture burden, forecast comprehension, trust rating, and successful export/restore.
- Decide build / revise / drop from evidence. Ten interviews are directional, not statistically conclusive.

## 7. Proposed first functional wedge
**Payday Money Runway** (behind an experimental feature flag until validated)
- Ask for next payday, available balance snapshot as-of timestamp, recurring bills/obligations with dates, reserved savings, known upcoming income (forecast, **not cash**).
- Render: available **now**, committed bills before payday, buffer reserved, provisional spendable amount, provisional spending-per-day, and a confidence/coverage state.
- "Can I afford 1,500 EGP?" computes before/after and warns if bills or safety buffer would be breached.
- Missing future bills, incomplete transaction coverage, stale balance, uncertain income, or wrong currency => explicit **insufficient data / estimate** state, not a green "safe" verdict.
- Transfer between own accounts must not count as income or expense; confirm deduplication and ledger invariants.
- Keep **cash, bank, wallet, card and debt** sources distinct if needed; avoid double counting.
- Egyptian Arabic conversational explanation required if targeting Arabic speakers; do not call this a full generative AI without a model.

## 8. Engineering acceptance and gate proposal
1. Financial forecast algorithm is pure, deterministic, reproducible, and tested with a frozen clock.
2. Known obligations due before payday are subtracted; uncertain future income excluded from available-now.
3. Floor at nonnegative for UI? **No** — preserve negative numbers to expose a shortfall.
4. No mix of different currencies; no silent conversions.
5. No advice from stale balance data without warning.
6. Tests cover rollover across months, missed payday, arrears, duplicate alerts, installment schedule, refunds, and refunds incorrectly flagged as spending.
7. Never promise bank-level accuracy without a connected banking interface.
8. Releases preserve `com.folio.finance.app`, signing certificate, version monotonicity, and existing data.
9. Timebox experiments; collect user evidence before expanding the feature matrix.

## 9. Decision
**Recommendation:** Focus Folio's research and next product experiment on the cash-flow / next-payday confidence job, not on generic AI chat aesthetics. Continue regression/security hardening on the current release in parallel. Do **not** claim user need is conclusively validated.

## 10. Evidence log rules
Every finding must be labeled: verified source fact / user research observation / competitor claim / hypothesis / assumption. Preserve source URL, publication date, date accessed, and whether a claim was directly tested. Do not generate fake interview notes or fabricated benchmarks.
