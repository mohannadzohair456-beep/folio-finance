# Folio

Offline Android finance app. Records stay on the device. There is no `INTERNET` permission and no account.

**Current signed release:** [Folio v0.3.40](https://github.com/mohannadzohair456-beep/folio-finance/releases/tag/v0.3.40) · [all releases](https://github.com/mohannadzohair456-beep/folio-finance/releases)

The file to install is `app-release.apk` from that release (119,860 bytes, versionCode 140, versionName 0.3.40, package `com.folio.finance.app`). It is signed with the pinned Folio certificate. Later releases from `main` use the same certificate and a higher versionCode, so they install over this one.

## Install or update

Android 8.0 or newer. Download `app-release.apk` on a computer if the phone browser saves GitHub's HTML page instead of the APK, then open the file from Files.

- Updating `com.folio.finance.app` when the certificate matches keeps the on-device books. Do not uninstall, and do not clear storage, unless you already have a JSON backup.
- Do not install `app-debug.apk` or a `folio-test-*` build over the permanent app. Those used other keys or the old package name `com.folio.finance`, and Android will report a conflict.
- `com.folio.finance` (the old debug id) is a different app. Its data does not move. Export CSV from it, import that CSV into the permanent app, then re-enter balances and budgets. After that, use **Settings → Export JSON**, which saves the whole workspace.

CSV import adds transactions and leaves everything else in place. JSON import replaces the workspace after writing a local snapshot. Details are in [docs/release/data-migration.md](docs/release/data-migration.md) and [SIGNING-AND-RECOVERY.md](SIGNING-AND-RECOVERY.md).

## What v0.3.40 adds over v0.2.33

- Schema 1 storage, a one-time pre-migration snapshot, and category budgets stored as minor units.
- JSON backup and restore of transactions, budgets, reported balance, salary, settings, allowlists, and onboarding.
- CSV import that accepts the older Folio spreadsheet, including quoted fields and Excel serial dates.
- Ask Folio inside the app, including a savings goal that is stored and is not a transaction.
- v1, v2, and v3 signatures, zipalign, and an uncompressed `resources.arsc`. The launcher name is Folio.

Release notes: [docs/release/release-notes.md](docs/release/release-notes.md).

## Notification capture

Notification capture is optional.

1. Finish onboarding. Tracking can be left off.
2. In Settings, turn on monitoring and grant Android notification access only if you want automatic entry.
3. Android 13 and later may block this for a sideloaded app until **Settings → Apps → Folio → Allow restricted settings** is enabled.
4. Messages packages are on the allowlist by default. A bank app is included only after you add its package name.
5. Folio reads new notifications from those packages. It does not read history, and it does not store the raw notification text.

Speech recognition, if you use the microphone button, asks Android to prefer offline recognition and requests the microphone at runtime. Folio does not add a network permission. If this phone cannot recognize speech offline, the app says so in English and Arabic. Opening the system speech screen runs in another app, which may send audio to its provider. The transcript is a draft until you confirm it. Details are in [docs/architecture/voice-privacy.md](docs/architecture/voice-privacy.md).

## Build

[Build Folio APK](https://github.com/mohannadzohair456-beep/folio-finance/actions/workflows/build-apk.yml) runs tests on pull requests and, on `main`, signs the release with `FOLIO_KEYSTORE_B64` and `FOLIO_SIGNING_PASSWORD` (alias `folio`). A main build with missing or wrong secrets fails. It does not publish a debug APK instead.

versionCode is `100 + github.run_number`. versionName is `0.3.<run_number>`. The signed file is attached to the GitHub release and uploaded as the `Folio-Updateable-Signed-APK` artifact.

Never commit the keystore or the password. The repository is public.

Device checks that do not publish a release:

- [Folio device upgrade](.github/workflows/folio-device-upgrade.yml) installs the v0.2.33 release, enters a balance, a budget, and a transaction through the UI, upgrades with `adb install -r`, and checks the screens on API 34 and API 35. On API 26 that old page does not render (Chrome 69 rejects its script), so the workflow records the blank window instead of claiming the books survived. A main build's prerelease tag is also upgraded from schema-1 v0.3.46, and that tag becomes latest only when both upgrade paths pass. The workflow clean-installs the candidate release on API 26 and API 35, and measures cold-start TotalTime for the signed v0.3.43 APK on API 26, 34, and 35. The baseline write-up is [performance-baseline.md](docs/operations/performance-baseline.md). It does not sign an APK.
- The side-by-side workflow installs the old debug package and the permanent package together. That is not an in-place upgrade.

## Layout

- `android/app/src/main/assets/` — the WebView UI, data migration, and Ask Folio.
- `android/app/src/main/java/com/folio/finance/` — WebView shell, notification listener, parser, dedup.
- `tests/` — parser, dedup, money and migration, UI, onboarding, assistant.
- `docs/` — data model, migration, test results, release notes, handoff.

## Privacy

Financial data lives in the app's WebView storage. `allowBackup` is false, so uninstalling or clearing storage deletes it unless a JSON or CSV copy exists. Do not upload a backup or the signing key to this repository.
