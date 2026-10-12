# Folio v0.3.40

Published release: https://github.com/mohannadzohair456-beep/folio-finance/releases/tag/v0.3.40

APK: https://github.com/mohannadzohair456-beep/folio-finance/releases/download/v0.3.40/app-release.apk

| Field | Value |
| --- | --- |
| Tag | `v0.3.40` |
| Commit | `67492f9459bc0fe1ada03f7a533a1a1370471957` |
| CI run | [38213235746](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38213235746) |
| applicationId | `com.folio.finance.app` |
| versionCode | 140 |
| versionName | 0.3.40 |
| minSdk / targetSdk | 26 / 35 |
| Label | Folio |
| APK size | 119,860 bytes |
| APK sha256 | `2b09207729aee73101e4a1e8d41ed8dacfaa6036e73a5cf5263694bfcf4024c9` |
| Signer SHA-256 | `126a716dad1de9968cfb293aa4c7b3b7567d22d1ccc36cdf62f3fdbc3ce7767f` |

The earlier main run [38212806122](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38212806122) on `db499ad` failed verification because AGP 8.7 omitted the JAR signature. That run did not upload an artifact and did not publish a release. versionCode 137 from that run was not shipped.

## What this release changes

Compared with [v0.2.33](https://github.com/mohannadzohair456-beep/folio-finance/releases/tag/v0.2.33):

- Local data is schema 1. Category budgets are stored as integer minor units. A one-time snapshot is written to `folio_finance_premigration_snapshot` before the first migration. A second launch does not multiply those amounts again. Planning fields that were already minor units stay as they are.
- Settings and Transactions can export and import the whole workspace as JSON (transactions, budgets, reported balance, salary, monthly budget, allowlists, onboarding, and extra keys such as a savings goal). CSV import still adds transactions only, and it accepts the older Folio spreadsheet, including quoted fields, Excel serial dates, and day/month/year dates.
- Incomplete v0.2.33 rows are kept when they can be read. Currency keys `egp` and `EGP` fold together. A non-array source allowlist falls back to the default SMS packages. Totals skip amounts that are not positive safe integers.
- The notification parser prefers the charged amount over a balance figure. OTP, authorization, and failed messages are dropped. A purchase that says pending is kept. The same alert is recorded once: identical text within 24 hours, or the same amount, currency, direction, and merchant within 90 seconds unless both references differ.
- Ask Folio (`assistant.js`) runs inside the WebView under the page Content-Security-Policy. A savings goal is stored on the workspace. It is not a transaction.
- The release APK is zipaligned, `resources.arsc` is stored uncompressed, and the file carries v1, v2, and v3 signatures from the pinned certificate. v4 is off.

GitHub's generated notes on the release page list pull requests [#2](https://github.com/mohannadzohair456-beep/folio-finance/pull/2), [#1](https://github.com/mohannadzohair456-beep/folio-finance/pull/1), and [#3](https://github.com/mohannadzohair456-beep/folio-finance/pull/3).

## Verification output

From the verify step of run 38213235746, after the `apksigner sign` re-sign. `zipalign -c -v 4` ended with `Verification succesful` (the tool's spelling). `resources.arsc` was stored. `unzip -t` reported no errors.

`aapt dump badging`:

```text
package: name='com.folio.finance.app' versionCode='140' versionName='0.3.40' platformBuildVersionName='15' platformBuildVersionCode='35' compileSdkVersion='35' compileSdkVersionCodename='15'
sdkVersion:'26'
targetSdkVersion:'35'
application-label:'Folio'
```

`apksigner verify --verbose --print-certs` (this uses manifest minSdk 26):

```text
Verifies
Verified using v1 scheme (JAR signing): false
Verified using v2 scheme (APK Signature Scheme v2): true
Verified using v3 scheme (APK Signature Scheme v3): true
Verified using v3.1 scheme (APK Signature Scheme v3.1): false
Verified using v4 scheme (APK Signature Scheme v4): false
Verified for SourceStamp: false
Number of signers: 1
Signer #1 certificate DN: CN=Folio Personal App, OU=Personal, O=Folio, L=Cairo, C=EG
Signer #1 certificate SHA-256 digest: 126a716dad1de9968cfb293aa4c7b3b7567d22d1ccc36cdf62f3fdbc3ce7767f
Signer #1 certificate SHA-1 digest: f89e97d23cfce1c85e54a0a7ebd1448da9fd77d9
Signer #1 certificate MD5 digest: 126ef90dc79cc7759cc9bfc50028a470
Signer #1 key algorithm: RSA
Signer #1 key size (bits): 3072
Signer #1 public key SHA-256 digest: c561ca28fbf4c129d80916a3fd09cfb6895bf90c85941697d8601686f9200883
Signer #1 public key SHA-1 digest: ed328796a3536721e86909e7b694a5ee3c368f13
Signer #1 public key MD5 digest: cf13f28df152a6aafa0cbb90018af2fd
```

`apksigner verify --verbose --min-sdk-version 23`:

```text
Verifies
Verified using v1 scheme (JAR signing): true
Verified using v2 scheme (APK Signature Scheme v2): true
Verified using v3 scheme (APK Signature Scheme v3): true
Verified using v3.1 scheme (APK Signature Scheme v3.1): false
Verified using v4 scheme (APK Signature Scheme v4): false
Verified for SourceStamp: false
Number of signers: 1
WARNING: META-INF/com/android/build/gradle/app-metadata.properties not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
WARNING: META-INF/version-control-info.textproto not protected by signature. Unauthorized modifications to this JAR entry will not be detected. Delete or move the entry outside of META-INF/.
```

`apksigner verify --verbose --min-sdk-version 26`:

```text
Verifies
Verified using v1 scheme (JAR signing): false
Verified using v2 scheme (APK Signature Scheme v2): true
Verified using v3 scheme (APK Signature Scheme v3): true
Verified using v3.1 scheme (APK Signature Scheme v3.1): false
Verified using v4 scheme (APK Signature Scheme v4): false
Verified for SourceStamp: false
Number of signers: 1
```

```text
2b09207729aee73101e4a1e8d41ed8dacfaa6036e73a5cf5263694bfcf4024c9  android/app/build/outputs/apk/release/app-release.apk
```

The release asset digest matches that sha256. The Actions artifact zip is 112,106 bytes; that number is the uploaded zip, not the APK.

## Install

Install this APK over the existing `com.folio.finance.app` signed by the same certificate. versionCode 140 is above v0.2.33's 33. Export JSON before installing if the phone already holds records you cannot afford to lose. The debug package `com.folio.finance` is a different app and will not receive this update.

The in-place data check (install v0.2.33, enter transactions, a budget, and a balance, then upgrade) was not executed. Details are in [test-results.md](../testing/test-results.md).
