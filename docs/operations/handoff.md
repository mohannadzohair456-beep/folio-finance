# Handoff — 12 Oct 2026

`main` tip is `2ea93ab96753b647c1913929cb734ee53ee7590e` (`2ea93ab`, API 35 balance-step blur and withhold `always()`). `releases/latest` is [v0.3.63](https://github.com/mohannadzohair456-beep/folio-finance/releases/tag/v0.3.63). [v0.3.66](https://github.com/mohannadzohair456-beep/folio-finance/releases/tag/v0.3.66) is still a prerelease. Device run https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38267555452 tested that tag on this tip: schema-1 and v0.2.33 on API 34 printed `UPGRADE_DATA_SURVIVED 0.3.66 166`; v0.2.33 on API 35 printed `FAILED upgrade returned to onboarding and the entered records are not on screen`. `promote-release` did not run. Withhold printed `v0.3.66 prerelease=true releases/latest=v0.3.63`.

The sections below are the earlier v0.3.40 release record, not the current install target. Pull requests [#1](https://github.com/mohannadzohair456-beep/folio-finance/pull/1), [#2](https://github.com/mohannadzohair456-beep/folio-finance/pull/2), and [#3](https://github.com/mohannadzohair456-beep/folio-finance/pull/3) are merged.

## What is safe to install

| | |
| --- | --- |
| File | `app-release.apk` on the v0.3.40 release |
| Size | 119,860 bytes |
| sha256 | `2b09207729aee73101e4a1e8d41ed8dacfaa6036e73a5cf5263694bfcf4024c9` |
| Package | `com.folio.finance.app` |
| versionCode | 140 |
| Certificate SHA-256 | `126a716dad1de9968cfb293aa4c7b3b7567d22d1ccc36cdf62f3fdbc3ce7767f` |

Build [38213235746](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38213235746) produced that file, verified it, and published the release. The full `apksigner` printout is in [release-notes.md](../release/release-notes.md).

On a phone that already has `com.folio.finance.app` from v0.2.33 (versionCode 33, same certificate), this APK is an upgrade. WebView storage stays. The page migrates `folio_finance_v1` to schema 1 on first open and writes `folio_finance_premigration_snapshot` once. Export JSON from Settings or Transactions before the install if the records matter.

The old debug id `com.folio.finance` does not share that storage. CSV export from that app can be imported here. Balances, budgets, and settings from that package do not come along.

## How signing actually works

AGP 8.7 writes v2 and v3 and skips the JAR signature when `minSdk` is 24 or higher, even with `enableV1Signing` set. Run 38212806122 failed on that and published nothing. The workflow now re-signs with:

```text
apksigner sign --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true --v4-signing-enabled false --min-sdk-version 23
```

`--min-sdk-version 23` only forces the JAR signature. The manifest minSdk stays 26. CI requires v1+v2+v3 at `--min-sdk-version 23`, and v2+v3 at `--min-sdk-version 26`. A plain `apksigner verify` on this APK prints v1 false, v2 true, v3 true, and exits 0. The JAR entries `META-INF/FOLIO.SF`, `META-INF/FOLIO.RSA`, and `META-INF/MANIFEST.MF` are in the file. v1 verify also warns that `META-INF/com/android/build/gradle/app-metadata.properties` and `META-INF/version-control-info.textproto` are outside the JAR signature. v2 and v3 still cover the APK.

Do not unzip and re-zip the release APK. Do not commit a keystore. The secrets `FOLIO_KEYSTORE_B64` and `FOLIO_SIGNING_PASSWORD` stay in GitHub Actions. Alias is `folio`. There is no `INTERNET` permission. `allowBackup` stays false.

A docs-only push does not rebuild the APK. `.github/workflows/build-apk.yml` runs on `android/**`, `tests/**`, and that workflow file.

## Data behavior a later change must keep

- Storage key `folio_finance_v1`. Schema 0 category budgets are major units. Schema 1 category budgets are minor units (2 decimal places). `monthlyBudgetMinor`, `monthlyIncomeMinor`, and `reportedBalanceMinor` were already minor units before schema 1.
- Migration is idempotent. Known currency-key case is folded. A duplicate category under the other spelling is stashed, not summed. A missing `transactions` array does not throw away budgets or the reported balance. Unparseable timestamps stay on the row.
- JSON backup clones the whole state. Restore migrates, writes `folio_finance_pre_restore_snapshot`, and does not overwrite the pre-migration snapshot.
- CSV import is additive and all-or-nothing. It accepts the v0.2.33 quoted export and 5-digit Excel serial dates.
- Ask Folio is `android/app/src/main/assets/assistant.js`, inlined in `index.html` after the first script and before `folio-v2.js`. The page calls `FolioAssistant.planCommand` with `categoryBudgetsMinor` copied from the current currency. Passing schema-1 budgets through the major-unit `budgets` map would multiply them by 100. `applyDraft` stores `savingsGoalMinor`, `savingsGoalCurrency`, and an optional `savingsGoalCategory`. An unknown draft type does not persist. A currency-mismatch proposal is not filed.
- `assistant.js` must stay free of `Date.now`, `new Date`, and `fetch`. The clock is applied in `folio-v2.js`.

## Checks that ran

Local, this workspace, OpenJDK 21 with `javac --release 17`, Node v22.14.0, after the assistant was wired:

| Command | Result |
| --- | --- |
| `ParserTest` | PASS 38 |
| `DedupTest` | PASS 13 |
| `node tests/money.test.cjs` | PASS |
| `node tests/ui.test.cjs` | PASS |
| `node tests/v2.test.cjs` | PASS |
| `node tests/assistant.test.cjs` | PASS 102 checks, 84 parse cases |

Signed main CI 38213235746 succeeded. Pull-request CI [38213145471](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38213145471) succeeded on the integration branch (tests and unsigned `assembleRelease`; signing steps skipped).

## Not executed

Install v0.2.33, add transactions, a budget, and a balance, upgrade in place to v0.3.40, and confirm the data is still there. This machine has `/dev/kvm` and no `adb`, emulator, or Android SDK. The release keystore is not here and must not be created here.

GitHub run [38213352659](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38213352659) did install v0.3.40 (versionCode 140) on an Android 10 emulator beside the old debug package `com.folio.finance` versionCode 26. Both packages were present and `com.folio.finance.app` had a running process. That is a coexistence install of two application ids. It is not the upgrade test above.

Headless Chrome was used on the bundled page before `assistant.js` was inlined. It was not repeated after that wiring. `tests/ui.test.cjs` checks that the inlined `assistant.js` matches the source file.

## Open issues

- `README.md` still says CSV restore is unimplemented and that release signing is not working. Both sentences are stale. Current recovery steps are in `SIGNING-AND-RECOVERY.md` and [data-migration.md](../release/data-migration.md).
- No device has been shown upgrading v0.2.33 in place and keeping its books. The migration tests cover the stored JSON shape, including malformed v0.2.33 rows and the old CSV export.
- Plain `apksigner verify` reports v1 false because minSdk is 26. The JAR signature is present and verifies at `--min-sdk-version 23`. AGP will not emit that signature itself at this minSdk.
- The v1 verifier warns that two `META-INF` metadata files are not covered by the JAR signature.
- `setup-java` v4 and the Node 20 action runtime print deprecation annotations. They did not fail the jobs.
- `docs/operations/progress-log.md` stops at the investigation and the first pull-request build. This file and [test-results.md](../testing/test-results.md) are the record for the signed release.
