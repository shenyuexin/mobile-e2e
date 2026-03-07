#!/usr/bin/env bash

set -euo pipefail

ROOT="/Users/linan/Documents/mobile-e2e-mcp"
IOS_RUNS="${1:-5}"
ANDROID_RUNS="${2:-5}"
FLUTTER_RUNS="${3:-3}"
NATIVE_ANDROID_RUNS="${4:-2}"
NATIVE_IOS_RUNS="${5:-2}"

"$ROOT/scripts/run_phase1_ios.sh" "$IOS_RUNS"
"$ROOT/scripts/run_phase1_android.sh" "$ANDROID_RUNS"
if [ "${RUN_FLUTTER_ANDROID:-1}" = "1" ]; then
  "$ROOT/scripts/run_phase3_flutter_android.sh" "$FLUTTER_RUNS"
fi
if [ "${RUN_NATIVE_ANDROID:-1}" = "1" ]; then
  "$ROOT/scripts/run_phase3_native_android.sh" "$NATIVE_ANDROID_RUNS"
fi
if [ "${RUN_NATIVE_IOS:-1}" = "1" ]; then
  "$ROOT/scripts/run_phase3_native_ios.sh" "$NATIVE_IOS_RUNS"
fi
python3 "$ROOT/scripts/generate_phase_report.py"

printf 'Generated report:\n  %s\n  %s\n' "$ROOT/reports/phase-sample-report.json" "$ROOT/reports/phase-sample-report.md"
