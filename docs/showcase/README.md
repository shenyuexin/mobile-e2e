# Showcase Index

This folder contains reproducible, real-device demo evidence used by README.

## Failure-intelligence demo

- `docs/showcase/failure-intelligence-demo.md`

## Flow record/replay demo

- `docs/showcase/flow-record-replay-demo.md`

## Record-session demo

- `docs/showcase/record-session-demo.md`

## iOS recording showcase

- `docs/showcase/ios-recording-showcase.md`

## Primary demo videos

- Happy path (Android real device):
  - `docs/showcase/videos/m2e-happy-path-scroll-pause-40s.mp4`
- Visible interruption + recovery (Android real device):
  - `docs/showcase/videos/m2e-interruption-home-recovery-35s.mp4`

## Repro scripts

- Happy path script: `pnpm tsx scripts/dev/demo-happy-path-android.ts`
- Interruption/recovery script: `pnpm tsx scripts/dev/demo-interruption-home-recovery-android.ts`
- Happy path recording wrapper: `bash scripts/dev/record-demo-happy-path-android.sh`
- Interruption recording wrapper: `bash scripts/dev/record-demo-interruption-home-recovery-android.sh`
- One-command publisher (record + curate + refresh assets): `bash scripts/dev/publish-showcase-assets-android.sh`

## CI platform smoke baseline flows

- iOS simulator baseline flow: `flows/samples/ci/ios-settings-smoke.yaml`
- Android emulator baseline flow: `flows/samples/ci/android-settings-smoke.yaml`

These flows are used by `.github/workflows/platform-smoke.yml` to keep simulator/emulator wiring visible in CI.
They intentionally validate baseline toolchain execution only, and do not replace real-device acceptance evidence.

## Evidence contract and proof levels

- Smoke proof (`pnpm test:smoke`, dry-run validators, Ubuntu CI): verifies deterministic contracts and dry-run behavior, not real-device fidelity.
- Platform smoke proof (`.github/workflows/platform-smoke.yml`): verifies simulator/emulator baseline wiring only.
- Acceptance proof (`.github/workflows/real-device-acceptance.yml`): self-hosted real-run artifacts plus quality gate on `reports/phase-sample-report.json`.

Framework lane boundary (current truth):

- Native and Flutter profiles remain `validated-sample-baseline` in `configs/profiles/*.yaml` and `configs/matrices/framework-profile-matrix.md`.
- In the current shared acceptance runner/report path, Flutter framework-lane proof is Android-only (`flutter-android`).
- React Native acceptance lanes (`react-native-ios`, `react-native-android`) are workflow acceptance backbone lanes and are intentionally distinct from framework-profile matrix rows.
- The default Phase 02 framework acceptance entrypoint is `pnpm run validate:phase2-rn-android-acceptance`, which isolates the RN Android lane as a dedicated command path while reusing the shared acceptance evidence generators.

## Prerequisites for clone-and-run

- Android emulator/device online via `adb devices` (recommended Android 9 / API 28 or newer)
- `adb` and `pnpm` installed and available in your `PATH`
- Expo sample app checked in under `examples/rn-login-demo/`
- Expo Go (`host.exp.exponent`) installed on the selected Android device for the RN Phase 02 lane
- `com.epam.mobitru` installed only when running the Mobitru showcase/native/flutter lanes
- `ffmpeg` and `ffprobe` installed (required for `publish-showcase-assets-android.sh`)

Optional fast install path from this repo before recording:

```bash
(cd examples/demo-android-app && ./gradlew assembleDebug)
APK_PATH=examples/demo-android-app/app/build/outputs/apk/debug/app-debug.apk \
  bash scripts/dev/record-demo-happy-path-android.sh
```

Notes:

- If `DEVICE_ID` is unset, both recording wrappers and direct demo TS scripts auto-select the first online Android device.
- `APK_PATH` is supported by both recording wrappers and by `publish-showcase-assets-android.sh`.
- Start Expo for the tracked RN sample with `pnpm --dir examples/rn-login-demo start` before running the dedicated Phase 02 acceptance command when using Expo Go.
- `pnpm run validate:phase2-rn-android-acceptance` uses the React Native Android sample flow and writes lane-local artifacts under `artifacts/phase2-rn-android/**` before regenerating `reports/phase-sample-report.*` and `reports/acceptance-evidence.*`.

## Snapshot assets used by README

- `docs/showcase/assets/happy-01-login.png`
- `docs/showcase/assets/happy-02-scrolled.png`
- `docs/showcase/assets/happy-03-add-to-cart.png`
- `docs/showcase/assets/happy-04-orders-tab.png`
- `docs/showcase/assets/happy-05-cart.png`
- `docs/showcase/assets/interruption-01-before-home.png`
- `docs/showcase/assets/interruption-02-launcher.png`
- `docs/showcase/assets/interruption-03-recovered.png`
- `docs/showcase/assets/happy-preview.gif`
- `docs/showcase/assets/interruption-preview.gif`
