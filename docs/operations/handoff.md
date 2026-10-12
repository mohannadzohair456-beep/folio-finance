# Handoff — 12 Oct 2026

## Current install

`releases/latest` is [v0.3.84](https://github.com/mohannadzohair456-beep/folio-finance/releases/tag/v0.3.84), `prerelease=false`. The asset is `app-release.apk`, 202,115 bytes, sha256 `56ec2b02065d2a08941bac094a41b14130dfa38df8166cd346ab3c0729e90bd1`. Package id remains `com.folio.finance.app`. The device gate printed versionName `0.3.84` and versionCode `184`.

The APK is the signed build of FOL-102 merge commit `43e16fdb34065f6dec8da93f4f479aad2a646b8d` ("Reject bad backups and close the WebView handler breakout"). Signed build: [38296806847](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38296806847). Device gate: [38296899803](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38296899803) (head `43e16fd`, `workflow_run`, conclusion success).

| Job | What the log printed |
| --- | --- |
| [`upgrade-from-v0233 (34)`](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38296899803/job/114970093861) | `installed old 0.2.33 33`, `STORAGE_DURABLE_BEFORE`, `installed new 0.3.84 184`, `UPGRADE_DATA_SURVIVED 0.3.84 184` |
| [`upgrade-from-v0233 (35)`](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38296899803/job/114970093913) | `UPGRADE_DATA_SURVIVED 0.3.84 184` |
| [`upgrade-from-schema1`](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38296899803/job/114970093850) | `installed old 0.3.46 146`, then `UPGRADE_DATA_SURVIVED 0.3.84 184` |
| [`promote-release`](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38296899803/job/114972732806) | `v0.3.84 prerelease=false releases/latest=v0.3.84` |
| `withhold-latest-on-failure` (114972734057) | skipped |

Schema stays 2. There is no `INTERNET` permission. Books stay on the device. FOL-102 recorded no `applicationId` or signing change. Restore rejects a backup that would misread balances or expenses, and event-handler text from notifications, quick entry, and backups cannot break out of the page. Findings are in [threat-model-2026-10-12.md](../security/threat-model-2026-10-12.md).

Promoted lineage since the earlier handoff that named v0.3.71 as latest:

| Tag | What it is |
| --- | --- |
| v0.3.71 | `c12519f` |
| v0.3.79 | FOL-117 |
| v0.3.81 | FOL-119 |
| v0.3.84 | FOL-102 security, current `releases/latest` |

The installable file is the v0.3.84 APK built from `43e16fd`. Current `main` is `9a850ab` ([PR #36](https://github.com/mohannadzohair456-beep/folio-finance/pull/36), the FOL-102 board record), which landed after that build. A docs-only push does not rebuild the APK. `.github/workflows/build-apk.yml` runs on `android/**`, `tests/**`, and that workflow file.

## Still pending

- FOL-110: a real-phone SMS sample and a physical install are still with the founder. The lines above are the emulator device gate.
- FOL-104: concept interviews stay blocked on human participants.
- This docs update records the published gate. It adds no new local test run and no new install.

## How signing actually works

AGP 8.7 writes v2 and v3 and skips the JAR signature when `minSdk` is 24 or higher, even with `enableV1Signing` set. Run 38212806122 failed on that and published nothing. The workflow now re-signs with:

```text
apksigner sign --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true --v4-signing-enabled false --min-sdk-version 23
```

`--min-sdk-version 23` only forces the JAR signature. The manifest minSdk stays 26. CI requires v1+v2+v3 at `--min-sdk-version 23`, and v2+v3 at `--min-sdk-version 26`. A plain `apksigner verify` on an APK built this way prints v1 false, v2 true, v3 true, and exits 0, because that check uses the manifest minSdk. The JAR entries `META-INF/FOLIO.SF`, `META-INF/FOLIO.RSA`, and `META-INF/MANIFEST.MF` are in the file. The v0.3.40 verify printout also warned that `META-INF/com/android/build/gradle/app-metadata.properties` and `META-INF/version-control-info.textproto` are outside the JAR signature. v2 and v3 still cover the APK. This docs update did not re-print certificates from the v0.3.84 asset.

The signed-build job still rejects an APK whose signer SHA-256 is not `126a716dad1de9968cfb293aa4c7b3b7567d22d1ccc36cdf62f3fdbc3ce7767f`. Do not unzip and re-zip the release APK. Do not commit a keystore. The secrets `FOLIO_KEYSTORE_B64` and `FOLIO_SIGNING_PASSWORD` stay in GitHub Actions. Alias is `folio`. `allowBackup` stays false.

## Data behavior a later change must keep

Standing rules. Current builds stay on schema 2. Details are in [data-model.md](../architecture/data-model.md).

- Storage key `folio_finance_v1`. Schema 0 category budgets are major units. Schema 1 and schema 2 category budgets are minor units (2 decimal places). `monthlyBudgetMinor`, `monthlyIncomeMinor`, and `reportedBalanceMinor` were already minor units before schema 1. A later launch that already sees schema 1 or 2 does not multiply those amounts again.
- Migration is idempotent. Known currency-key case is folded. A duplicate category under the other spelling is stashed, not summed. A missing `transactions` array does not throw away budgets or the reported balance. Unparseable timestamps stay on the row.
- JSON backup clones the whole state. Restore migrates, writes `folio_finance_pre_restore_snapshot`, and does not overwrite the pre-migration snapshot. A backup whose schema, amounts, or ids would misread balances or expenses is rejected. Opening data already on the device still uses the lenient migrate path.
- CSV import is additive and all-or-nothing. It accepts the v0.2.33 quoted export and 5-digit Excel serial dates. The old debug id `com.folio.finance` does not share this storage. CSV export from that app can be imported here. Balances, budgets, and settings from that package do not come along.
- Ask Folio is `android/app/src/main/assets/assistant.js`, inlined in `index.html` after the first script and before `folio-v2.js`. The page calls `FolioAssistant.planCommand` with `categoryBudgetsMinor` copied from the current currency. Passing schema-1 budgets through the major-unit `budgets` map would multiply them by 100. `applyDraft` stores `savingsGoalMinor`, `savingsGoalCurrency`, and an optional `savingsGoalCategory`. An unknown draft type does not persist. A currency-mismatch proposal is not filed.
- `assistant.js` must stay free of `Date.now`, `new Date`, and `fetch`. The clock is applied in `folio-v2.js`.

## Historical — v0.3.40 snapshot

The table below is the v0.3.40 release. It is not the current install. `main` at that snapshot was `67492f9459bc0fe1ada03f7a533a1a1370471957`. Pull requests [#1](https://github.com/mohannadzohair456-beep/folio-finance/pull/1), [#2](https://github.com/mohannadzohair456-beep/folio-finance/pull/2), and [#3](https://github.com/mohannadzohair456-beep/folio-finance/pull/3) were already merged.

| | |
| --- | --- |
| File | `app-release.apk` on the v0.3.40 release |
| Size | 119,860 bytes |
| sha256 | `2b09207729aee73101e4a1e8d41ed8dacfaa6036e73a5cf5263694bfcf4024c9` |
| Package | `com.folio.finance.app` |
| versionCode | 140 |
| Certificate SHA-256 | `126a716dad1de9968cfb293aa4c7b3b7567d22d1ccc36cdf62f3fdbc3ce7767f` |

Build [38213235746](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38213235746) produced that file. The full `apksigner` printout is in [release-notes.md](../release/release-notes.md). On a phone that already had `com.folio.finance.app` from v0.2.33 (versionCode 33, same certificate), that APK was an upgrade. The page at that release migrated `folio_finance_v1` to schema 1 on first open and wrote `folio_finance_premigration_snapshot` once.

The earlier handoff recorded these local checks for that workspace. They were not re-run for this update:

| Command | Result recorded then |
| --- | --- |
| `ParserTest` | PASS 38 |
| `DedupTest` | PASS 13 |
| `node tests/money.test.cjs` | PASS |
| `node tests/ui.test.cjs` | PASS |
| `node tests/v2.test.cjs` | PASS |
| `node tests/assistant.test.cjs` | PASS 102 checks, 84 parse cases |

Signed main CI 38213235746 succeeded. Pull-request CI [38213145471](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38213145471) succeeded on the integration branch (tests and unsigned `assembleRelease`; signing steps skipped). An in-place upgrade from v0.2.33 to v0.3.40 was not run for that snapshot. GitHub run [38213352659](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38213352659) installed v0.3.40 (versionCode 140) beside the old debug package `com.folio.finance` versionCode 26. That is a coexistence install of two application ids.

## Historical — v0.3.71 as latest

An earlier copy of this file named [v0.3.71](https://github.com/mohannadzohair456-beep/folio-finance/releases/tag/v0.3.71) as `releases/latest` (`app-release.apk`, 173,376 bytes, sha256 `7d1f51a3be87f40bd069db2d907608be4ba93d61bf440e7d4cbc40e8c7ab3258`, versionCode 171, commit `c12519f83f20943d4d5c79b3873ff6a01b3cc548`). Gate [38276697704](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38276697704) printed `UPGRADE_DATA_SURVIVED 0.3.71 171` on schema-1 and on v0.2.33 API 34 and API 35, then `promote-release` printed `v0.3.71 prerelease=false releases/latest=v0.3.71`. Later promotions moved `releases/latest` to v0.3.79, then v0.3.81, then v0.3.84. First paint landed after the v0.3.71 tag as [PR #25](https://github.com/mohannadzohair456-beep/folio-finance/pull/25) `b2f73e6` and is an ancestor of `43e16fd`.
