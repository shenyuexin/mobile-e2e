#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FLOW="${FLOW:-$ROOT/flows/samples/react-native/android-login-smoke.yaml}"
DEVICE_ID="${DEVICE_ID:-}"
if [ -z "$DEVICE_ID" ]; then
  DEVICE_ID="$(adb devices | awk 'NR > 1 && $2 == "device" { print $1; exit }')"
fi
if [ -z "$DEVICE_ID" ]; then
  printf 'No online Android device found (adb devices state must be "device").\n' >&2
  exit 1
fi
APP_ID="${APP_ID:-host.exp.exponent}"
ANDROID_USER_ID="${ANDROID_USER_ID:-}"
ANDROID_OEM_TEXT_FALLBACK="${ANDROID_OEM_TEXT_FALLBACK:-auto}"
EXPO_URL="${EXPO_URL:-exp://127.0.0.1:8081}"
RUN_COUNT="${1:-5}"
OUT_DIR="${OUT_DIR:-$ROOT/artifacts/phase1-android}"

device_manufacturer() {
  adb -s "$DEVICE_ID" shell getprop ro.product.manufacturer 2>/dev/null | tr '[:upper:]' '[:lower:]' | tr -d '\r'
}

ensure_package_installed() {
  local package_name="$1"
  if ! adb -s "$DEVICE_ID" shell pm list packages 2>/dev/null | grep -q "^package:${package_name}$"; then
    printf 'Required package %s is not installed on device %s.\n' "$package_name" "$DEVICE_ID" >&2
    printf 'Install the required app before replaying this lane.\n' >&2
    exit 3
  fi
}

flow_contains_text_commands() {
  grep -Eq '^- (inputText|pasteText|setClipboard):?|^- inputText:|^- pasteText|^- setClipboard:' "$FLOW"
}

should_use_oem_text_fallback() {
  if [ "$ANDROID_OEM_TEXT_FALLBACK" = "0" ]; then
    return 1
  fi
  if ! flow_contains_text_commands; then
    return 1
  fi
  local manufacturer
  manufacturer="$(device_manufacturer)"
  case "$manufacturer" in
    vivo|oppo)
      if [ -n "$ANDROID_USER_ID" ] || [ "$ANDROID_OEM_TEXT_FALLBACK" = "1" ]; then
        return 0
      fi
      return 1
      ;;
    *)
      if [ "$ANDROID_OEM_TEXT_FALLBACK" = "1" ]; then
        return 0
      fi
      return 1
      ;;
  esac
}

run_oem_text_fallback() {
  if [ -n "${EXPECTED_APP_PHASE:-}" ]; then
    EXPECTED_APP_PHASE="$EXPECTED_APP_PHASE" \
    DEVICE_ID="$DEVICE_ID" \
    APP_ID="$APP_ID" \
    FLOW="$FLOW" \
    ANDROID_USER_ID="${ANDROID_USER_ID:-0}" \
    pnpm tsx "$ROOT/scripts/dev/android-oem-text-fallback.ts"
  else
    DEVICE_ID="$DEVICE_ID" \
    APP_ID="$APP_ID" \
    FLOW="$FLOW" \
    ANDROID_USER_ID="${ANDROID_USER_ID:-0}" \
    pnpm tsx "$ROOT/scripts/dev/android-oem-text-fallback.ts"
  fi
}

resolve_driver_reinstall_flag() {
  local packages
  if [ -n "$ANDROID_USER_ID" ]; then
    packages="$(adb -s "$DEVICE_ID" shell cmd package list packages --user "$ANDROID_USER_ID" 2>/dev/null || true)"
  else
    packages="$(adb -s "$DEVICE_ID" shell pm list packages 2>/dev/null || true)"
  fi
  if printf '%s' "$packages" | grep -q '^package:dev\.mobile\.maestro$' && printf '%s' "$packages" | grep -q '^package:dev\.mobile\.maestro\.test$'; then
    printf '%s' '--no-reinstall-driver'
  else
    printf 'Missing Maestro helper app(s): expected dev.mobile.maestro and dev.mobile.maestro.test to be installed before replay.\n' >&2
    printf 'Replay aborted intentionally to avoid repeated runtime install prompts.\n' >&2
    exit 2
  fi
}

