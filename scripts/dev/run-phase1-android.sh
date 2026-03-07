#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FLOW="$ROOT/flows/samples/react-native/android-login-smoke.yaml"
DEVICE_ID="${DEVICE_ID:-emulator-5554}"
EXPO_URL="${EXPO_URL:-exp://127.0.0.1:8081}"
RUN_COUNT="${1:-5}"
OUT_DIR="${OUT_DIR:-$ROOT/artifacts/phase1-android}"

export PATH="$PATH:$HOME/.maestro/bin"
export MAESTRO_CLI_NO_ANALYTICS=1

mkdir -p "$OUT_DIR"

for i in $(seq 1 "$RUN_COUNT"); do
  RUN_DIR="$OUT_DIR/run-$(printf '%03d' "$i")"
  mkdir -p "$RUN_DIR"

  adb -s "$DEVICE_ID" reverse tcp:8081 tcp:8081 >/dev/null 2>&1 || true
  adb -s "$DEVICE_ID" shell am force-stop host.exp.exponent || true
  sleep 2
  adb -s "$DEVICE_ID" shell am start -a android.intent.action.VIEW -d "$EXPO_URL" host.exp.exponent >/dev/null 2>&1 || true
  sleep 10

  if maestro test --platform android --udid "$DEVICE_ID" --debug-output "$RUN_DIR/debug" "$FLOW" > "$RUN_DIR/maestro.out" 2>&1; then
    printf 'PASS\n' > "$RUN_DIR/result.txt"
  else
    printf 'FAIL\n' > "$RUN_DIR/result.txt"
  fi

  adb -s "$DEVICE_ID" exec-out screencap -p > "$RUN_DIR/final-raw.png" 2>/dev/null || true
  if [ -f "$RUN_DIR/final-raw.png" ]; then
    sips -Z 1280 -s format jpeg -s formatOptions 75 "$RUN_DIR/final-raw.png" --out "$RUN_DIR/final.jpg" >/dev/null 2>&1 || true
  fi
done

OUT_DIR="$OUT_DIR" python3 - <<'PY'
import os
from pathlib import Path

root = Path(os.environ["OUT_DIR"])
runs = sorted(p for p in root.glob('run-*') if p.is_dir())
passed = sum((p/'result.txt').read_text().strip() == 'PASS' for p in runs if (p/'result.txt').exists())
total = len(runs)
print(f'Android Phase 1 summary: {passed}/{total} passed')
PY
