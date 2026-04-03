#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IOS_DEVICE_ID="${IOS_DEVICE_ID:-${DEVICE_ID:-}}"
APP_ID="${APP_ID:-com.mobitru.demoapp}"
RUN_COUNT="${1:-1}"
OUT_DIR="${OUT_DIR:-$ROOT/artifacts/phase3-native-ios-real-device}"
APP_PATH="${NATIVE_IOS_DEVICE_APP_PATH:-}"

if [ -z "$IOS_DEVICE_ID" ]; then
  printf 'IOS_DEVICE_ID (or DEVICE_ID) is required for iOS physical-device validation.\n' >&2
  exit 1
fi

export PATH="$PATH:$HOME/.maestro/bin"
export MAESTRO_CLI_NO_ANALYTICS=1

mkdir -p "$OUT_DIR"

if ! xcrun devicectl list devices | grep -q "$IOS_DEVICE_ID"; then
  printf 'iOS physical device %s is not available in devicectl list devices.\n' "$IOS_DEVICE_ID" >&2
  exit 1
fi

if [ -n "$APP_PATH" ] && [ -d "$APP_PATH" ]; then
  xcrun devicectl device install app --device "$IOS_DEVICE_ID" "$APP_PATH" >/dev/null
fi

run_flow() {
  local flow_name="$1"
  local flow_path="$2"
  local run_dir="$3"

  mkdir -p "$run_dir"

  if maestro test --platform ios --udid "$IOS_DEVICE_ID" --debug-output "$run_dir/debug" "$flow_path" > "$run_dir/maestro.out" 2>&1; then
    printf 'PASS\n' > "$run_dir/result.txt"
  else
    printf 'FAIL\n' > "$run_dir/result.txt"
  fi

  printf '%s\n' "$flow_name" > "$run_dir/flow.txt"
}

if [ "$RUN_COUNT" -gt 0 ]; then
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
print(f'Native iOS real-device Phase 3 summary: {passed}/{total} passed')
PY
