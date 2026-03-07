#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SIM_UDID="${SIM_UDID:-ADA078B9-3C6B-4875-8B85-A7789F368816}"
APP_ID="${APP_ID:-com.epam.mobitru.demoapp}"
RUN_COUNT="${1:-2}"
OUT_DIR="${OUT_DIR:-$ROOT/artifacts/phase3-native-ios}"
APP_PATH="${NATIVE_IOS_APP_PATH:-$ROOT/examples/demo-ios-app/build/Build/Products/Debug-iphonesimulator/MobiTruKotlin.app}"

export PATH="$PATH:$HOME/.maestro/bin"
export MAESTRO_CLI_NO_ANALYTICS=1

mkdir -p "$OUT_DIR"

run_flow() {
  local flow_name="$1"
  local flow_path="$2"
  local run_dir="$3"

  mkdir -p "$run_dir"
  xcrun simctl terminate "$SIM_UDID" "$APP_ID" >/dev/null 2>&1 || true
  sleep 2

  if maestro test --platform ios --udid "$SIM_UDID" --debug-output "$run_dir/debug" "$flow_path" > "$run_dir/maestro.out" 2>&1; then
    printf 'PASS\n' > "$run_dir/result.txt"
  else
    printf 'FAIL\n' > "$run_dir/result.txt"
  fi

  printf '%s\n' "$flow_name" > "$run_dir/flow.txt"
  xcrun simctl io "$SIM_UDID" screenshot "$run_dir/final-raw.png" >/dev/null 2>&1 || true
  if [ -f "$run_dir/final-raw.png" ]; then
    sips -Z 1280 -s format jpeg -s formatOptions 75 "$run_dir/final-raw.png" --out "$run_dir/final.jpg" >/dev/null 2>&1 || true
  fi
}

if [ "$RUN_COUNT" -gt 0 ]; then
  if ! xcrun simctl bootstatus "$SIM_UDID" -b >/dev/null 2>&1; then
    printf 'iOS simulator %s is not booted for native validation.\n' "$SIM_UDID" >&2
    exit 1
  fi

  if [ -d "$APP_PATH" ]; then
    xcrun simctl install "$SIM_UDID" "$APP_PATH" >/dev/null
  fi

  for i in $(seq 1 "$RUN_COUNT"); do
    run_flow \
      "baseline" \
      "$ROOT/flows/samples/native/mobitru-ios-baseline.yaml" \
      "$OUT_DIR/run-$(printf '%03d' "$i")-baseline"

    run_flow \
      "login" \
      "$ROOT/flows/samples/native/mobitru-ios-login.yaml" \
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
print(f'Native iOS Phase 3 summary: {passed}/{total} passed')
PY