export PATH="$PATH:$HOME/.maestro/bin"
export MAESTRO_CLI_NO_ANALYTICS=1

mkdir -p "$OUT_DIR"

if [ "$RUN_COUNT" -gt 0 ]; then
for i in $(seq 1 "$RUN_COUNT"); do
  RUN_DIR="$OUT_DIR/run-$(printf '%03d' "$i")"
  mkdir -p "$RUN_DIR"

  if [ -n "$ANDROID_USER_ID" ]; then
    adb -s "$DEVICE_ID" shell am switch-user "$ANDROID_USER_ID" >/dev/null 2>&1 || true
  fi

  if [ "$APP_ID" = "host.exp.exponent" ]; then
    ensure_package_installed "$APP_ID"
    adb -s "$DEVICE_ID" reverse tcp:8081 tcp:8081 >/dev/null 2>&1 || true
    if [ -n "$ANDROID_USER_ID" ]; then
      adb -s "$DEVICE_ID" shell am force-stop --user "$ANDROID_USER_ID" host.exp.exponent || true
    else
      adb -s "$DEVICE_ID" shell am force-stop host.exp.exponent || true
    fi
    sleep 2
    if [ -n "$ANDROID_USER_ID" ]; then
      adb -s "$DEVICE_ID" shell am start --user "$ANDROID_USER_ID" -a android.intent.action.VIEW -d "$EXPO_URL" host.exp.exponent >/dev/null 2>&1 || true
    else
      adb -s "$DEVICE_ID" shell am start -a android.intent.action.VIEW -d "$EXPO_URL" host.exp.exponent >/dev/null 2>&1 || true
    fi
    sleep 10
  else
    if [ -n "$ANDROID_USER_ID" ]; then
      adb -s "$DEVICE_ID" shell am force-stop --user "$ANDROID_USER_ID" "$APP_ID" >/dev/null 2>&1 || true
      adb -s "$DEVICE_ID" shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
    else
      adb -s "$DEVICE_ID" shell am force-stop "$APP_ID" >/dev/null 2>&1 || true
      adb -s "$DEVICE_ID" shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
    fi
    sleep 1
  fi

    if should_use_oem_text_fallback; then
      if run_oem_text_fallback > "$RUN_DIR/maestro.out" 2>&1; then
        printf 'PASS\n' > "$RUN_DIR/result.txt"
      else
        printf 'FAIL\n' > "$RUN_DIR/result.txt"
      fi
    else
      DRIVER_FLAG="$(resolve_driver_reinstall_flag)"
      if maestro test "$DRIVER_FLAG" --platform android --udid "$DEVICE_ID" --debug-output "$RUN_DIR/debug" "$FLOW" > "$RUN_DIR/maestro.out" 2>&1; then
        printf 'PASS\n' > "$RUN_DIR/result.txt"
      else
        printf 'FAIL\n' > "$RUN_DIR/result.txt"
      fi
    fi

    adb -s "$DEVICE_ID" exec-out screencap -p > "$RUN_DIR/final-raw.png" 2>/dev/null || true
    if [ -f "$RUN_DIR/final-raw.png" ]; then
      sips -Z 1280 -s format jpeg -s formatOptions 75 "$RUN_DIR/final-raw.png" --out "$RUN_DIR/final.jpg" >/dev/null 2>&1 || true
    fi
  done
fi

OUT_DIR="$OUT_DIR" python3 - <<'PY'
import os
from pathlib import Path

root = Path(os.environ["OUT_DIR"])
runs = sorted(p for p in root.glob('run-*') if p.is_dir())
passed = sum((p/'result.txt').read_text().strip() == 'PASS' for p in runs if (p/'result.txt').exists())
total = len(runs)
print(f'Android Phase 1 summary: {passed}/{total} passed')
PY
