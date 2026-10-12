# Folio — Autonomous Engineering Loop Contract
**Date:** 2026-10-12; hard deadline **2026-10-13 00:00 Africa/Cairo** (until ~9.5h from 14:33 Cairo, NOT 24h).

## Objective
Grok is technical coordinator, **not** an infinitely self-prompting chatbot. ChatGPT and Cursor are execution/research contributors when actually connected. Produce verified improvements and evidence-backed product discovery; never burn all tokens on repeated self-analysis.

## Critical truth about execution
A chat prompt does not create persistent execution. The operator must have a functioning **persistent runner** (Cursor background agent/workstation process, CI dispatcher, scheduled job, or other connected environment) with real access to GitHub and an integration that can send work to Grok/ChatGPT/Cursor. A shared chat URL by itself is **not** a live messaging/API link. Never claim inter-agent communication without tool evidence.

## Heartbeat scheduling
- Runner wakes every **15 min** while deadline has not passed, with event-based wakeups on completed tasks/CI failure.
- The runner's external scheduler is essential; model responses alone cannot schedule themselves.
- Each heartbeat: inspect state -> read latest GitHub SHA and PR/CI status -> check assigned task responses -> unblock -> dispatch **bounded** tasks -> persist -> yield to runner.
- Avoid busy loops; on blocked CI, use reasonable exponential backoff. Do not make repeated calls with no new evidence.
- At most **one integration branch mutation at once**; independent tasks use separate PR branches, no rebases/reset/destructive force-push.
- Stop sending new feature tasks **at T-minus 90 min**; focus on regression and release. Stop at hard deadline, write final handoff, preserve stable signed APK.
- If autonomous execution credentials or integrations are unavailable, create paste-ready handoffs and wait for their actual delivery. Do not fabricate completed work.

## Persistent files (repo authoritative)
- `docs/operations/agent-task-board.md`: IDs, owners, branch, status, dependency, acceptance, last verified SHA.
- `docs/operations/agent-loop-events.md`: append-only timestamps/changes for each actual heartbeat.
- `docs/operations/handoff.md`: canonical current work and decision log (update carefully, retain verified facts).
- `docs/research/egypt-user-need-2026-10-12.md`: research hypotheses and cited links.
- `docs/testing/test-results.md`: actual command/run evidence (never made-up results).

## State machine
`AUDIT -> PRIORITIZE -> RESEARCH -> SPEC -> IMPLEMENT -> TEST -> REVIEW -> MERGE -> RECHECK` and repeat.
Priority order: data loss/security/signing > correctness > user friction > validated new value > decorative polish.
Each loop must yield a **delta** (commit, PR, targeted failing test and fix, research evidence, updated prioritized decision). If three loops produce no new delta, reset scope to the top blocker; do not repeat self-prompting.

### Task dispatch format
- ID, goal, files owned, existing SHA, linked design decision, acceptance cases, expected tests, deadlines, expected output: PR or commit, changes summary, test evidence, blockers.
- ChatGPT tasks: technical research, product hypothesis review, implementation in isolated files, adversarial code review, test design.
- Cursor tasks: repository refactor, Java/Gradle/device integration, UI implementation, Android instrumented tests, benchmark harness.
- Grok: orchestrate, scrutinize, independently check evidence, resolve blockers and merge approved work.
- Do not ask both agents to change one file at the same time. Grant direct GitHub access only through an authorized connection.

## Research protocol
Each hypothesis is written with baseline assumption, target segment, objective evidence, competitors, testable predictions, test method, stop rule, and tracked success metric. Seek *actual user problems* rather than endless feature lists. Any external ChatGPT research must be pasted or committed back with source URLs and explicit interpretations; no claim that Grok silently messaged ChatGPT.

## Daily release gate
1. Signed APK install and upgrade without data loss; same package/certificate and increased version code.
2. Android permission skip path, notification parser/dedup accuracy, full JSON backup restore.
3. Financial amounts safe integers/minor units, budget totals, no mixed-currency sums.
4. Parser, money math, assistant, UI, and emulator migration tests green.
5. Privacy/data security review; no secrets in GitHub/release/logs.
6. Known limitations documented. Don't infer physical phone support from emulator.
7. Stop and restore last green release if new functionality breaks any gate.

## Metrics
- Engineering: regressions escaped, CI pass %, crash-free emulator starts, existing-data retention, build reproducibility.
- Product discovery: verified interview count, top unprompted user pains, repeated behavior, test conversion, successful first capture, 7-day retention (longer horizon than this sprint).
- Research: number of *new sourced facts that change a decision*, not pages generated or agent tokens spent.

## Required progress update
Timestamp, source SHA, task board delta, PR/commit URLs, actual test commands/CI links, known blockers, best next action. Mention only verified messages received from other agents.
