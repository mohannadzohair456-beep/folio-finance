# Folio threat model — 2026-10-12

Regression and security review of backup restore and the WebView bridge. Schema version stays 2. `applicationId` stays `com.folio.finance.app`. No permission was added. The device-upgrade checks were not changed.

The page is `file:///android_asset/index.html`. Its Content-Security-Policy is `default-src 'none'` and `connect-src 'none'` (`android/app/src/main/assets/index.html:2`). The manifest grants `RECORD_AUDIO` only (`android/app/src/main/AndroidManifest.xml:4`). There is no `INTERNET` permission.

## Backup export, import, and restore

`FolioData.buildBackup` copies the workspace and stamps `folioBackup: 1`, `schemaVersion: 2`, and `exportedAt` (`android/app/src/main/assets/folio-data.js:592`). `FolioData.restoreBackup` parses the file and `importFolioJson` replaces `localStorage['folio_finance_v1']` only after `confirm` (`android/app/src/main/assets/index.html:1170`). A round trip of `tests/fixtures/historical-ledger-2026-10-12.json` keeps the reported balance `842050`, the EGP expense `12550`, the SAR expense `8650`, the schema-2 food budget `350000`, and the credit-card balance `-15000`. A schema-0 file converts a major-unit budget of `3500` to `350000` once; exporting that result and importing it again does not convert it a second time.

### Fixed — a future or nonsense schema was rewritten as schema 2

- **Surface:** JSON restore.
- **Risk:** `migrate` treated any finite `schemaVersion` below 2 as an older file and any higher number as already current. A schema 3 file would be relabeled schema 2. `true` becomes `1` through `Number(true)`, so category budgets could be left in major units or, for a missing version, multiplied by 100.
- **Evidence:** `backupSchema` now allows only `0`, `1`, and `2` (`android/app/src/main/assets/folio-data.js:600`). The previous path was `Number(input.schemaVersion)` in `migrate`.
- **Fix:** `restoreBackup` throws `This backup uses a schema version Folio cannot read` and does not write. Opening data already on the device still uses the lenient `migrate` path so an upgrade is not blocked. Schema stays 2.

### Fixed — non-integer and negative minor amounts could change the books

- **Surface:** JSON restore of balances, budgets, and transactions.
- **Risk:** `finiteMinor` rounds (`android/app/src/main/assets/folio-data.js:197`). A reported balance of `12.5` became `13`. A non-integer schema-2 budget was rounded into the active budget or moved to `legacyUnparsedBudgets`. A negative or non-integer `amountMinor` stayed on the row and was then ignored by `summarize`, so the restore looked successful while the expense dropped out of the month. `NaN` cannot appear in JSON; the string `"NaN"` could.
- **Evidence:** `assertMinor` (`android/app/src/main/assets/folio-data.js:616`) runs from `assertRestorable` (`android/app/src/main/assets/folio-data.js:636`) before `migrate`.
- **Fix:** Restore rejects a transaction amount, schema-1/2 budget, or planning amount that is not a safe integer. Transaction amounts cannot be negative. Reported balances and account balances may be negative so an overdraft or credit balance keeps its sign. Integer strings such as `"12550"` are accepted. A row that omits `amountMinor` is kept and is not added into totals, which is the existing incomplete-row rule.

### Fixed — an unknown reporting currency became EGP

- **Surface:** JSON restore.
- **Risk:** `migrate` stores an unsupported `currency` as `EGP` and keeps the original on `legacyCurrency`. Totals would then be described as EGP with no conversion.
- **Evidence:** `assertCurrency` (`android/app/src/main/assets/folio-data.js:622`).
- **Fix:** A present currency code must be EGP, USD, SAR, AED, EUR, or GBP after trim and uppercasing. `egp` restores as `EGP` with the same minor units. `JPY` or `XXX` rejects the file.

### Fixed — duplicate ids and a repeated schema-2 category

- **Surface:** JSON restore.
- **Risk:** Two rows with the same id make confirm, reject, and undo affect both. At schema 2, `egp` and `EGP` fold into one map and the second amount for the same category was parked in `legacyUnparsedBudgets`.
- **Evidence:** duplicate-id and duplicate-category throws in `assertRestorable` (`android/app/src/main/assets/folio-data.js:657`, `android/app/src/main/assets/folio-data.js:673`).
- **Fix:** The file is rejected. Schema 0 still folds `egp` and `EGP` during migrate, and a second amount for the same category stays in `legacyUnparsedBudgets`. That is the existing on-device migration, not a schema-2 import.

### Fixed — a folio-shaped file with no transactions list wiped the ledger

- **Surface:** JSON restore over existing data.
- **Risk:** `{budgets:{}}` passed the old "looks like Folio" check. After confirm, `migrate` supplied an empty transaction list.
- **Evidence:** `assertRestorable` requires an array (`android/app/src/main/assets/folio-data.js:639`).
- **Fix:** The file is rejected with `Backup file is missing its transactions list`. An explicit empty array is a real empty ledger and still requires confirm plus a snapshot.

### Fixed — `__proto__` on a restored object

