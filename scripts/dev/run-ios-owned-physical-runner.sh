#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-execute-flow}"

if [[ "$MODE" != "execute-flow" ]]; then
  echo "Usage: $0 execute-flow" >&2
  exit 64
fi

UDID="${IOS_OWNED_RUNNER_UDID:-${MAESTRO_UDID:-}}"
FLOW_PATH="${IOS_OWNED_RUNNER_FLOW_PATH:-${MAESTRO_FLOW:-}}"
XCTESTRUN_PATH="${IOS_OWNED_RUNNER_XCTESTRUN_PATH:-$HOME/.mobile-e2e-mcp/ios-owned-runner/Build/Products/ios-owned-runner-config.xctestrun}"
STARTUP_TIMEOUT_MS="${IOS_OWNED_RUNNER_STARTUP_TIMEOUT_MS:-180000}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

UDID_SOURCE="IOS_OWNED_RUNNER_UDID"
if [[ -z "${IOS_OWNED_RUNNER_UDID:-}" && -n "${MAESTRO_UDID:-}" ]]; then
  UDID_SOURCE="MAESTRO_UDID"
fi

FLOW_SOURCE="IOS_OWNED_RUNNER_FLOW_PATH"
if [[ -z "${IOS_OWNED_RUNNER_FLOW_PATH:-}" && -n "${MAESTRO_FLOW:-}" ]]; then
  FLOW_SOURCE="MAESTRO_FLOW"
fi

if [[ -z "${IOS_OWNED_RUNNER_XCTESTRUN_PATH:-}" ]]; then
  if [[ -f "$REPO_ROOT/packages/adapter-maestro/runner/build/Build/Products/ios-owned-runner-config.xctestrun" ]]; then
    XCTESTRUN_PATH="$REPO_ROOT/packages/adapter-maestro/runner/build/Build/Products/ios-owned-runner-config.xctestrun"
  fi
fi

if [[ ! -f "$XCTESTRUN_PATH" ]]; then
  LATEST_DERIVED_XCTESTRUN="$(ls -t "$HOME"/Library/Developer/Xcode/DerivedData/ios-owned-runner-*/Build/Products/ios-owned-runner_*.xctestrun 2>/dev/null | head -n 1 || true)"
  if [[ -n "$LATEST_DERIVED_XCTESTRUN" && -f "$LATEST_DERIVED_XCTESTRUN" ]]; then
    XCTESTRUN_PATH="$LATEST_DERIVED_XCTESTRUN"
  fi
fi

if [[ -z "$UDID" ]]; then
  echo "Missing IOS_OWNED_RUNNER_UDID (or MAESTRO_UDID)" >&2
  exit 65
fi

if [[ -z "$FLOW_PATH" ]]; then
  echo "Missing IOS_OWNED_RUNNER_FLOW_PATH (or MAESTRO_FLOW)" >&2
  exit 65
fi

if [[ ! -f "$XCTESTRUN_PATH" ]]; then
  echo "Owned runner xctestrun not found: $XCTESTRUN_PATH" >&2
  exit 66
fi

if ! [[ "$STARTUP_TIMEOUT_MS" =~ ^[0-9]+$ ]]; then
  echo "IOS_OWNED_RUNNER_STARTUP_TIMEOUT_MS must be numeric" >&2
  exit 67
fi

echo "[ios-owned-runner] udid=$UDID"
echo "[ios-owned-runner] flow=$FLOW_PATH"
echo "[ios-owned-runner] udid_source=$UDID_SOURCE"
echo "[ios-owned-runner] flow_source=$FLOW_SOURCE"
echo "[ios-owned-runner] xctestrun=$XCTESTRUN_PATH"

IOS_OWNED_RUNNER_FLOW_PATH="$FLOW_PATH" \
IOS_OWNED_RUNNER_STARTUP_TIMEOUT_MS="$STARTUP_TIMEOUT_MS" \
xcodebuild test-without-building \
  -xctestrun "$XCTESTRUN_PATH" \
  -destination "id=$UDID"
