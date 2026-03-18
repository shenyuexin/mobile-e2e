# Showcase Index

This folder contains reproducible, real-device demo evidence used by README.

## Failure-intelligence demo

- `docs/showcase/failure-intelligence-demo.md`

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

## Prerequisites for clone-and-run

- Android emulator/device online via `adb devices` (recommended Android 9 / API 28 or newer)
- `adb` and `pnpm` installed and available in your `PATH`
- `com.epam.mobitru` installed on the selected device
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