- **Surface:** JSON restore and launch migration.
- **Risk:** `Object.assign` and `out[bucket][cat] = minor` treat `__proto__` as the prototype. A backup transaction could carry inherited fields into the row. A budget key `__proto__` could change the budget object's prototype instead of storing the amount.
- **Evidence:** `ownData` skips those keys (`android/app/src/main/assets/folio-data.js:88`). `walkBudgets` does too (`android/app/src/main/assets/folio-data.js:172`). Restore rejects the file (`android/app/src/main/assets/folio-data.js:630`).
- **Fix:** Restore rejects `__proto__`, `constructor`, and `prototype` as own keys on the workspace, a transaction, a budget map, or an account. Launch migration skips them so a phone that already holds such a key still opens, and the field is not assigned onto the live object.

### Fixed — snapshot failure still replaced the workspace

- **Surface:** `importFolioJson`.
- **Risk:** The pre-restore snapshot write was wrapped in an empty `catch`. If storage was full, the new state was still saved and the previous books were gone.
- **Evidence:** `android/app/src/main/assets/index.html:1175`.
- **Fix:** If the snapshot cannot be written, the function returns before assigning `state` and tells the user nothing was replaced. If the following save fails, memory is put back and the user is told the current data was left unchanged. Cancel returns before any write. A thrown restore error is caught and does not assign `state`.

### Accepted — file size, malformed JSON, and incomplete rows

- **Surface:** native import and `restoreBackup`.
- **Risk:** A huge or broken file could exhaust memory or be parsed as a partial ledger.
- **Evidence:** The native reader stops above 2 MB (`android/app/src/main/java/com/folio/finance/MainActivity.java:118`). `restoreBackup` rejects a string longer than 2 MB, an empty file, and invalid JSON (`android/app/src/main/assets/folio-data.js:700`).
- **Accepted:** Those files are rejected with a message. The workspace is not assigned. Rows that are null or missing an amount stay in the file and stay out of totals, matching the ledger rule that an incomplete historical row is not deleted.

### Accepted — on-device migration stays lenient

- **Surface:** launch of data already in `localStorage`.
- **Risk:** A phone that already stored a negative or overflow `amountMinor` would be locked out if `migrate` used the new restore rules.
- **Evidence:** `migrate` is unchanged for those values. `summarize` still skips non-integers, zeroes, and negatives. Restore is the strict gate.
- **Accepted:** An upgrade does not delete those rows. Importing a file that contains them is rejected, so it cannot replace a good workspace.

### Accepted — a confirmed valid backup replaces the device copy

- **Surface:** `importFolioJson` after a successful `restoreBackup`.
- **Risk:** The user can replace the workspace, including clearing category budgets when the file's budget map is empty.
- **Evidence:** confirm text at `android/app/src/main/assets/index.html:1173`, then the snapshot, then `persist`.
- **Accepted:** Replacement is explicit. The previous workspace is stored in `folio_finance_pre_restore_snapshot` first. `buildBackup` always writes `transactions` and `budgets`. This is not a silent merge; CSV import remains the path that only adds rows.

## WebView bridge

`FolioNative` is added at `android/app/src/main/java/com/folio/finance/MainActivity.java:84` and removed in `onDestroy`. Every `@JavascriptInterface` method:

| Method | What it can do | Untrusted input |
|---|---|---|
| `setDarkChrome` | Status and navigation bar colors (`MainActivity.java:316`) | Boolean from the page |
| `pickCsvFile` / `pickBackupFile` | `ACTION_OPEN_DOCUMENT` (`MainActivity.java:324`) | No path from JS. The system picker returns a content URI |
| `startVoiceRecognition` | On-device `SpeechRecognizer`, `EXTRA_PREFER_OFFLINE` (`MainActivity.java:326`) | Locale is forced to `ar-EG` or `en-US` (`MainActivity.java:198`) |
| `startSystemVoiceRecognition` | System speech activity, still not Folio's network (`MainActivity.java:330`) | Same locale restriction |
| `getPendingTransactions` | JSON queue of parsed fields (`MainActivity.java:345`) | Notification text is not in the queue |
| `ackTransactions` | Drops acknowledged queue ids (`MainActivity.java:346`) | Id list from the page |
| `captureEnabled` / `setCaptureEnabled` | Local opt-in flag (`MainActivity.java:347`) | Boolean |
| `clearPending` | Clears the native queue (`MainActivity.java:349`) | None |
| `shareCsv` | Share sheet for a fixed CSV name (`MainActivity.java:350`) | CSV text from the page |
| `shareDocument` | Share sheet (`MainActivity.java:353`) | See path finding below |
| `getCaptureDiagnostics` | Counters only (`MainActivity.java:359`) | None |
| `getObservedSources` | Package names already checked by `NativeStore.observe` | Package strings |
| `getSourcePackages` / `setSourcePackages` | Allowlist (`MainActivity.java:361`) | `NativeStore.setSources` keeps at most 30 ids matching a package pattern (`NativeStore.java:29`) |
| `notificationAccessGranted` | Reads the listener setting (`MainActivity.java:363`) | None |
| `openNotificationSettings` | `Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS` only (`MainActivity.java:368`) | None |

