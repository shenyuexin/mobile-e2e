#!/usr/bin/env bash

set -euo pipefail

MODE="${1:-chain}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UDID="${MAESTRO_UDID:-00008101-000D482C1E78001E}"
TEAM_ID="${MAESTRO_APPLE_TEAM_ID:-DKA9H3FV25}"
FLOW="${MAESTRO_FLOW:-flows/samples/native/mobitru-ios-login.yaml}"
STARTUP_TIMEOUT="${MAESTRO_DRIVER_STARTUP_TIMEOUT:-300000}"
MAESTRO_REPO_DIR="${MAESTRO_REPO_DIR:-$HOME/Documents/GitHub/Maestro}"
RUNNER_MODE="${MAESTRO_RUNNER_MODE:-auto}" # auto|manual
DEBUG_OUTPUT="${MAESTRO_DEBUG_OUTPUT:-$ROOT/artifacts/maestro-ios-manual-runner}"
DRY_RUN="${MAESTRO_DRY_RUN:-0}"
XCTRUNNER_BUNDLE_ID_OVERRIDE="${MAESTRO_XCTRUNNER_BUNDLE_ID:-}"

if [ "$MODE" != "prepare" ] && [ "$MODE" != "run" ] && [ "$MODE" != "chain" ]; then
  printf 'Usage: %s [prepare|run|chain]\n' "$0" >&2
  exit 2
fi

if [ "$RUNNER_MODE" != "auto" ] && [ "$RUNNER_MODE" != "manual" ]; then
  printf 'MAESTRO_RUNNER_MODE must be auto or manual (received: %s)\n' "$RUNNER_MODE" >&2
  exit 2
fi

find_latest_derived() {
  python3 - <<'PY'
from pathlib import Path
root = Path.home() / "Library/Developer/Xcode/DerivedData"
candidates = [p for p in root.glob("maestro-driver-ios-*") if p.is_dir()]
if not candidates:
    raise SystemExit(1)
latest = max(candidates, key=lambda p: p.stat().st_mtime)
print(str(latest))
PY
}

assert_device_visible() {
  if xcrun devicectl list devices 2>/dev/null | grep -q "$UDID"; then
    return 0
  fi
  if idb list-targets 2>/dev/null | grep -q "$UDID"; then
    return 0
  fi

  printf 'Device %s is not visible in either devicectl or idb list-targets.\n' "$UDID" >&2
  exit 1
}

prepare_manual_runner_cache() {
  DERIVED_DIR="$(find_latest_derived || true)"
  if [ -z "$DERIVED_DIR" ]; then
    printf 'No DerivedData directory matching maestro-driver-ios-* found.\n' >&2
    printf 'Run Product->Test in Xcode once on maestro-driver-ios project first.\n' >&2
    exit 1
  fi

  SRC_PRODUCTS="$DERIVED_DIR/Build/Products"
  DST_PRODUCTS="$HOME/.maestro/maestro-iphoneos-driver-build/driver-iphoneos/Build/Products"

  if [ ! -d "$SRC_PRODUCTS" ]; then
    printf 'Missing source products directory: %s\n' "$SRC_PRODUCTS" >&2
    exit 1
  fi

  mkdir -p "$DST_PRODUCTS"

  if [ -d "$SRC_PRODUCTS/Debug-iphoneos" ]; then
    rm -rf "$DST_PRODUCTS/Debug-iphoneos"
    cp -R "$SRC_PRODUCTS/Debug-iphoneos" "$DST_PRODUCTS/"
  else
    printf 'Missing Debug-iphoneos under %s\n' "$SRC_PRODUCTS" >&2
    exit 1
  fi

  XCTESTRUN_FILE=""
  while IFS= read -r -d '' f; do
    XCTESTRUN_FILE="$f"
    break
  done < <(find "$SRC_PRODUCTS" -maxdepth 1 -name "*.xctestrun" -print0)

  if [ -z "$XCTESTRUN_FILE" ]; then
    while IFS= read -r -d '' f; do
      XCTESTRUN_FILE="$f"
      break
    done < <(find "$DERIVED_DIR" -name "*.xctestrun" -print0)
  fi

  if [ -z "$XCTESTRUN_FILE" ] && [ -f "$MAESTRO_REPO_DIR/maestro-ios-driver/src/main/resources/driver-iphoneos/maestro-driver-ios-config.xctestrun" ]; then
    XCTESTRUN_FILE="$MAESTRO_REPO_DIR/maestro-ios-driver/src/main/resources/driver-iphoneos/maestro-driver-ios-config.xctestrun"
  fi

  if [ -z "$XCTESTRUN_FILE" ]; then
    XCTESTRUN_FILE="$DST_PRODUCTS/maestro-driver-ios-config.xctestrun"
    cat > "$XCTESTRUN_FILE" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict/></plist>
EOF
    printf 'No .xctestrun found in DerivedData, wrote placeholder at %s\n' "$XCTESTRUN_FILE"
  else
    cp "$XCTESTRUN_FILE" "$DST_PRODUCTS/"
    printf 'Using xctestrun: %s\n' "$XCTESTRUN_FILE"
    XCTESTRUN_FILE="$DST_PRODUCTS/$(basename "$XCTESTRUN_FILE")"
  fi

  local apps_json
  apps_json="$(mktemp -t maestro-ios-apps.XXXXXX.json)"
  local xctrunner_bundle_id
  xctrunner_bundle_id="$XCTRUNNER_BUNDLE_ID_OVERRIDE"

  if [ -z "$xctrunner_bundle_id" ]; then
    if xcrun devicectl device info apps --device "$UDID" --json-output "$apps_json" >/dev/null 2>&1; then
      xctrunner_bundle_id="$(python3 - "$apps_json" <<'PY'
import json
import sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    payload = json.load(f)
apps = payload.get('result', {}).get('apps', [])
for app in apps:
    bundle_id = app.get('bundleIdentifier', '')
    if bundle_id.endswith('.xctrunner') and 'maestro-driver-iosUITests' in bundle_id:
        print(bundle_id)
        break
PY
)"
    fi
  fi

  rm -f "$apps_json"

  if [ -n "$xctrunner_bundle_id" ]; then
    python3 - "$XCTESTRUN_FILE" "$xctrunner_bundle_id" <<'PY'
