# Folio — Orchestrator Task Board (Initial Research Sprint)
**Baseline checked:** v0.3.43 official signed release, GitHub build/upgrade/coexistence workflows successful on 2026-10-12. Confirm fresh SHA/CI before taking any code task.

| ID | Priority | Owner | Work item | Done when | Status |
|---|---|---|---|---|---|
| FOL-101 | P0 | Grok | Audit latest release, signatures, migration and limitations vs actual repo | Source SHA, findings, CI links and risk matrix documented | TODO |
| FOL-102 | P0 | Cursor | Verify historical balances/expenses preserve semantics; threat model backup/restore + JS bridge | Regression tests, reviewable PR and emulator upgrade green | TODO |
| FOL-103 | P0 | ChatGPT | Research Egyptian user need, price/coverage/trust and competitor gaps | Sourced findings, falsifiable hypotheses, research protocol | INITIAL DESK RESEARCH COMPLETE; user studies pending |
| FOL-104 | P1 | Grok | Recruit 10 target users + three concept interviews | Genuine notes with consent, no fabricated interviews | BLOCKED: human participants required |
| FOL-105 | P1 | ChatGPT | Design Payday Money Runway PRD + financial invariants + acceptance tests | Edge-case model with no unverified safe-spend claims | TODO |
| FOL-106 | P1 | Cursor | Implement a feature-flagged pure cash-flow forecast module, independent unit tests | Demonstrably accurate on fixtures, merged only if P0 green | MERGED: https://github.com/mohannadzohair456-beep/folio-finance/pull/10 as `67ae48e`. Experimental and off by default. PR CI succeeded: https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38247265381. Device upgrade of the previous signed release (v0.2.33 in place, API 26, API 35) succeeded: https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38247341533 and https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38247372971. Post-merge signed build of `67ae48e` is in progress: https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38248160489. The device upgrade of that new APK has not finished. P0.1 and P0.3 are next and are not in this change. |
| FOL-107 | P1 | Grok | Adversarial compare ChatGPT financial engine against Cursor implementation | Documented disagreements, fixes and evidence | DEPENDS FOL-105/106 |
| FOL-108 | P1 | Cursor | Measure launch latency, JavaScript event/render bottlenecks and test Android 8/14/15 upgrade | Baseline vs after with reproducible runs | TODO |
| FOL-109 | P1 | ChatGPT | Egyptian Arabic assistant copy + failure/uncertainty microcopy | Reviewed messages, RTL UI and deterministic tests | TODO |
| FOL-110 | P0 | Grok | Release readiness, staged smoke test on owner phone | Physical-device checklist and honest limitations | BLOCKED: owner |
| FOL-111 | P2 | Grok | Identify one under-tested competitive assumption and ask ChatGPT to challenge it | Research result pasted into shared handoff or committed; actionable decision | TODO |

**Policy:** T-minus 90 minutes — no new feature merges unless fixing a P0 regression. Hard stop: 2026-10-13 00:00 Africa/Cairo.
