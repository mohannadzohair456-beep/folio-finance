# Folio — Personal Finance
**Android-first, offline-first and free to install.** Branded app icon, dashboard, transactions, analytics, budgets, and optional notification recognition.

## Install the first test APK
1. Open [Builds / Actions](https://github.com/mohannadzohair456-beep/folio-finance/actions/workflows/build-apk.yml).
2. Open the newest successful run, then download the **Folio-TEST-APK** artifact and extract **app-debug.apk**.
3. Open the APK on Android, approve installation from your Files/browser when prompted, and launch **Folio**. Sample data is labeled; start a private workspace in settings.
4. This is an early **test build** signed with a temporary debug key. Future release-signed builds will **not update over a test APK**, and the debug app will need to be uninstalled. Export any transactions before that switch.

## Enable permanent, updateable signed releases
**Never upload your .p12 signing key or passwords into this repository. It is currently PUBLIC.**
Go to **Settings → Secrets and variables → Actions → New repository secret**. Use the *separate private Folio signing kit* previously provided in this conversation to add:
- `FOLIO_KEYSTORE_B64` — the encoded contents of the Folio .p12 signing key.
- `FOLIO_SIGNING_PASSWORD` — the password for that keystore (alias `folio`).

Then select **Actions → Build Folio APK → Run workflow**. With both secrets set, the workflow signs Folio, publishes a new GitHub Release, and retains an APK as an Action artifact. The release APK download page will be [Folio Releases](https://github.com/mohannadzohair456-beep/folio-finance/releases/latest), and the direct APK URL will be [app-release.apk](https://github.com/mohannadzohair456-beep/folio-finance/releases/latest/download/app-release.apk) **after the first signed release succeeds**.

## Every update
Commit changes to `main`. The same workflow tests and builds the app. With the same secret signing key, the `versionCode` increases per workflow run and you can install a newer release APK *over* the previous signed release without uninstalling. **Do not uninstall Folio or clear its data.** Export CSV as an additional precaution; full import/restore isn't implemented.

## Notification capture and privacy
Grant Android Notification Access for Folio only if you want automatic detection. The user approves which source app package names to listen to; raw notification text is **not saved**. Only new, recognizable financial notifications are converted into editable transactions. Banks have different message patterns and some will need manual entry. Folio works without Internet permission, doesn't connect to bank accounts, and stores financial information on your device. No Play Store registration needed.

## Project structure
- `android/app/src/main/assets/index.html` — premium standalone Folio interface, charts, forms, settings.
- `android/app/src/main/java/com/folio/finance/` — WebView + notification listener + local ingestion buffer + bank alert parser.
- `.github/workflows/build-apk.yml` — free cloud Android build, test APK, signed release.
- `tests/` — parser and UI sanity checks.

**Security notice:** This repository was created PUBLIC. Consider making it PRIVATE under GitHub Settings. Never upload your financial data or signing key.
