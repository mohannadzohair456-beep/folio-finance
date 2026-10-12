# Progress log — 12 Oct 2026

Investigation was against `main` at `f422d13404d71f5d50e1c9cdcd0fae1ac512a817`. The attached audit was a starting point. These notes are what the code and the v0.2.33 APK actually showed.

## What was confirmed

- One WebView key, `folio_finance_v1`, with no schema version. `saveBudget` stored the number typed into the form (major units). Transactions already used `amountMinor`. `monthlyBudgetMinor` and the other planning fields were already minor units.
- `NativeStore.enqueue` kept only the previous signature for 120 seconds, and the signature included the source package. The same SMS from two apps did not match. The queued id was a random UUID.
- `TransactionParser.parse` took the first currency amount. `pending` was in the reject list. A balance-only message with no debit/credit verb was already ignored because both sides were false.
- `monthTx` already dropped other currencies before `txStats`. `txStats` itself would have added mixed currencies if a caller passed them. Budgets were per currency key, then compared as major units against `amountMinor / 100`.
- The manifest label was the literal `Folio New`. `strings.xml` already said Folio. There was no Gradle wrapper. versionCode defaulted to 1. CI used `github.run_number`, which is 33 on the latest release.
- No `INTERNET` permission. Notification capture and onboarding are still in the page.
- `folio-v2.css` is not empty. The audit's "0 bytes" note does not match this tree.

## What shipped

- Schema 1, a one-time pre-migration snapshot, minor-unit budgets, and JSON backup/restore of the whole workspace beside CSV. CSV import accepts the older Folio spreadsheet, including Excel semicolon exports and day/month/year dates.
- Dedup rule documented in `IngestionDedup` and in `docs/architecture/data-model.md`. Same text for 24 hours, or the same movement for 90 seconds unless the references differ.
- Parser prefers a non-balance amount near the debit or credit verb. OTP, authorization holds, declines, and balance-only messages are rejected. A purchase that says pending is kept.
- Totals and budget progress use one currency. Other currencies are listed and not added in.
- Content-Security-Policy on the bundled page (`default-src 'none'`, no network, inline script and style because the UI is generated that way). Notification and CSV strings go through `h()`.
- Gradle wrapper 8.9. App label `@string/app_name` (Folio). versionCode `100 + run number`.
- Release signing explicitly enables v1, v2, and v3 with the existing alias and pinned certificate. CI checks those schemes, zipalign, and an uncompressed `resources.arsc`.

## v0.2.33 APK

Downloaded the public release asset and read the zip. It is v2-only: no v1 JAR signature and no v3 block. `resources.arsc` is stored and 4-byte aligned. That v2-only shape is a known reason some phones report "problem parsing the package" while an emulator installs the same file. Signature conflicts are separate and happen when the certificate does not match the installed `com.folio.finance.app`.

## Update — 12 Oct 2026, hypothesis validation and the experimental payday runway

Research file `docs/research/hypothesis-validation-2026-10-12.md` is on main at `76a9f6d`. It ranks H2 (zero-effort visibility) first, H3 (commitments) second, and H1 (payday affordability) third, and it treats a payday number as safe only when the inputs are confirmed. No interviews were run for this note.

The experimental Payday Money Runway is local and off until Settings turns it on. It reads commitments with kind rent, installment, gam'eya, family, utility, subscription, or other, and an explicit paid or unpaid flag. A gam'eya payout, including the whole pot, is not added to available now before receipt, and it is not added after receipt either: received cash has to be a confirmed ledger transaction. Projected payday income stays out of available now. Notification rows still waiting for review, and rows marked suggested, rejected, or duplicate-candidate, stay out of the authoritative total and are listed separately. Incomplete or stale inputs return the status `insufficient data` and no amount. Schema version stays 1. Transaction status migration (P0.1) and per-account balance freshness (P0.3) are not in this change.

Local commands that passed on this branch before the pull request: `node tests/payday-runway.test.cjs` (71 checks), `node tests/money.test.cjs`, `node tests/assistant.test.cjs`, `node tests/ui.test.cjs`, and `node tests/v2.test.cjs`. Pull request https://github.com/mohannadzohair456-beep/folio-finance/pull/10 is merged to main as `67ae48e` (squash of `7a93591` and `b2f33b8`). PR CI succeeded: https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38247265381. The signed build of `67ae48e` succeeded: https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38248160489. The device upgrade of that signed APK succeeded, including the in-place upgrade from v0.2.33 and clean launches on API 26 and API 35: https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38248277717. Earlier upgrade runs on `76a9f6d` covered the previous signed release only.

## Update — 12 Oct 2026, transaction statuses

