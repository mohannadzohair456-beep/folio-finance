# Test results — 12 Oct 2026

Local commands below were run on this workspace after Ask Folio was wired into the page and after the v1 re-sign commit `67492f9`. Linux, OpenJDK 21 compiling with `--release 17`, Node v22.14.0. No Android SDK is installed here, so `assembleRelease` and `apksigner` were not run locally.

## Commands and results

```text
javac --release 17 -d /tmp/folio-parser-tests \
  android/app/src/main/java/com/folio/finance/TransactionParser.java \
  android/app/src/main/java/com/folio/finance/IngestionDedup.java \
  tests/ParserTest.java tests/DedupTest.java
java -cp /tmp/folio-parser-tests ParserTest
java -cp /tmp/folio-parser-tests DedupTest
node tests/money.test.cjs
node tests/ui.test.cjs
node tests/v2.test.cjs
node tests/assistant.test.cjs
```

| Command | Result |
| --- | --- |
| `ParserTest` | PASS 38 parser cases |
| `DedupTest` | PASS 13 dedup cases |
| `node tests/money.test.cjs` | PASS money, migration, backup and legacy CSV checks |
| `node tests/ui.test.cjs` | PASS bundled interface and tracking setup checks |
| `node tests/v2.test.cjs` | PASS Folio onboarding + assistant smoke tests |
| `node tests/assistant.test.cjs` | PASS 102 checks, 84 parse cases |

All six exited 0.

`money.test.cjs` includes a v0.2.33-shaped workspace: string `sources`, an ISO `balanceReportedAt`, `egp` and `EGP` budget maps, a string `amountMinor`, a null row, an unparseable timestamp, an unsafe amount, and a negative amount. It also imports a reconstructed v0.2.33 quoted CSV (including Arabic text and a comma inside a merchant) and an Excel serial date `45940`. A workspace with no `transactions` array keeps its budgets and reported balance.

`v2.test.cjs` loads `assistant.js` into the same vm as `folio-v2.js`. "I want to save 20k" then confirm stores `savingsGoalMinor` 2000000 in EGP and does not add a transaction. "budget for food is 250" stays 25000 minor units.

`ui.test.cjs` boots a hostile v0.2.33 seed and renders overview, transactions, insights, budgets, and settings. It checks the Content-Security-Policy, escaped notification text, JSON restore, the versionCode floor, and that the inlined regions match `folio-data.js`, `assistant.js`, `folio-v2.js`, and `folio-v2.css`.

## CI

