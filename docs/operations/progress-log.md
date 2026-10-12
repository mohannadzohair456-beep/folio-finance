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

## Not done

- No emulator install of v0.2.33, no data entry on a device, and no upgrade to this build. This environment has no Android SDK image and no release keystore. Details are in `docs/release/data-migration.md` and `docs/testing/test-results.md`.
- The signed release APK is produced on the main CI workflow, which has the keystore secrets. Pull request CI compiled an unsigned release and passed the unit tests. `apksigner verify` for v1, v2, and v3 did not run on that pull request.
- Headless Chrome opened the bundled page: onboarding rendered, EGP and SAR stayed separate, budgets displayed as major currency from minor units, and JSON backup restored the workspace. There was still no emulator upgrade.