Schema is now 2. Category budgets still convert from major units only when the stored schema is below 1, so a schema 1 budget is not multiplied again. Each transaction gets `status`: `suggested`, `confirmed`, `rejected`, or `duplicate-candidate`. A row that already has one of those keeps it. A notification with `review: true` and no status becomes `suggested`. Every other existing row, including CSV imports and notifications that were not flagged for review, becomes `confirmed`. Suggested, rejected, and duplicate-candidate rows stay in the workspace and stay out of monthly totals and the estimated balance until someone confirms them.

The existing auto-detected review row now has Confirm, Reject, and Edit. Confirm and reject record `reviewedAt` and clear the review flag. Edit opens the current transaction form, keeps the notification source, and saves the row as confirmed. The parser and the notification dedup rules are unchanged. P0.3, per-account balance freshness, is not in this change.

The signed release that contains schema 2 is upgraded from two installed apps: v0.2.33, and the schema-1 release v0.3.46. Both jobs enter a balance, a Carrefour transaction, and a Food budget on the old app, then read those values back after the upgrade. v0.3.46 stays pinned as that schema-1 APK. An existing `folio_finance_premigration_snapshot` is not replaced. A schema-1 workspace that has no snapshot gets one on the first schema-2 open, and the next open leaves it. The page JavaScript does not use `?.` or `??`, which the Android 8 WebView cannot parse.

## Update — 12 Oct 2026, promote a release only after the device upgrade

The schema 2 build of `dbb1895` published v0.3.50 and marked it latest before the device upgrade finished: https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38250844863. That upgrade then passed on both paths, v0.2.33 and schema-1 v0.3.46, and the clean launches on API 26 and API 35 passed: https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38250977426. v0.3.50 stays the latest release.

Later main builds publish as prereleases and do not replace `releases/latest`. The device upgrade installs that tag. When the v0.2.33 path and the schema-1 path both pass, the workflow clears the prerelease flag and makes that tag latest. When either path fails, the workflow marks the tag as a prerelease and clears latest, so `releases/latest` stays on the last promoted release. The signing identity is unchanged. P0.3 is still a separate change.

## Update — 12 Oct 2026, Ask Folio estimates

Ask Folio no longer opens an affordability reply with Yes or No, and it no longer calls a locally reconciled figure a verified balance. A purchase is described as an estimated remaining amount from data the user entered, with an explicit line that the estimate is not approval and not a guarantee. Month-end projection says planned income is not money available now. A question in Arabic script, or in common Arabizi such as `a2dar ashtary`, is answered in Egyptian Arabic with Western digits. English questions stay in English. The numbers and the refusal to mix currencies are unchanged.

The signed build of `c2fa9b6` published v0.3.63: https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38255601130. Both device upgrade paths passed, and the workflow promoted that tag to latest: https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38255726069.

## FOL-108 — v0.2.33 on Android 8 does not render (12 Oct 2026)

GitHub run [38248427070](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38248427070) on `44a095c`, job `upgrade-from-v0233 (26)`.

v0.2.33 installed. `adb install` succeeded, versionName 0.2.33, versionCode 33. The process launched. After about 50 seconds the accessibility tree still had only the document title `Folio — Personal Finance` and empty `root`, `modal-root`, and `toast-region` nodes. There was no "Meet Folio". The screenshot is a blank white page under the status bar. No transactions were entered and no upgrade was installed, so this is not a data-loss result.

The `google_apis` API 26 image's WebView is Chrome 69.0.3497.100 (`com.android.chrome`). The v0.2.33 `assets/index.html` inline script uses `??` (nullish coalescing) and `?.` (optional chaining). Chrome 69 cannot parse either, so that script does not run and `render()` is never called. The same image does render v0.3.43: `clean-launch (26)` and `cold-launch-latency (26)` in that run passed. App source was not changed for this.

API 34 in the same run completed `UPGRADE_DATA_SURVIVED`. API 35 filled 8420.50, 15000, and 9000, then the Continue button was clipped at y=1897 on a 1920px screen and the tap missed. That is a driver miss, not a missing field. The driver now treats a hit point in the bottom 140px as a miss and nudges the page up before tapping. A green `v0233-page-on-api26` job prints `V0233_UI_BLANK` and is not a data-survival pass.

Cold-start TotalTime for signed v0.3.43 is recorded by `cold-launch-latency` on API 26, 34, and 35. No latency number from run 38248427070 is copied forward, because that run's API 34 and API 35 samples were not accepted by the older parser.

Run [38255733542](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38255733542) on head `a981ac3` (checkout merge `61b8b289`) is the baseline. `latency.txt` TotalTime medians for v0.3.43 are 923 ms on API 26, 1455 ms on API 34, and 2188 ms on API 35. API 34's content poll printed `LATENCY_WEBVIEW_CONTENT_FAILED` and has no content time. `v0233-page-on-api26` printed `V0233_UI_BLANK 0.2.33 33 sdk 26`. `upgrade-from-v0233` on API 34 and API 35 printed `UPGRADE_DATA_SURVIVED 0.3.61 161`. `clean-launch` on API 26 and API 35 printed `LAUNCH_OK 0.3.61 161`. The figures and the runner image `ubuntu24` `20261004.327.1` are in `docs/operations/performance-baseline.md`. A green API 26 blank job is not a data-survival pass.

