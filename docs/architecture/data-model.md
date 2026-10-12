# Folio data model

Folio keeps the books on the device. The WebView page is still loaded from `file:///android_asset/index.html`. That URL is the localStorage origin, so it is not changed.

## Schema

| Version | Where it lives | Category budgets | Planning amounts |
| --- | --- | --- | --- |
| 0 (no `schemaVersion`) | `localStorage['folio_finance_v1']` | Major units, such as `3500` or `3500.5` | `monthlyBudgetMinor`, `monthlyIncomeMinor`, and `reportedBalanceMinor` were already minor units |
| 1 | Same key | Integer minor units (piasters, cents, halalas) | Unchanged minor units. They are not multiplied again |
| 2 | Same key | Unchanged integer minor units | Unchanged minor units. Each transaction gains `status` |

`FolioData.SCHEMA_VERSION` is `2`. Transactions have used `amountMinor` since the first build. Supported currencies are EGP, USD, SAR, AED, EUR, and GBP. Every one of those uses 2 decimal places, so minor units are `major * 100`.

A category budget of 3500 EGP in schema 0 becomes `350000`. A later launch sees `schemaVersion` of 1 or 2 and leaves `350000` alone.

Schema 2 adds `status` on every transaction: `suggested`, `confirmed`, `rejected`, or `duplicate-candidate`. A row that already has one of those values keeps it. A notification with `review: true` and no status becomes `suggested`. Every other existing row becomes `confirmed`. Rejected, suggested, and duplicate-candidate rows stay in the workspace and stay out of monthly totals until a person confirms them. Confirm, reject, and edit are on the existing auto-detected review row. Opening the app does not change a stored status. A suggested row that was already saved stays suggested.

A new notification is different from a stored row. `FolioData.notificationIntake` confirms it only when the parser confidence is `high`, the amount is not ambiguous, it is not a possible duplicate, and `alwaysReviewNotifications` is not true. That row is stored as `confirmed` with `autoConfirmed: true` and counts in totals immediately. The transaction row offers Undo, Edit, and Reject. Undo sets the status to `rejected` and keeps the row. A low-confidence parse, an ambiguous amount, a missing confidence (an item already queued before this build), or the always-review setting stays `suggested`. `alwaysReviewNotifications` defaults to false and applies only to new intake.

`balanceObservations` is an optional list on the same schema, capped at 30. A bank message can note the balance it stated, with `observedAt`, currency, `source: notification`, and `provenance: notification`. That note is not a transaction and it does not change `reportedBalanceMinor`, `balanceReportedAt`, or an account balance. The confirmed-balance freshness rules are unchanged.

`accounts` is an optional list on the same schema. Each account stores a user-confirmed `balanceMinor`, `asOf`, `currency`, `type` (`cash`, `bank`, `wallet`, `prepaid`, or `credit`), and `untracked`. Provenance is `manual` or `csv`. A notification is never stored as the source of a balance, and notification rows do not change `balanceMinor` or `reportedBalanceMinor`. Freshness is `fresh` when `asOf` is within 7 days, `stale` when it is older, and `unknown` when the amount or the time is missing. A CSV import adds transactions only.

Rows that are missing a merchant, amount, direction, or even a usable object are kept. Demo rows (`source: 'demo'` while `demo: true`) are still removed, which is the existing sample-data transition. Unparseable budget cells are copied to `legacyUnparsedBudgets` instead of being deleted. A storage value that is not JSON is left in the pre-migration snapshot and the working copy starts empty so the page can open.

A v0.2.33 workspace can omit `transactions` and still keep its budgets and reported balance. `egp` and `EGP` category maps are folded together; a second amount for the same category is kept in `legacyUnparsedBudgets` instead of being added twice. `Expense` / `egp`, numeric strings, and ISO timestamps are normalized when the meaning is unambiguous. An unparseable timestamp stays on the row. Totals ignore non-integers, zeroes, and negative `amountMinor` values so one corrupt amount cannot erase the month. CSV export skips those incomplete rows instead of throwing, and the rows remain in the JSON workspace. A non-array allowlist is copied to `legacySources` and the working allowlist falls back to the default SMS packages.

## Pre-migration snapshot

The first time an older workspace is opened, Folio writes `localStorage['folio_finance_premigration_snapshot']` if that key is empty. That includes schema 0, a demo workspace, and a schema 1 workspace opened by schema 2. The value is:

```json
{
  "folioSnapshot": "premigration",
  "fromSchema": 0,
  "toSchema": 1,
  "state": { }
}
```

`state` is the object from before conversion. `toSchema` is the schema being migrated to. Later launches do not overwrite the key, so a snapshot taken on the way from schema 0 to schema 1 is still there after schema 2 opens. A JSON restore writes a separate `folio_finance_pre_restore_snapshot` and does not touch the pre-migration snapshot.

## JSON backup

`FolioData.buildBackup` copies the whole workspace and adds `folioBackup: 1` plus `exportedAt`. Restore accepts that envelope or a raw saved state object. It runs the same migration, so an old unversioned backup converts budgets once.

The round trip includes transactions, per-currency category budgets, reported balance and its timestamp, expected salary (`monthlyIncomeMinor`), the monthly spending target, a confirmed savings goal (`savingsGoalMinor`, `savingsGoalCurrency`, `savingsGoalCategory`), currency, capture flag, source allowlist, onboarding (`v2Onboarded`), legacy leftovers, and any extra JSON fields that were stored. A savings goal is not a transaction and is not added into totals.

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

After a row is queued, the page applies a softer check. The same amount, currency, direction, and a loosely matching merchant within 24 hours, against a row that is not rejected, is saved as `duplicate-candidate` instead of being confirmed. The generic labels `Card payment` and `Incoming transfer` do not count as the same merchant. That check does not drop the row.

## Notification amounts

`TransactionParser` chooses the transaction amount, not the balance. Balance words include Arabic `رصيدك`, `الرصيد`, `المتاح`, `الرصيد المتبقي`, and `متبقي`, and English `available balance`, `balance`, `Avl Bal`, and `remaining`. Transaction words include `تم خصم`, `خصم`, `سحب`, `شراء`, `دفع`, `تم تحويل`, `إيداع`, and `اضافة`, and English `debited`, `withdrawn`, `purchase`, `paid`, `spent`, `credited`, and `received`. Digits may be Arabic-Indic. Thousands separators and `EGP`, `جنيه`, `ج.م`, and `LE` are accepted.

The extension point is `EXTENSION_TEMPLATES` in `TransactionParser.java`. Each template names the transaction amount and the stated balance. Add a template when a redacted bank message has a shape the current templates miss. If two amounts remain and neither is clearly the transaction, the parse is low confidence and `ambiguous`, and the page does not auto-confirm it. A balance-only message is not a transaction. The stated balance, when present, is the optional observation above.

The id is `fp-` plus 32 hex characters of `SHA-256(semanticKey + "|" + contentHash)`. The same text therefore has the same id even if the native memory was cleared, and the page drops a second copy with that id. Memory is capped at 200 entries.

## What is not in the JSON file

The native queue, dedup memory, observed package list, and capture diagnostics stay in the private SharedPreferences file `folio_private_ingestion`. They are operational, not the books. Capture on/off and the allowlist are also copied into the WebView state and are part of the JSON backup.