import plistlib
import sys

path = sys.argv[1]
bundle_id = sys.argv[2]

with open(path, 'rb') as f:
    data = plistlib.load(f)

updated = False
for _, value in list(data.items()):
    if not isinstance(value, dict):
        continue
    if value.get('TestHostBundleIdentifier'):
        if value['TestHostBundleIdentifier'] != bundle_id:
            value['TestHostBundleIdentifier'] = bundle_id
            updated = True

if updated:
    with open(path, 'wb') as f:
        plistlib.dump(data, f)
    print(f'Patched TestHostBundleIdentifier in {path} -> {bundle_id}')
else:
    print(f'No TestHostBundleIdentifier change needed in {path}')
PY
  else
    printf 'Could not auto-detect xctrunner bundle id from device; keeping xctestrun as-is.\n'
  fi

  mkdir -p "$HOME/.maestro/maestro-iphoneos-driver-build"
  CLI_VER="$(maestro --version | sed -E 's/[^0-9]*([0-9]+\.[0-9]+\.[0-9]+).*/\1/' | head -1)"
  if [ -z "$CLI_VER" ]; then
    printf 'Unable to detect Maestro CLI version.\n' >&2
    exit 1
  fi
  printf 'version=%s\n' "$CLI_VER" > "$HOME/.maestro/maestro-iphoneos-driver-build/version.properties"

  printf '\nPrepared Maestro iOS driver cache successfully.\n'
  printf 'DerivedData: %s\n' "$DERIVED_DIR"
  printf 'Seeded cache: %s\n' "$DST_PRODUCTS"
}

run_manual_mode() {
  export USE_XCODE_TEST_RUNNER=1
  export MAESTRO_DRIVER_STARTUP_TIMEOUT="$STARTUP_TIMEOUT"

  printf 'Running Maestro in manual runner mode...\n'
  printf 'UDID: %s\nTeam: %s\nFlow: %s\n' "$UDID" "$TEAM_ID" "$FLOW"
  printf 'NOTE: Keep Xcode Product->Test runner alive for this mode.\n'

  local cmd=(
    maestro test
    --no-reinstall-driver
    --apple-team-id "$TEAM_ID"
    --platform ios
    --udid "$UDID"
    --debug-output "$DEBUG_OUTPUT"
    "$FLOW"
  )
  if [ "$DRY_RUN" = "1" ]; then
    printf 'DRY_RUN=1, command:\n'
    printf '  %q' "${cmd[@]}"
    printf '\n'
    return 0
  fi
  "${cmd[@]}"
}

run_auto_mode() {
  unset USE_XCODE_TEST_RUNNER || true
  export MAESTRO_DRIVER_STARTUP_TIMEOUT="$STARTUP_TIMEOUT"

  printf 'Running Maestro in auto driver mode...\n'
  printf 'UDID: %s\nTeam: %s\nFlow: %s\n' "$UDID" "$TEAM_ID" "$FLOW"

  local cmd=(
    maestro test
    --apple-team-id "$TEAM_ID"
    --platform ios
    --udid "$UDID"
    --debug-output "$DEBUG_OUTPUT"
    "$FLOW"
  )
  if [ "$DRY_RUN" = "1" ]; then
    printf 'DRY_RUN=1, command:\n'
    printf '  %q' "${cmd[@]}"
    printf '\n'
    return 0
  fi
  "${cmd[@]}"
}

run_selected_mode() {
  if [ "$RUNNER_MODE" = "manual" ]; then
    run_manual_mode
  else
    run_auto_mode
  fi
}

cd "$ROOT"

if [ ! -f "$FLOW" ]; then
  printf 'Flow file not found: %s\n' "$FLOW" >&2
  exit 1
fi

assert_device_visible
mkdir -p "$DEBUG_OUTPUT"

if [ "$MODE" = "prepare" ]; then
  prepare_manual_runner_cache
  exit 0
fi

if [ "$MODE" = "chain" ]; then
  if [ "$RUNNER_MODE" = "manual" ]; then
    prepare_manual_runner_cache
  fi
  run_selected_mode
  exit 0
fi

run_selected_mode
