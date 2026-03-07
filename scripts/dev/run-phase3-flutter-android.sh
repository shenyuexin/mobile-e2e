#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEVICE_ID="${DEVICE_ID:-emulator-5554}"
APP_ID="${APP_ID:-com.epam.mobitru}"
RUN_COUNT="${1:-3}"
OUT_DIR="${OUT_DIR:-$ROOT/artifacts/phase3-flutter-android}"
APK_PATH="${FLUTTER_APK_PATH:-$ROOT/examples/demo-flutter-app/build/app/outputs/flutter-apk/app-debug.apk}"

export PATH="$PATH:$HOME/.maestro/bin"
export MAESTRO_CLI_NO_ANALYTICS=1

mkdir -p "$OUT_DIR"

if [ "$RUN_COUNT" -gt 0 ]; then
  if ! adb -s "$DEVICE_ID" get-state >/dev/null 2>&1; then
    printf 'Android device %s is not ready for Flutter validation.\n' "$DEVICE_ID" >&2
    exit 1
  fi

  if [ -f "$APK_PATH" ]; then
    adb -s "$DEVICE_ID" install -r "$APK_PATH" >/dev/null
  fi
fi

run_flow() {
  local flow_name="$1"
  local flow_path="$2"
  local run_dir="$3"

  mkdir -p "$run_dir"
  adb -s "$DEVICE_ID" shell am force-stop "$APP_ID" >/dev/null 2>&1 || true
  sleep 2

  if maestro test --platform android --udid "$DEVICE_ID" --debug-output "$run_dir/debug" "$flow_path" > "$run_dir/maestro.out" 2>&1; then
    printf 'PASS\n' > "$run_dir/result.txt"
  else
    printf 'FAIL\n' > "$run_dir/result.txt"
  fi

  printf '%s\n' "$flow_name" > "$run_dir/flow.txt"
  adb -s "$DEVICE_ID" exec-out screencap -p > "$run_dir/final-raw.png" 2>/dev/null || true
  if [ -f "$run_dir/final-raw.png" ]; then
    sips -Z 1280 -s format jpeg -s formatOptions 75 "$run_dir/final-raw.png" --out "$run_dir/final.jpg" >/dev/null 2>&1 || true
  fi
}

if [ "$RUN_COUNT" -gt 0 ]; then
  for i in $(seq 1 "$RUN_COUNT"); do
    run_flow \
      "baseline" \
      "$ROOT/flows/samples/flutter/mobitru-flutter-login-baseline.yaml" \
      "$OUT_DIR/run-$(printf '%03d' "$i")-baseline"

    run_flow \
      "login" \
      "$ROOT/flows/samples/flutter/mobitru-flutter-login.yaml" \
      "$OUT_DIR/run-$(printf '%03d' "$i")-login"
  done
fi

OUT_DIR="$OUT_DIR" python3 - <<'PY'
import os
from pathlib import Path

root = Path(os.environ['OUT_DIR'])
runs = sorted(p for p in root.glob('run-*') if p.is_dir())
passed = sum((p / 'result.txt').read_text().strip() == 'PASS' for p in runs if (p / 'result.txt').exists())
total = len(runs)
print(f'Flutter Android Phase 3 summary: {passed}/{total} passed')
PY
