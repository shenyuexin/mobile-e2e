#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEVICE_ID="${DEVICE_ID:-emulator-5554}"
APP_ID="${APP_ID:-com.epam.mobitru}"
ANDROID_USER_ID="${ANDROID_USER_ID:-}"
RUN_COUNT="${1:-2}"
OUT_DIR="${OUT_DIR:-$ROOT/artifacts/phase3-native-android}"
APK_PATH="${NATIVE_ANDROID_APK_PATH:-$ROOT/examples/demo-android-app/app/build/outputs/apk/debug/app-debug.apk}"

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
  if ! adb -s "$DEVICE_ID" get-state >/dev/null 2>&1; then
    printf 'Android device %s is not ready for native validation.\n' "$DEVICE_ID" >&2
    exit 1
  fi

  if [ -f "$APK_PATH" ]; then
    adb -s "$DEVICE_ID" install -r -d "$APK_PATH" >/dev/null
  fi

  for i in $(seq 1 "$RUN_COUNT"); do
    RUN_DIR="$OUT_DIR/run-$(printf '%03d' "$i")-login"
    mkdir -p "$RUN_DIR"

    if [ -n "$ANDROID_USER_ID" ]; then
      adb -s "$DEVICE_ID" shell am switch-user "$ANDROID_USER_ID" >/dev/null 2>&1 || true
    fi

    if [ -n "$ANDROID_USER_ID" ]; then
      adb -s "$DEVICE_ID" shell am force-stop --user "$ANDROID_USER_ID" "$APP_ID" >/dev/null 2>&1 || true
    else
      adb -s "$DEVICE_ID" shell am force-stop "$APP_ID" >/dev/null 2>&1 || true
    fi
    sleep 2

    DRIVER_FLAG="$(resolve_driver_reinstall_flag)"
    if maestro test "$DRIVER_FLAG" --platform android --udid "$DEVICE_ID" --debug-output "$RUN_DIR/debug" "$ROOT/flows/samples/native/mobitru-android-login.yaml" > "$RUN_DIR/maestro.out" 2>&1; then
      printf 'PASS\n' > "$RUN_DIR/result.txt"
    else
      printf 'FAIL\n' > "$RUN_DIR/result.txt"
    fi

    printf 'login\n' > "$RUN_DIR/flow.txt"
    adb -s "$DEVICE_ID" exec-out screencap -p > "$RUN_DIR/final-raw.png" 2>/dev/null || true
    if [ -f "$RUN_DIR/final-raw.png" ]; then
      sips -Z 1280 -s format jpeg -s formatOptions 75 "$RUN_DIR/final-raw.png" --out "$RUN_DIR/final.jpg" >/dev/null 2>&1 || true
    fi
  done
fi

OUT_DIR="$OUT_DIR" python3 - <<'PY'
import os
from pathlib import Path

root = Path(os.environ['OUT_DIR'])
runs = sorted(p for p in root.glob('run-*') if p.is_dir())
passed = sum((p / 'result.txt').read_text().strip() == 'PASS' for p in runs if (p / 'result.txt').exists())
total = len(runs)
print(f'Native Android Phase 3 summary: {passed}/{total} passed')
PY
