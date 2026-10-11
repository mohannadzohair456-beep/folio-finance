# Folio Android Update and Data-Recovery Guide

## Safer migration: install Folio New alongside the old Folio

As of the side-by-side migration release, the permanent signed Folio Android application ID is **`com.folio.finance.app`**. Older debug test builds use **`com.folio.finance`**. Android therefore treats them as separate applications, and they can coexist on the same phone.

**DO NOT uninstall the old version first.** Keep the old Folio installed and follow this order:

1. Download and install the newest **signed** `app-release.apk` from the [latest Folio GitHub release](https://github.com/mohannadzohair456-beep/folio-finance/releases/latest). It initially appears as **Folio New** to distinguish it from the older Folio app.
2. Open the older **Folio** and use **Transactions → Export CSV**. Keep a private copy of the transaction export.
3. Open **Folio New** and finish onboarding. In **Transactions → Import CSV**, select the saved `.csv` file. Verify the amounts, dates and counts.
4. Copy any manually entered balances, expected income, budgets, notification sources and settings not covered by the CSV. The CSV currently contains only transaction history, not a full app backup.
5. **Only after verifying the new app** may you uninstall the old test Folio. Keeping the old installation until then is safe.
6. For future Folio updates, install the latest signed `app-release.apk` **over Folio New**. The application ID and signing certificate will remain stable.

Do not try to install releases tagged `v0.2.32` or old `folio-test-*` as updates to the new package: they use the legacy ID and/or debug signatures. Side-by-side migration is **a one-time new app installation**, not an in-place update of old data. It avoids deleting the old data before you verify recovery.

## Why Android says "App conflicts with existing package"

Early Folio `app-debug.apk` builds were signed with different temporary GitHub runner certificates. Although they all use `com.folio.finance`, Android rejects an update whose signing certificate does not match the installed package. Installing a newer build signed with a different certificate **cannot** preserve the original installation in place.

This is a build-pipeline mistake, not a bug in your phone. Do not keep distributing per-run debug APKs.

## Before replacing any existing Folio installation

**If you have transaction data, do not uninstall until you've saved it.**

1. Open the currently installed Folio app.
2. In Transactions, choose **Export CSV**. The older build may share CSV as text instead of a real attachment; in that case copy its complete contents into a UTF-8 text file named `folio-transactions.csv`. Check that its first line is: `Date,Direction,Merchant,Category,Amount,Currency,Source,Source package` (possibly with quotation marks).
3. Keep this private CSV file somewhere safe. It contains your transaction history.
4. The next permanently signed release includes **Transactions → Import CSV**. It validates dates, directions, currencies and amounts, and avoids importing the *same file* twice. Confirm restored transaction totals on the device.
5. Bank notification permissions and other device-only preferences might need to be reconfigured after reinstalling. Balances, overall budgets and other personal-finance data not present in the older CSV must be re-entered.

Do not uninstall if you need more complete recovery than the CSV export can provide.

## Set up permanent signing — one-time setup

The original **Folio Private Signing Kit** was supplied privately in ChatGPT. It contains:
- `folio-release.p12` — your private signing certificate/keystore.
- `FOLIO-PRIVATE-SECRETS.txt` — values for the two GitHub Actions secrets.

**Never upload the kit to this public repository, include it in a commit, share it in an issue or email its contents.** Keep a secure backup; losing the private key means you cannot update apps signed by it.

1. Open [GitHub Actions secrets](https://github.com/mohannadzohair456-beep/folio-finance/settings/secrets/actions).
2. Set (or update) `FOLIO_SIGNING_PASSWORD` to **exactly** the private kit's password on the line after `GitHub Secret Value:`. Do not add spaces or quotation marks.
3. Set (or update) `FOLIO_KEYSTORE_B64` to the complete one-line base64 value from the same private file. No spaces or line breaks.
4. Open [Build Folio APK](https://github.com/mohannadzohair456-beep/folio-finance/actions/workflows/build-apk.yml), choose **Run workflow** on `main`, and verify a green result. A failed signing check is a blocker, **not** an excuse to publish another ephemeral debug APK.
5. After the successful build, visit [Folio signed releases](https://github.com/mohannadzohair456-beep/folio-finance/releases/latest) and download `app-release.apk`. This is the new stable update identity for Folio.

The workflow checks the signing certificate SHA-256 against the public fingerprint:
`126a716dad1de9968cfb293aa4c7b3b7567d22d1ccc36cdf62f3fdbc3ce7767f`
This fingerprint is not a secret; it is an identifier for the release signing identity.

### First transition from the old test build

The debug APK and the newly signed release use different certificates. Android will not let the new APK replace the old one directly. Do not uninstall the old test build. Install the new `com.folio.finance.app` signed app alongside it, export CSV from the old one, import and verify it in the new one, then remove the old app only if you are comfortable with the recovered data.

### All subsequent updates

Commit new Folio changes to the `main` branch. GitHub Actions will create an APK signed with the same permanent certificate and a higher `versionCode`. Users can install the newer signed release over the older signed release, retaining Android app data without uninstalling.

## Tests and known limitations

- Automated tests validate parser behavior, UI and CSV import.
- Build workflow also verifies the APK package, ZIP integrity and certificate identity.
- Physical device installation and a bank's exact notification format must be tested separately.
- Folio stores money locally. The CSV export currently backs up **transactions only**, not all user preferences or the entire WebView database.
- Import validates exported Folio CSV format; it is not a universal bank-statement importer.
