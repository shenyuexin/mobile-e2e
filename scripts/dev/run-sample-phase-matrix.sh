#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IOS_RUNS="${1:-5}"
ANDROID_RUNS="${2:-5}"
FLUTTER_RUNS="${3:-3}"
NATIVE_ANDROID_RUNS="${4:-2}"
NATIVE_IOS_RUNS="${5:-2}"

"$ROOT/scripts/dev/run-phase1-ios.sh" "$IOS_RUNS"
"$ROOT/scripts/dev/run-phase1-android.sh" "$ANDROID_RUNS"
if [ "${RUN_FLUTTER_ANDROID:-1}" = "1" ]; then
  "$ROOT/scripts/dev/run-phase3-flutter-android.sh" "$FLUTTER_RUNS"
fi
if [ "${RUN_NATIVE_ANDROID:-1}" = "1" ]; then
  "$ROOT/scripts/dev/run-phase3-native-android.sh" "$NATIVE_ANDROID_RUNS"
fi
if [ "${RUN_NATIVE_IOS:-1}" = "1" ]; then
  "$ROOT/scripts/dev/run-phase3-native-ios.sh" "$NATIVE_IOS_RUNS"
fi
python3 "$ROOT/scripts/report/generate-phase-report.py"

printf 'Generated report:\n  %s\n  %s\n' "$ROOT/reports/phase-sample-report.json" "$ROOT/reports/phase-sample-report.md"
