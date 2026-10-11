# Folio 2.0 Beta — Your Financial Companion

**Latest verified test build:** [Folio beta APK build #25](https://github.com/mohannadzohair456-beep/folio-finance/releases/download/folio-test-25/app-debug.apk)  
[All releases](https://github.com/mohannadzohair456-beep/folio-finance/releases) · [Product roadmap](PRODUCT-ROADMAP.md)

## What's new in Folio 2.0

- Branded 4-stage onboarding: welcome, optional financial starting balances and budgets, optional Android notification access, and setup confirmation.
- Cleaner dashboard with no notification technical controls on Home. Manage notification capture and source-app allowlists in Settings.
- Native branded launch indicator and motion-conscious premium interface.
- **Ask Folio**: text instructions, optional Android voice-to-text, expense and income entry, balance snapshots, expected salary, monthly and category budgets, cash-flow summaries, and basic affordability estimates.
- Every proposed financial write requires explicit review and confirmation. The assistant is a local rules engine, not a generative cloud AI model.
- Basic English plus limited Egyptian Arabic numeric command recognition. Speech support depends on the Android device's installed recognizer, which may send audio to its service provider.
- Reported balances are estimates: snapshot amount plus *recorded* transactions after that snapshot. Expected salary and target budgets are plans, not bank money or recorded income.

## Installation

Download the APK and open it from your Android **Files → Downloads** application. Android 8.0+ is required. A mobile browser sometimes struggles with GitHub APK redirect downloads; in that case, download the build artifact ZIP on a computer or use the direct ChatGPT attachment.

**Current limitation:** This prerelease uses a GitHub runner debug signature. It may not update over a previous Folio APK from a different build. Do not uninstall an older app that contains important records until you have reviewed and safely exported your data; CSV import/restore is not yet implemented. Stable signed releases require a correct private keystore and matching `FOLIO_KEYSTORE_B64` / `FOLIO_SIGNING_PASSWORD` secrets. The release-signing setup is currently not working.

The automated GitHub Actions build validates Java transaction parsing, existing UI behavior, onboarding and assistant commands, then publishes an APK. This is not a substitute for testing on a real device and against your own bank's alert formats.

---
# Folio — Personal Finance
**Android-first, offline-first and free to install.** Branded app icon, dashboard, transactions, analytics, budgets, and optional notification recognition.

## Install the first test APK
1. Open [Builds / Actions](https://github.com/mohannadzohair456-beep/folio-finance/actions/workflows/build-apk.yml).
2. Open the newest successful run, then download the **Folio-TEST-APK** artifact and extract **app-debug.apk**.
3. Open the APK on Android, approve installation from your Files/browser when prompted, and launch **Folio**. New installs start with a real empty workspace and a visible tracking setup guide.
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

## Getting real transactions to appear (tracking v0.2)

1. From the Folio dashboard, tap **Enable** to opt into tracking. Then tap **Allow** and grant **Notification access** through Android settings.
2. Android 13 and later may restrict this permission for sideloaded apps. If blocked, use **Android Settings → Apps → Folio → ⋮ → Allow restricted settings** only if you trust Folio, then return and grant notification access.
3. Messages notifications are approved by default. If a bank sends alerts from its own app, enable tracking first, wait for a **new notification**, then select the app package under **Recently seen apps**. Only approved sources are parsed; raw notification bodies are not saved.
4. Make a **new** transaction after setup. The dashboard shows processed, recognized and unrecognized counts to help locate failures. The app cannot read historical messages or fetch card transactions from your bank.
5. For an unsupported bank notification, enter the expense manually. You can share a fully redacted template (no names, card/account details, PINs, passwords or codes) to improve supported message patterns.
6. Totals use only the selected currency for the current calendar month. If a payment is in another currency, change **Reporting currency** in Settings.

### Signing issue

If signing secrets are present but invalid, GitHub Actions will still attempt a **test APK** fallback. GitHub permanently signed releases require the correct password for the matching private keystore. **Do not commit the private signing kit.** Installing a different-signed APK over an existing install is blocked by Android. Export data and verify backups before changing signing identity.
