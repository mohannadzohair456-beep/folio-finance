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

The host CPU, image version, emulator version, device fingerprint, and WebView package are copied from the job's `latency.json` when the results are filled in. Do not treat a later edit of this table as a new measurement unless the run link changes.

## What these numbers do not prove

- They are not a phone result. The emulator CPU, swiftshader GPU, and disabled animations are not a handset.
- They are not disk-cold. Page cache is not dropped, and the WebView provider process is not force-stopped.
- TotalTime is not time-to-HTML. It stops at the first frame, which is the native overlay.
- The content upper bound is pessimistic and coarse. A uiautomator dump can take longer than the render it is trying to catch.
- A green job does not say the upgrade kept user data. That is the separate `upgrade-from-v0233` matrix.

## API 26 and the v0.2.33 upgrade

The latency job does run on API 26. The upgrade-with-data job does not, and a green `v0233-page-on-api26` job is not a data-survival pass.

On the `google_apis` API 26 image the WebView package is Chrome 69.0.3497.100. The v0.2.33 page's inline script uses `??` and `?.`. Chrome 69 rejects both, the script never calls `render()`, and `#root` stays empty. Run [38248427070](https://github.com/mohannadzohair456-beep/folio-finance/actions/runs/38248427070) installed v0.2.33 (versionCode 33), launched it, and waited. The accessibility tree contained the document title and empty `root`, `modal-root`, and `toast-region` nodes, and no "Meet Folio". The current v0.3.43 APK does render on that same image: `clean-launch (26)` in that run passed. No upgrade was attempted, so that run does not say whether API 26 would keep data.

## Results

Pending the first inspected `cold-launch-latency` artifacts from the script that accepts an `am start -W` report without `ThisTime`. No millisecond value is claimed until that artifact is copied here with its run URL. API 26 TotalTime from run 38248427070 is real but is not the recorded baseline until the same method has a number for API 34 and API 35.