Calls the other way, native to the page, are `folioImportJson` / `folioImportCsv` (`MainActivity.java:122`), `folioImportError` (`MainActivity.java:125`), `folioNativeRefresh` (`MainActivity.java:167`), `FolioV2.onVoiceResult` (`MainActivity.java:301`), and `folioGoHome` (`MainActivity.java:306`).

What reaches the page from outside the ledger:

- Notification title and body are parsed in `FinanceNotificationListener.java:28`. The stored object is amount, currency, direction, merchant, category, package, time, and confidence (`FinanceNotificationListener.java:30`). The raw message is not stored. The merchant pattern can include quotes and `<` (`TransactionParser.java:43`).
- A picked backup or CSV is quoted with `JSONObject.quote` and passed to a fixed callback (`MainActivity.java:122`).
- Quick-entry text is page state. The input value and the error line use `h()` (`android/app/src/main/assets/folio-home.js:131`). Nothing is written until confirm.
- A voice transcript is `JSONObject.quote`d (`MainActivity.java:301`). Ask Folio renders replies with `h()`.

### Fixed — event-handler breakout from merchant, id, and category text

- **Surface:** `innerHTML` for transaction rows, budget edit buttons, and quick-add merchant chips.
- **Risk:** `h()` turns `'` into `&#39;`. In a double-quoted HTML attribute the browser decodes that entity before the handler runs, so `onclick="editById('${h(id)}')"` executes the id as script. `jsArg` escaped `'` for JavaScript but not `"`, so a merchant could close the attribute and add another `onclick`. Notification merchants, quick-entry names, and restored budget categories all reach these strings. The page CSP allows `'unsafe-inline'`, so a breakout runs in the WebView and can call `FolioNative`. It still cannot open a network socket.
- **Evidence:** `h` and `jsAttr` at `android/app/src/main/assets/index.html:1016`. Chips use `jsArg` at `android/app/src/main/assets/folio-home.js:7`. Transaction actions use `jsAttr(t.id)` in `singleTx`.
- **Fix:** Values placed inside a JavaScript string in an HTML handler are escaped as `\x27`, `\x22`, `\x26`, `\x3c`, and `\x3e`, plus newlines. HTML decoding does not turn those sequences back into quotes or tags. Visible text and `value` attributes still use `h()`.

### Accepted — no network capability in the app

- **Surface:** manifest, WebView, speech.
- **Risk:** A script or a loaded URL could send the ledger off the device.
- **Evidence:** No `INTERNET` permission (`AndroidManifest.xml:4`). `shouldOverrideUrlLoading` returns true (`MainActivity.java:72`). `MIXED_CONTENT_NEVER_ALLOW`, `setAllowFileAccessFromFileURLs(false)`, `setAllowUniversalAccessFromFileURLs(false)`, and `setWebContentsDebuggingEnabled(false)` (`MainActivity.java:75`). CSP `connect-src 'none'` (`index.html:2`). `android:usesCleartextTraffic="false"`.
- **Accepted:** Folio cannot open a socket. `allowFileAccess` is true so the asset page can load (`MainActivity.java:77`); file-URL access from the page to other files is off. The system speech screen is another app and may use the network. The home copy says that. Folio does not receive audio bytes and does not hold `INTERNET`.

### Accepted — backup file path and share intent

- **Surface:** `shareDocument` and `BackupFileProvider`.
- **Risk:** A script could pass a filename such as `..` or a mime type and read or write outside the cache backup directory, or launch an arbitrary intent.
- **Evidence:** The filename must match `[A-Za-z0-9._-]{1,80}` or it is replaced (`MainActivity.java:354`). The provider checks the canonical parent (`BackupFileProvider.java:31`). Mime must look like a type. The share intent is `ACTION_SEND` with `FLAG_GRANT_READ_URI_PERMISSION` (`MainActivity.java:151`). `openNotificationSettings` uses one settings action. Import uses `ACTION_OPEN_DOCUMENT`.
- **Accepted:** `..` fails the canonical parent check, so it is not served. The title is a chooser subject, not a path or a URL. There is no JS-controlled component name.

### Accepted — `JSONObject.quote` on the bridge

- **Surface:** `evaluateJavascript` of import text and voice transcripts.
- **Risk:** A quote or newline in the file or transcript could break out of the JavaScript string.
- **Evidence:** `JSONObject.quote` at `MainActivity.java:122` and `MainActivity.java:301`. The callback names are constants.
- **Accepted:** `org.json` escapes quotes, backslashes, and characters below U+0020. A U+2028 or U+2029 in the text is not escaped. On a WebView that still treats those as line terminators inside strings, the call is a syntax error, so the import or voice result is not applied. That fails closed. It is not a second statement. The restored or spoken text is then rendered with `h()` or `jsAttr`.

## What was not changed

`SCHEMA_VERSION` is 2. `applicationId` is `com.folio.finance.app`. Signing config in `android/app/build.gradle` is unchanged. No permission was added. `folio-device-upgrade.yml` was not edited, and its `UPGRADE_DATA_SURVIVED` checks were not loosened.
