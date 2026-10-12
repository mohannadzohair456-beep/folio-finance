# Data migration and install safety

## Upgrade on the same package

`applicationId` stays `com.folio.finance.app`. An upgrade signed with the pinned certificate keeps the WebView profile, so `folio_finance_v1` is still there on first launch. The page migrates it to schema 1, converts category budgets into minor units, and writes the pre-migration snapshot described in [data-model.md](../architecture/data-model.md). Transactions are not deleted because they were incomplete.

versionCode for this line is `100 + FOLIO_VERSION_CODE`. Published releases v0.2.1 through v0.2.33 used `versionCode == GitHub run_number`, and 33 is the highest of those. A local build with no env var is versionCode 100. CI passes `github.run_number`. The published release [v0.3.40](https://github.com/mohannadzohair456-beep/folio-finance/releases/tag/v0.3.40) is versionCode 140 (`100 + 40`) and versionName `0.3.40`. That installs over versionCode 33.

The old debug package `com.folio.finance` is a different app. Its WebView data does not move. Export CSV from that app and import it here. Then enter balances, salary, and budgets, and export JSON.

## JSON and CSV

| Action | Effect |
| --- | --- |
| Settings or Transactions → Export JSON | Full workspace file `folio-backup.json` |
| Import JSON | Replaces the workspace after writing `folio_finance_pre_restore_snapshot` |
| Export CSV | Transactions only, original Folio columns |
| Import CSV | Adds transactions. Does not wipe balances, budgets, allowlists, or onboarding |

The share sheet sends the file through `content://com.folio.finance.app.backup/...` so a large backup is not cut off at the Binder limit. Files under 100 KB also include `EXTRA_TEXT` for apps that only read pasted text.

## Why phones said "problem parsing the package"

The published `v0.2.33` APK (54,832 bytes, release asset `app-release.apk`) was inspected locally, not installed:

- APK Signing Block id `0x7109871a` is present (v2).
- Id `0xf05368c0` is absent (no v3).
- There is no `META-INF/*.SF` JAR signature (no v1).
- `resources.arsc` is stored uncompressed and 4-byte aligned.

Emulators accept a v2-only APK. Some OEM package installers still walk the JAR signature and report **problem parsing the package** when v1 is missing. A signature mismatch is a different failure (app not installed / signatures conflict) and happens when a debug or unsigned APK is installed over `com.folio.finance.app`.

The release is signed with alias `folio` and the pinned certificate `126a716dad1de9968cfb293aa4c7b3b7567d22d1ccc36cdf62f3fdbc3ce7767f`. v3 is the same certificate with no rotation, so it can update the v2-only v0.2.33 build. v4 signing stays off because that scheme is a sidecar file and is not useful for a sideloaded GitHub APK.

AGP 8.7 does not write a JAR (v1) signature when `minSdk` is 24 or higher, even with `enableV1Signing` set. The main workflow re-signs the assembled APK with `apksigner sign --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true --min-sdk-version 23`. That flag only asks for the JAR signature. The manifest `minSdk` stays 26. CI then requires v1, v2, and v3 from `apksigner verify --min-sdk-version 23`, and v2 plus v3 from `--min-sdk-version 26`.

A plain `apksigner verify` uses the manifest minSdk. On this APK that printout says v1 is false and v2 and v3 are true, and the command still exits 0. The JAR files (`META-INF/FOLIO.SF`, `META-INF/FOLIO.RSA`, `META-INF/MANIFEST.MF`) are in the zip. v1 reports true only when the verifier is asked to judge the file as minSdk 23. API 26 devices use v2 and v3.

CI also runs `apksigner verify --verbose --print-certs`, checks the pinned certificate before and after the build, runs `zipalign -c -v 4` and `zipalign -c -p 4` on the re-signed file, and checks that `resources.arsc` is stored rather than deflated. `apksigner sign` keeps zip alignment. Do not unzip and re-zip the APK after signing. Doing so breaks the v2 digest and phones then refuse the file.

Other ways a real phone rejects the file while an emulator might not:

- The download is GitHub's HTML redirect saved as `.apk`. Check the size and sha256. A 50 KB HTML file parses as a broken package.
- The phone already has `com.folio.finance.app` signed by a different key. Android will not replace it. That is a signature conflict, not a bad zip. Do not uninstall if that copy has data; export JSON or CSV first.
- versionCode is not higher than the installed one. v0.2.33 is 33. This line starts at 100.
- The phone is below Android 8. `minSdk` is 26.
- Someone installs the legacy `com.folio.finance` debug APK and expects it to update the permanent app. They are different packages.

Schema stays 2. `alwaysReviewNotifications` and `balanceObservations` are optional. A missing setting is off, and a missing observation list is empty. A transaction that is already `suggested` stays `suggested`. A notification balance note does not replace `reportedBalanceMinor` or an account balance.

There is still no `INTERNET` permission. `RECORD_AUDIO` is the microphone for on-device speech recognition. `allowBackup` stays false, so uninstall or clearing storage deletes the books unless a JSON or CSV copy exists.

## Emulator upgrade

The in-place upgrade was not executed. This workspace has `/dev/kvm` and no Android SDK, `adb`, or system image, and it has no access to `FOLIO_KEYSTORE_B64`. An unsigned or differently signed build cannot be installed over the release-signed v0.2.33 APK. That would reproduce the signature conflict, not prove data survival. Migration of the localStorage payload is covered by `tests/money.test.cjs` and `tests/ui.test.cjs` instead.

A separate GitHub job, [38213352659](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38213352659), installed two different packages on an Android 10 emulator: the old debug app `com.folio.finance` (versionCode 26) and `com.folio.finance.app` versionCode 140 from the v0.3.40 asset. Both packages were present and the permanent app process started. That job does not install v0.2.33, does not enter transactions, a budget, or a balance, and does not upgrade one install of `com.folio.finance.app`.