## FOL-108 / FOL-113 — API 35 balance step (12 Oct 2026)

Run [38259266231](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38259266231) checked out main `b2396e9`. It was a `workflow_run` from a pull-request APK build, so `upgrade-from-schema1` was skipped. `upgrade-from-v0233 (34)` succeeded. `upgrade-from-v0233 (35)` printed `FAILED could not leave the balance step`. Artifacts `folio-upgrade-api35` are `01-onboarding.png`, `02-onboarding-filled.png`, and `03-failure.png`. The Continue button bounds were `[690,1874][1039,1920]` on a 1080×1920 screen, center y=1897. Four nudges that started on the form left that y unchanged. The focused balance field text was `8420.5061500099000, Current available balance (EGP)`: `8420.50`, then a `6` from a tap on the number pad, then `15000`, then a `9`, then `9000`. `clean-launch` on API 26 and API 35 succeeded. `promote-release` and `withhold-latest-on-failure` were both skipped. `failure()` is false when one needed job failed and the other was skipped.

The same balance miss happened on the main push of `e071dc3`: [38260676035](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38260676035). Schema 1 passed, withhold ran, and promote was skipped. v0.3.66 stayed a prerelease and `releases/latest` stayed v0.3.63.

In run 38259266231, `cold-launch-latency (34)` printed `CONTENT_FOUND=1` for two samples, then one sample of 15 dumps missed `Meet Folio`. The job still printed `LATENCY_OK` and `LATENCY_WEBVIEW_CONTENT_FAILED`. TotalTime was kept. The driver now retries a missed content sample. It does not invent a content time, and the after-upgrade data check is unchanged.

The driver and withhold fix is `52e86bf`. No application source, applicationId, or signing change.

## Update — 12 Oct 2026, balance freshness (H2)

Merged to main as `e071dc32ef2386fffc3f7829b658a684bf532e46` (https://github.com/mohannadzohair456-beep/folio-finance/pull/17, squash of `9f06f13`). This is the H2 trustworthiness slice: a figure the user typed is labeled as an entered balance, not a bank balance.

Optional `accounts` stay on schema 2. Each account stores `balanceMinor`, `asOf`, currency, type, and `untracked`. Freshness is `fresh` within 7 days, `stale` after that, and `unknown` when the amount or the time is missing. A notification after the confirmed time is an untracked movement. It does not change `balanceMinor` or `reportedBalanceMinor`. Provenance stored from a notification is kept as `manual`. Account names go through `escapeNote`. A CSV import still adds transactions only. Signing and `applicationId` `com.folio.finance.app` are unchanged.

Local node suites passed on `9f06f13` before the merge: Chrome 69 syntax, money flow, interface, onboarding and assistant, money, Ask Folio, and payday runway. Pull-request android CI succeeded: https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38259106854. The signed main build published prerelease v0.3.66: https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38260492478.

The device upgrade of that tag did not promote it: https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38260676035. `upgrade-from-schema1` printed `UPGRADE_DATA_SURVIVED 0.3.66 166`. `upgrade-from-v0233` on API 34 printed the same. API 35 failed while entering data on the old v0.2.33 page: the Continue control stayed clipped at y=1897 and the driver printed `FAILED could not leave the balance step`. `clean-launch` on API 26 and API 35 passed. `promote-release` was skipped. `withhold-latest-on-failure` printed `v0.3.66 prerelease=true releases/latest=v0.3.63`. v0.3.66 stays a prerelease. `releases/latest` stays v0.3.63. That API 35 driver miss on the old balance step is the same flake already owned by a separate `.github` change. This merge does not change workflows or signing.

## Not done

These three bullets described the tree at `f422d13`. The task board's 12 Oct 2026 baseline later records a signed v0.3.43 release. They are not the status of the payday runway change above.

- The first investigation did not install v0.2.33. The FOL-108 section above is the later emulator result: v0.2.33 installs on API 26 and its page stays blank. Data entry and the in-place upgrade were not run on that API.
- The signed release APK is produced on the main CI workflow, which has the keystore secrets. Pull request CI compiled an unsigned release and passed the unit tests. `apksigner verify` for v1, v2, and v3 did not run on that pull request.
- Headless Chrome opened the bundled page: onboarding rendered, EGP and SAR stayed separate, budgets displayed as major currency from minor units, and JSON backup restored the workspace. There was still no emulator upgrade.