| Run | What it was | Result |
| --- | --- | --- |
| [38211643821](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38211643821) | Pull request on `73713b4` | Passed tests and unsigned `assembleRelease` |
| [38213145471](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38213145471) | Pull request [#3](https://github.com/mohannadzohair456-beep/folio-finance/pull/3), assistant wired, re-sign step present | Passed tests and unsigned `assembleRelease`. Signing, verify, upload, and publish were skipped, which is what the workflow does on a pull request |
| [38212806122](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38212806122) | Push of `db499ad` to `main` | Failed at verify. `apksigner verify --verbose` printed v1 false, v2 true, v3 true. The pinned certificate matched. `aapt` showed `com.folio.finance.app`, versionCode 137, versionName 0.3.37, sdkVersion 26, label Folio. `zipalign -c -v 4` succeeded and `resources.arsc` was stored. No artifact and no release. AGP 8.7 had omitted the JAR signature because minSdk is 26 |
| [38213235746](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38213235746) | Push of `67492f9` to `main` | Passed. Re-signed APK, verified, uploaded, and published [v0.3.40](https://github.com/mohannadzohair456-beep/folio-finance/releases/tag/v0.3.40) |

Verify output from 38213235746, after re-sign:

```text
package: name='com.folio.finance.app' versionCode='140' versionName='0.3.40' platformBuildVersionName='15' platformBuildVersionCode='35' compileSdkVersion='35' compileSdkVersionCodename='15'
sdkVersion:'26'
targetSdkVersion:'35'
application-label:'Folio'
```

```text
apksigner verify --verbose --print-certs
Verified using v1 scheme (JAR signing): false
Verified using v2 scheme (APK Signature Scheme v2): true
Verified using v3 scheme (APK Signature Scheme v3): true
Signer #1 certificate SHA-256 digest: 126a716dad1de9968cfb293aa4c7b3b7567d22d1ccc36cdf62f3fdbc3ce7767f
```

```text
apksigner verify --verbose --min-sdk-version 23
Verified using v1 scheme (JAR signing): true
Verified using v2 scheme (APK Signature Scheme v2): true
Verified using v3 scheme (APK Signature Scheme v3): true
```

```text
apksigner verify --verbose --min-sdk-version 26
Verified using v1 scheme (JAR signing): false
Verified using v2 scheme (APK Signature Scheme v2): true
Verified using v3 scheme (APK Signature Scheme v3): true
```

`zipalign -c -v 4` printed `Verification succesful`. `resources.arsc` was stored. sha256 `2b09207729aee73101e4a1e8d41ed8dacfaa6036e73a5cf5263694bfcf4024c9`. Release asset size 119,860 bytes. The same digest is on the GitHub release asset.

The min-sdk 23 verify also printed:

```text
WARNING: META-INF/com/android/build/gradle/app-metadata.properties not protected by signature.
WARNING: META-INF/version-control-info.textproto not protected by signature.
```

Those warnings did not fail the job. v2 and v3 still verify.

## Headless Chrome — bundled page

This check ran before `assistant.js` was inlined. It was not repeated after that change.

`google-chrome --headless` loaded `file:///android_asset/index.html` (the asset path on disk). The strict CSP meta tag was present and both inline scripts ran (`FolioData` and `FolioV2` were defined). The first screen was onboarding step 1 of 4, "Meet Folio."

With a schema 1 workspace (EGP food budget 350000 minor, SAR shopping budget 250000 minor, Talabat EGP 19.99, Jarir SAR 86.50, reported balance, salary, and onboarding set):

- Overview showed money out as EGP 19.99 and the note "Not added into EGP totals. SAR in SAR 0, out SAR 86.50".
- Budgets showed EGP 3,500 for Food & drinks and EGP 9,000 for the monthly target, plus "Budgets in SAR are stored separately".
- Transactions exposed Import CSV, Export CSV, Import JSON, and Export JSON. A merchant of `<img src=x onerror=alert(1)>` was escaped.
- Settings described CSV as transactions only and JSON as the full workspace.
- `FolioData.buildBackup` / `restoreBackup` kept balance 421000, salary 2000000, both budgets, `com.stc.pay`, capture, and onboarding. The older CSV header imported Carrefour as 125000 minor units.

## v0.2.33 APK inspection (not an install)

The public asset `https://github.com/mohannadzohair456-beep/folio-finance/releases/download/v0.2.33/app-release.apk` (54,832 bytes) was downloaded and read as a zip.

- v2 signing block present (`0x7109871a`)
- v3 signing block absent (`0xf05368c0` not in the block)
- no v1 `META-INF` signature files
- `resources.arsc` stored, local-header data offset 4-byte aligned

`apksigner` was not run locally because the Android build-tools are not installed.

## Emulator

### In-place upgrade — not executed

Not executed: install v0.2.33, add transactions, a budget, and a balance, upgrade to v0.3.40, confirm the books are still there.

This workspace has `/dev/kvm` and no Android SDK, system image, or `adb`. The release keystore is not available and must not be created here. An unsigned APK cannot replace the signed v0.2.33 install.

### Coexistence install — executed on GitHub, not a data test

[38213352659](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38213352659) on commit `67492f9` installed two packages on one Android 10 emulator:

- `com.folio.finance` versionCode 26, versionName `0.1.26-test`, from the `folio-test-26` debug asset
- `com.folio.finance.app` versionCode 140, versionName `0.3.40`, from the latest release asset

`adb shell pm path` found both. The permanent app process was running after launch. The log ended with `SUCCESS: Both old Folio and permanently signed Folio are installed at once.` No transactions, budget, or balance were entered. v0.2.33 was not installed and was not upgraded.
