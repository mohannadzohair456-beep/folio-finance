# Cold-launch baseline — Folio v0.3.43

The numeric table below is filled from the `cold-launch-latency` job after that job's artifacts are inspected. This file does not invent a timing.

## Release under test

| Field | Value |
| --- | --- |
| Tag | `v0.3.43` |
| Package | `com.folio.finance.app` |
| versionCode | 143 |
| versionName | 0.3.43 |
| APK sha256 | `726cd2f38f4c18aeb1f1f861dd3ad60e287c952a6d9093b170d56b08fa070eb2` |
| Asset | https://github.com/mohannadzohair456-beep/folio-finance/releases/download/v0.3.43/app-release.apk |

The latency job downloads that asset and checks the sha256. It does not install a pull-request build. The upgrade job is separate: it installs the v0.2.33 asset (sha256 `afe748d0c151bfb6905c26c7c0cc7a7f5692be1871f29c2090cac6b111687809`) and then the candidate signed release. After a main build that candidate is the prerelease tag. A manual run with an empty tag, and a pull request, use `releases/latest`.

## What TotalTime is

`adb shell am start -W -n com.folio.finance.app/com.folio.finance.MainActivity` prints `ThisTime`, `TotalTime`, and `WaitTime` in milliseconds. The baseline uses **TotalTime**.

One warmup start is recorded and excluded. The next seven starts are the sample. Before each start the script runs `am force-stop com.folio.finance.app`, waits until `pidof` is empty, then sleeps 1 second. On API 29 and newer, a sample whose `LaunchState` is `WARM` or `HOT` is discarded and retried. API 26 does not print `LaunchState`; those samples are process-cold only by the force-stop.

Reported figures:

- median, using Python `statistics.median` (the middle value of an odd sample)
- spread, defined as max − min
- sample standard deviation with divisor n − 1
- the seven values in run order

## What the WebView figure is

The release APK is not modified and has no render timestamp. `WebView.setWebContentsDebuggingEnabled` stays false.

After the TotalTime series, five further cold starts run on the device. `am start -W` still reports TotalTime for the first drawn frame. That frame is the native loading overlay (`folio.`), which `MainActivity` removes in `onPageFinished`. The script then polls `uiautomator dump` until the dump contains `Meet Folio`. The clock is `/proc/uptime` read on the device immediately before `am start`.

- **content upper** is when the dump that contains the text finishes
- **content lower** is when the previous dump, which did not contain the text, finished
- the gap is the uncertainty, and it includes the cost of the dump
- dumps start only after `am start -W` returns, so they do not change the clean TotalTime series, but they can delay the HTML that is still loading

If logcat contains `onPageFinished` after a `FolioBench` start marker, that delta is recorded too. The shipping APK does not log that callback itself. Absence of the line means the log marker was not available; it is not a second measurement.

If the accessibility poll never sees `Meet Folio`, the job still keeps the TotalTime series and records `LATENCY_WEBVIEW_CONTENT_FAILED`. That is a missing render probe, not a passing render time.

## Runner configuration

The job is `cold-launch-latency` in `.github/workflows/folio-device-upgrade.yml`.

| Setting | Value |
| --- | --- |
| Runner | `ubuntu-latest` |
| Action | `reactivecircus/android-emulator-runner@v2` |
| System image | `google_apis` / `x86_64`, API 26, 34, and 35 |
| Profile | `pixel_2` |
| RAM | 2048 MB |
| Animations | disabled (`disable-animations: true`, scales 0) |
| Emulator flags | `-no-window -gpu swiftshader_indirect -no-snapshot -noaudio -no-boot-anim` |
| Boot timeout | 900 seconds |
| Samples | 1 excluded warmup, 7 TotalTime, 5 content polls |

The host CPU, image version, device fingerprint, and WebView package below are copied from each job's `latency.json`. Do not treat a later edit of this table as a new measurement unless the run link changes. The action does not print an emulator binary version; `latency.json` records `reactivecircus/android-emulator-runner@v2` and the flags above.

## What these numbers do not prove

- They are not a phone result. The emulator CPU, swiftshader GPU, and disabled animations are not a handset.
- They are not disk-cold. Page cache is not dropped, and the WebView provider process is not force-stopped.
- TotalTime is not time-to-HTML. It stops at the first frame, which is the native overlay.
- The content upper bound is pessimistic and coarse. A uiautomator dump can take longer than the render it is trying to catch.
- A green job does not say the upgrade kept user data. That is the separate `upgrade-from-v0233` matrix.

## API 26 and the v0.2.33 upgrade

The latency job does run on API 26. The upgrade-with-data job does not, and a green `v0233-page-on-api26` job is not a data-survival pass.

