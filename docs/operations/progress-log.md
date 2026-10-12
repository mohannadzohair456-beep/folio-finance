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

## Not done

These three bullets described the tree at `f422d13`. The task board's 12 Oct 2026 baseline later records a signed v0.3.43 release. They are not the status of the payday runway change above.

- No emulator install of v0.2.33, no data entry on a device, and no upgrade to this build. This environment has no Android SDK image and no release keystore. Details are in `docs/release/data-migration.md` and `docs/testing/test-results.md`.
- The signed release APK is produced on the main CI workflow, which has the keystore secrets. Pull request CI compiled an unsigned release and passed the unit tests. `apksigner verify` for v1, v2, and v3 did not run on that pull request.
- Headless Chrome opened the bundled page: onboarding rendered, EGP and SAR stayed separate, budgets displayed as major currency from minor units, and JSON backup restored the workspace. There was still no emulator upgrade.
