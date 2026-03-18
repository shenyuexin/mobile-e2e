# Showcase Index

This folder contains reproducible, real-device demo evidence used by README.

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
