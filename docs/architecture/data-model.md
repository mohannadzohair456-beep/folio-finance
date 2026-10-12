# Folio data model

Folio keeps the books on the device. The WebView page is still loaded from `file:///android_asset/index.html`. That URL is the localStorage origin, so it is not changed.

## Schema

| Version | Where it lives | Category budgets | Planning amounts |
| --- | --- | --- | --- |
| 0 (no `schemaVersion`) | `localStorage['folio_finance_v1']` | Major units, such as `3500` or `3500.5` | `monthlyBudgetMinor`, `monthlyIncomeMinor`, and `reportedBalanceMinor` were already minor units |
| 1 | Same key | Integer minor units (piasters, cents, halalas) | Unchanged minor units. They are not multiplied again |

`FolioData.SCHEMA_VERSION` is `1`. Transactions have used `amountMinor` since the first build. Supported currencies are EGP, USD, SAR, AED, EUR, and GBP. Every one of those uses 2 decimal places, so minor units are `major * 100`.

A category budget of 3500 EGP in schema 0 becomes `350000`. A second launch sees `schemaVersion: 1` and leaves `350000` alone.

Rows that are missing a merchant, amount, direction, or even a usable object are kept. Demo rows (`source: 'demo'` while `demo: true`) are still removed, which is the existing sample-data transition. Unparseable budget cells are copied to `legacyUnparsedBudgets` instead of being deleted. A storage value that is not JSON is left in the pre-migration snapshot and the working copy starts empty so the page can open.

A v0.2.33 workspace can omit `transactions` and still keep its budgets and reported balance. `egp` and `EGP` category maps are folded together; a second amount for the same category is kept in `legacyUnparsedBudgets` instead of being added twice. `Expense` / `egp`, numeric strings, and ISO timestamps are normalized when the meaning is unambiguous. An unparseable timestamp stays on the row. Totals ignore non-integers, zeroes, and negative `amountMinor` values so one corrupt amount cannot erase the month. CSV export skips those incomplete rows instead of throwing, and the rows remain in the JSON workspace. A non-array allowlist is copied to `legacySources` and the working allowlist falls back to the default SMS packages.

## Pre-migration snapshot

The first time schema 0 (or a demo workspace) is opened, Folio writes `localStorage['folio_finance_premigration_snapshot']` if that key is empty. The value is:

```json
{
  "folioSnapshot": "premigration",
  "fromSchema": 0,
  "toSchema": 1,
  "state": { }
}
```

`state` is the object from before conversion. Later launches do not overwrite it. A JSON restore writes a separate `folio_finance_pre_restore_snapshot` and does not touch the pre-migration snapshot.

## JSON backup

`FolioData.buildBackup` copies the whole workspace and adds `folioBackup: 1` plus `exportedAt`. Restore accepts that envelope or a raw saved state object. It runs the same migration, so an old unversioned backup converts budgets once.

The round trip includes transactions, per-currency category budgets, reported balance and its timestamp, expected salary (`monthlyIncomeMinor`), the monthly spending target, currency, capture flag, source allowlist, onboarding (`v2Onboarded`), legacy leftovers, and any extra JSON fields that were stored.

CSV import only adds transactions. It does not replace balances or budgets. That is deliberate: the old `com.folio.finance` build can only export CSV.

## CSV that older installs actually produced

The historical export header is:

`Date,Direction,Merchant,Category,Amount,Currency,Source,Source package`

Import also accepts:

- A preamble line before that header, a UTF-8 BOM, and LF or CRLF
- Quoted or unquoted fields, including a comma inside a quoted merchant
- A missing Source or Source package column
- Semicolons, which is what some Excel locales write
- `Expense` / `Income`, plus debit/credit aliases
- Amounts with a thousands comma inside quotes (`"1,250.00"`)
- Day/month/year dates (`10/10/2026`) in addition to `YYYY-MM-DD`
- An Excel day serial such as `45940` (10 October 2025)

An invalid currency or amount rejects the whole file and leaves the saved workspace unchanged. Re-importing the same file does not duplicate rows. Ids are a hash of the file plus the row number.

## Totals and budgets

`FolioData.summarize(records, primaryCurrency)` adds only the primary currency into `income`, `expense`, and `net`. Other currencies are returned under `byCurrency` and the UI prints them as separate figures. Category budgets are already keyed by currency (`state.budgets.EGP`, `state.budgets.SAR`). The Budgets screen shows the reporting currency only.

## Duplicate notifications

`IngestionDedup` decides this before a row is queued. The source package is not part of the identity. Raw notification text is not stored.

1. Identical normalized text (SHA-256) seen in the last 24 hours is one event. Normalization is NFKC, Arabic-Indic digits folded to ASCII, case folded, and whitespace collapsed. This catches the same SMS from Messages and from the bank app, and a notification Android reposts later.
2. The same amount, currency, direction, and compatible merchant within 90 seconds is one event, unless both messages contain a reference and the references differ. Merchants are compatible when they are equal, one contains the other, or either label is the generic `Card payment` or `Incoming transfer`.
3. The same amount at the same merchant more than 90 seconds later is kept when the text differs. A bank that repeats an alert with no timestamp and no reference can still be collapsed for 24 hours by rule 1. That tradeoff is intentional so a repost is not booked twice.

The id is `fp-` plus 32 hex characters of `SHA-256(semanticKey + "|" + contentHash)`. The same text therefore has the same id even if the native memory was cleared, and the page drops a second copy with that id. Memory is capped at 200 entries.

## What is not in the JSON file

The native queue, dedup memory, observed package list, and capture diagnostics stay in the private SharedPreferences file `folio_private_ingestion`. They are operational, not the books. Capture on/off and the allowlist are also copied into the WebView state and are part of the JSON backup.
