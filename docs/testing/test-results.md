# Test results — 12 Oct 2026

Run on this workspace (Linux, OpenJDK 21 compiling with `--release 17`, Node v22.14.0). No Android SDK is installed here, so `assembleRelease` was not run locally. CI on a pull request compiles the unsigned release; the signed v1+v2+v3 check runs on `main`, where the keystore secrets exist.

## Commands and results

```text
javac --release 17 -d /tmp/folio-parser-tests \
  android/app/src/main/java/com/folio/finance/TransactionParser.java \
  android/app/src/main/java/com/folio/finance/IngestionDedup.java \
  tests/ParserTest.java tests/DedupTest.java
java -cp /tmp/folio-parser-tests ParserTest
java -cp /tmp/folio-parser-tests DedupTest
node tests/money.test.cjs
node tests/ui.test.cjs
node tests/v2.test.cjs
```

| Command | Result |
| --- | --- |
| `ParserTest` | PASS 38 parser cases |
| `DedupTest` | PASS 13 dedup cases |
| `node tests/money.test.cjs` | PASS money, migration, backup and legacy CSV checks |
| `node tests/ui.test.cjs` | PASS bundled interface and tracking setup checks |
| `node tests/v2.test.cjs` | PASS Folio onboarding + assistant smoke tests |

All five exited 0. No failures.

`ParserTest` includes the original 14 cases plus synthetic CIB, NBE, Banque Misr, Vodafone Cash, InstaPay, Al Rajhi, STC Pay, SNB, and Alinma samples (English and Arabic). They are labeled synthetic in the test source. `money.test.cjs` covers schema 1 budget conversion, a second migration that does not multiply again, incomplete rows, mixed-currency totals, full JSON round trip, and the older CSV shapes. `ui.test.cjs` covers escaped notification text, JSON restore of balance, salary, budgets, allowlist and onboarding, the versionCode floor, and that the inlined page matches `folio-data.js`, `folio-v2.js`, and `folio-v2.css`.

## v0.2.33 APK inspection (not an install)

The public asset `https://github.com/mohannadzohair456-beep/folio-finance/releases/download/v0.2.33/app-release.apk` (54,832 bytes) was downloaded and read as a zip.

- v2 signing block present (`0x7109871a`)
- v3 signing block absent (`0xf05368c0` not in the block)
- no v1 `META-INF` signature files
- `resources.arsc` stored, local-header data offset 4-byte aligned

`apksigner` was not run locally because the Android build-tools are not installed. CI runs `apksigner verify` on the signed main build.

## Emulator upgrade — not executed

Not executed: install v0.2.33, add data, upgrade to this build, confirm the books are still there.

This workspace has `/dev/kvm` but no Android SDK, system image, or `adb`. The release keystore is not available and must not be created here. An unsigned APK cannot replace the signed v0.2.33 install; Android would report a signature conflict. That is the same class of failure already seen on the physical phone, and it would not test data survival.

## Still only covered by CI

- `android/gradlew -p android assembleRelease` with the pinned certificate
- `apksigner verify` showing v1, v2, and v3
- `zipalign -c -v 4` and `zipalign -c -p 4`
- Installing the resulting APK on a phone or emulator