On the `google_apis` API 26 image the WebView package is Chrome 69.0.3497.100. The v0.2.33 page's inline script uses `??` and `?.`. Chrome 69 rejects both, the script never calls `render()`, and `#root` stays empty. Run [38248427070](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38248427070) installed v0.2.33 (versionCode 33), launched it, and waited. The accessibility tree contained the document title and empty `root`, `modal-root`, and `toast-region` nodes, and no "Meet Folio". The v0.3.43 APK did render on that same image in that run: `clean-launch (26)` passed. No upgrade was attempted there, so that run does not say whether API 26 would keep data.

Run [38255733542](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38255733542) repeated the blank check. `v0233-page-on-api26` printed `V0233_UI_BLANK 0.2.33 33 sdk 26`. The observed accessibility text was the document title `Folio — Personal Finance`. That job did not enter data and did not install a newer APK. `upgrade-from-v0233` on API 34 and API 35 printed `UPGRADE_DATA_SURVIVED 0.3.61 161`. Those two jobs are the data-survival passes. `clean-launch` on API 26 and API 35 printed `LAUNCH_OK 0.3.61 161`, which is the then-current `releases/latest`, not a v0.2.33 data check.

## Results

Copied from `latency.txt` and `latency.json` in artifacts `folio-latency-api26`, `folio-latency-api34`, and `folio-latency-api35` of run [38255733542](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38255733542). The pull-request head was `a981ac35b2e1d24901a21dfb605690b66d314334`. Each `latency.json` records `github_sha` `61b8b289ba9d151e2e9136d817dc0a02cb5f8205`, the merge commit of that head into `c2fa9b6dc7c44e6538c6563c78aec210d276734f`. The APK sha256 in all three files is `726cd2f38f4c18aeb1f1f861dd3ad60e287c952a6d9093b170d56b08fa070eb2`, versionName 0.3.43, versionCode 143. Times are milliseconds. The median excludes the warmup start.

| API | TotalTime median | min | max | spread | stdev | values, run order | ThisTime |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 26 | 923 | 685 | 1042 | 357 | 142.07 | 923, 827, 971, 1042, 986, 699, 685 | printed; the seven values match TotalTime |
| 34 | 1455 | 1196 | 2492 | 1296 | 500.38 | 2187, 1455, 2492, 1328, 1576, 1260, 1196 | not printed |
| 35 | 2188 | 1355 | 3236 | 1881 | 715.11 | 3236, 2188, 2659, 1693, 1355, 1378, 2588 | not printed |

Warmup TotalTime, excluded from the table: API 26 was 958 with no `LaunchState`; API 34 was 4173 with `LaunchState` `COLD`; API 35 was 2689 with `LaunchState` `COLD`. No cold sample was discarded as `WARM` or `HOT`.

Content upper bound, when the poll saw `Meet Folio`. API 34 has no content time: `latency.txt` contains `LATENCY_WEBVIEW_CONTENT_FAILED WebView text Meet Folio was not in the accessibility tree`. `onPageFinished` was absent on API 26 and API 35. The release APK does not log that callback.

| API | content upper median | min | max | spread | stdev | values, run order |
| --- | --- | --- | --- | --- | --- | --- |
| 26 | 5520 | 4550 | 7550 | 3000 | 1203.63 | 4550, 6790, 5330, 5520, 7550 |
| 34 | none | | | | | content probe failed |
| 35 | 11990 | 6880 | 13030 | 6150 | 2900.15 | 13030, 7340, 12000, 6880, 11990 |

| API | Runner image | Host CPU | MemTotal | Device fingerprint | WebView |
| --- | --- | --- | --- | --- | --- |
| 26 | `ubuntu24` `20261004.327.1` (runner `GitHub Actions 1000000212`) | AMD EPYC 9V74 80-Core Processor, 4 vCPU | 16373452 kB | `Android/sdk_gphone_x86_64/generic_x86_64:8.0.0/OSR1.180418.026/6741039:userdebug/dev-keys` | `com.android.chrome` 69.0.3497.100 |
| 34 | `ubuntu24` `20261004.327.1` (runner `GitHub Actions 1000000209`) | AMD EPYC 9V45 96-Core Processor, 4 vCPU | 16373452 kB | `google/sdk_gphone64_x86_64/emu64xa:14/UE1A.230829.050/12077443:userdebug/dev-keys` | `com.google.android.webview` 113.0.5672.136 |
| 35 | `ubuntu24` `20261004.327.1` (runner `GitHub Actions 1000000214`) | `INTEL(R) XEON(R) PLATINUM 8573C`, 4 vCPU | 16372440 kB | `google/sdk_gphone64_x86_64/emu64xa:15/AE3A.240806.043/12960925:userdebug/dev-keys` | `com.google.android.webview` 124.0.6367.219 |

Animation scales recorded on the device were 0, 0, and 0. Screen size was 1080x1920. `github_run_attempt` was 1.
