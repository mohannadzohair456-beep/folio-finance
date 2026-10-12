# Data migration and install safety

## Upgrade on the same package

`applicationId` stays `com.folio.finance.app`. An upgrade signed with the pinned certificate keeps the WebView profile, so `folio_finance_v1` is still there on first launch. The page migrates it to schema 1, converts category budgets into minor units, and writes the pre-migration snapshot described in [data-model.md](../architecture/data-model.md). Transactions are not deleted because they were incomplete.

versionCode for this line is `100 + FOLIO_VERSION_CODE`. Published releases v0.2.1 through v0.2.33 used `versionCode == GitHub run_number`, and 33 is the highest of those. A local build with no env var is versionCode 100. CI passes `github.run_number`, so the next main build is `100 + run_number` (134 if the next run is 34). Either number installs over versionCode 33. versionName on CI is `0.3.<run_number>`.

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

CI runs `apksigner verify --verbose --print-certs`, checks the pinned certificate before and after the build, requires v1, v2, and v3 (`apksigner verify --verbose --min-sdk-version 26`), runs `zipalign -c -v 4` and `zipalign -c -p 4`, and checks that `resources.arsc` is stored rather than deflated. The Gradle build zipaligns before signing. Do not unzip and re-zip the APK after that. Doing so breaks the v2 digest and phones then refuse the file.

Other ways a real phone rejects the file while an emulator might not:

- The download is GitHub's HTML redirect saved as `.apk`. Check the size and sha256. A 50 KB HTML file parses as a broken package.
- The phone already has `com.folio.finance.app` signed by a different key. Android will not replace it. That is a signature conflict, not a bad zip. Do not uninstall if that copy has data; export JSON or CSV first.
- versionCode is not higher than the installed one. v0.2.33 is 33. This line starts at 100.
- The phone is below Android 8. `minSdk` is 26.
- Someone installs the legacy `com.folio.finance` debug APK and expects it to update the permanent app. They are different packages.

There is still no `INTERNET` permission. `allowBackup` stays false, so uninstall or clearing storage deletes the books unless a JSON or CSV copy exists.

## Emulator upgrade

Not executed in this workspace. There is no Android SDK or emulator image here, and there is no access to `FOLIO_KEYSTORE_B64`. An unsigned or differently signed build cannot be installed over the release-signed v0.2.33 APK. That would reproduce the signature conflict, not prove data survival. Migration of the localStorage payload is covered by `tests/money.test.cjs` and `tests/ui.test.cjs` instead.
