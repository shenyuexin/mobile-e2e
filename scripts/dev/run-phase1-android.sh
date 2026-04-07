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

run_owned_adb_replay() {
  local flow_file="$1"
  local run_dir="$2"
  local device_id="$3"
  local app_id="$4"

  python3 - "$flow_file" "$device_id" "$app_id" "$run_dir" << 'PYEOF'
import sys
import subprocess
import yaml
import json
import os
import re
import xml.etree.ElementTree as ET

flow_path = sys.argv[1]
device_id = sys.argv[2]
app_id = sys.argv[3]
run_dir = sys.argv[4]

def adb(args, check=False):
    if isinstance(args, str):
        cmd = ["adb", "-s", device_id] + args.split()
    else:
        cmd = ["adb", "-s", device_id] + list(args)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if check and result.returncode != 0:
        raise RuntimeError(f"adb {' '.join(cmd[3:])} failed: {result.stderr}")
    return result

def escape_adb_text(text):
    return (text
        .replace(" ", "%s")
        .replace("@", "%40")
        .replace("&", "%26")
        .replace("|", "%7C")
        .replace(";", "%3B")
        .replace("(", "%28")
        .replace(")", "%29")
        .replace("$", "%24")
        .replace("#", "%23")
        .replace(",", "%2C")
        .replace("^", "%5E")
        .replace("{", "%7B")
        .replace("}", "%7D")
        .replace("<", "%3C")
        .replace(">", "%3E")
        .replace("\\", "%5C")
        .replace("\"", "%22")
        .replace("'", "%60")
        .replace("=", "%3D")
        .replace("~", "%7E")
        .replace("!", "%21")
        .replace("*", "%2A"))

def parse_point(value):
    if not value:
        return None
    parts = str(value).split(",")
    if len(parts) != 2:
        return None
    try:
        return (int(parts[0].strip()), int(parts[1].strip()))
    except ValueError:
        return None

def dump_ui_xml():
    result = adb("shell uiautomator dump /sdcard/ui.xml && shell cat /sdcard/ui.xml", check=True)
    return ET.fromstring(result.stdout)

def find_element_by_selector(root, selector_dict):
    for attr_name, yaml_key in [("text", "text"), ("resource-id", "id"), ("content-desc", "identifier")]:
        val = selector_dict.get(yaml_key)
        if val and root.find(f".//*[@{attr_name}='{val}']") is not None:
            return root.find(f".//*[@{attr_name}='{val}']")
    return None

def get_element_center(element):
    bounds = element.get("bounds")
    if not bounds:
        return None
    m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds)
    if not m:
        return None
    cx = (int(m.group(1)) + int(m.group(3))) // 2
    cy = (int(m.group(2)) + int(m.group(4))) // 2
    return (cx, cy)

with open(flow_path) as f:
    docs = list(yaml.safe_load_all(f))

steps = None
for doc in docs:
    if isinstance(doc, list):
        steps = doc
        break

if steps is None:
    print("No flow steps found", file=sys.stderr)
    sys.exit(1)

results = []
for i, step in enumerate(steps):
    step_num = i + 1
    try:
        if not isinstance(step, dict):
            results.append({"step": step_num, "command": "unknown", "status": "skipped"})
            continue

        if "launchApp" in step:
            app = step["launchApp"].get("appId", app_id) if isinstance(step["launchApp"], dict) else app_id
            adb(f"shell monkey -p {app} -c android.intent.category.LAUNCHER 1", check=True)
            results.append({"step": step_num, "command": "launchApp", "status": "pass"})

        elif "tapOn" in step:
            tap = step["tapOn"]
            point = parse_point(tap.get("point") if isinstance(tap, dict) else tap)
            if point:
                x, y = point
                adb(f"shell input tap {x} {y}", check=True)
                results.append({"step": step_num, "command": "tapOn.point", "status": "pass"})
            elif isinstance(tap, dict):
                root = dump_ui_xml()
                target = find_element_by_selector(root, tap)
                if target is not None:
                    center = get_element_center(target)
                    if center:
                        adb(f"shell input tap {center[0]} {center[1]}", check=True)
                        results.append({"step": step_num, "command": "tapOn.selector", "status": "pass"})
                    else:
                        results.append({"step": step_num, "command": "tapOn", "status": "fail", "error": "Could not parse bounds"})
                else:
                    results.append({"step": step_num, "command": "tapOn", "status": "fail", "error": "Element not found"})
            else:
                results.append({"step": step_num, "command": "tapOn", "status": "fail", "error": "Invalid tapOn format"})

        elif "inputText" in step:
            text = str(step["inputText"])
            escaped = escape_adb_text(text)
            adb(f"shell input text '{escaped}'", check=True)
            results.append({"step": step_num, "command": "inputText", "status": "pass"})

        elif "assertVisible" in step:
            root = dump_ui_xml()
            assert_step = step["assertVisible"]
            if isinstance(assert_step, dict):
                found = find_element_by_selector(root, assert_step) is not None
            else:
                found = False
            results.append({"step": step_num, "command": "assertVisible", "status": "pass" if found else "fail"})

        elif "swipe" in step:
            swipe = step["swipe"]
            start = parse_point(swipe.get("start")) if isinstance(swipe, dict) else None
            end = parse_point(swipe.get("end")) if isinstance(swipe, dict) else None
            duration = int(swipe.get("duration", 300)) if isinstance(swipe, dict) else 300
            if start and end:
                adb(f"shell input swipe {start[0]} {start[1]} {end[0]} {end[1]} {duration}", check=True)
                results.append({"step": step_num, "command": "swipe", "status": "pass"})
            else:
                results.append({"step": step_num, "command": "swipe", "status": "fail", "error": "Could not parse coordinates"})

        elif "back" in step:
            adb("shell input keyevent 4", check=True)
            results.append({"step": step_num, "command": "back", "status": "pass"})

        elif "home" in step:
            adb("shell input keyevent 3", check=True)
            results.append({"step": step_num, "command": "home", "status": "pass"})

        elif "hideKeyboard" in step:
            adb("shell input keyevent 4", check=True)
            results.append({"step": step_num, "command": "hideKeyboard", "status": "pass"})

        elif "stopApp" in step:
            stop_app_id = step["stopApp"].get("appId", app_id) if isinstance(step["stopApp"], dict) else app_id
            adb(f"shell am force-stop {stop_app_id}", check=True)
            results.append({"step": step_num, "command": "stopApp", "status": "pass"})

        elif "clearState" in step:
            clear_app_id = step["clearState"].get("appId", app_id) if isinstance(step["clearState"], dict) else app_id
            adb(f"shell pm clear {clear_app_id}", check=True)
            results.append({"step": step_num, "command": "clearState", "status": "pass"})

        elif "assertNotVisible" in step:
            root = dump_ui_xml()
            assert_step = step["assertNotVisible"]
            if isinstance(assert_step, dict):
                found = find_element_by_selector(root, assert_step) is not None
            else:
                found = False
            results.append({"step": step_num, "command": "assertNotVisible", "status": "fail" if found else "pass"})

        else:
            cmd_name = list(step.keys())[0] if step else "unknown"
            results.append({"step": step_num, "command": cmd_name, "status": "skipped", "error": f"Unsupported: {cmd_name}"})
    except Exception as e:
        results.append({"step": step_num, "command": "error", "status": "fail", "error": str(e)})

with open(os.path.join(run_dir, "owned-adb-results.json"), "w") as f:
    json.dump(results, f, indent=2)

all_passed = all(r["status"] == "pass" for r in results)
if all_passed:
    print(f"PASS: {len(results)}/{len(results)} steps passed")
else:
    failed = [r for r in results if r["status"] == "fail"]
    print(f"FAIL: {len(failed)}/{len(results)} steps failed", file=sys.stderr)
    for r in failed:
        print(f"  Step {r['step']}: {r['command']} - {r.get('error', '')}", file=sys.stderr)
    sys.exit(1)
PYEOF
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

    # Determine replay backend
    REPLAY_BACKEND="${ANDROID_REPLAY_BACKEND:-auto}"
    if [ "$REPLAY_BACKEND" = "auto" ]; then
      if adb -s "$DEVICE_ID" shell pm list packages 2>/dev/null | grep -q "^package:dev\.mobile\.maestro$"; then
        REPLAY_BACKEND="maestro"
      else
        REPLAY_BACKEND="owned-adb"
      fi
    fi

    if [ "$REPLAY_BACKEND" = "owned-adb" ]; then
      if run_owned_adb_replay "$FLOW" "$RUN_DIR" "$DEVICE_ID" "$APP_ID" > "$RUN_DIR/owned-adb.out" 2>&1; then
        printf 'PASS\n' > "$RUN_DIR/result.txt"
      else
        printf 'FAIL\n' > "$RUN_DIR/result.txt"
      fi
    elif should_use_oem_text_fallback; then
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
