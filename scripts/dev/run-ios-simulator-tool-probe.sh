#!/usr/bin/env bash
#
# Run the iOS Simulator tool probe against a booted simulator.
#
# Usage:
#   ./scripts/dev/run-ios-simulator-tool-probe.sh
#   SIM_UDID=<your-udid> ./scripts/dev/run-ios-simulator-tool-probe.sh
#
# Prerequisites:
#   - Xcode installed
#   - Simulator booted: xcrun simctl boot <UDID>
#   - axe CLI installed: brew install cameroncooke/axe/axe
#   - MCP server running (this script starts it via tsx)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

SIM_UDID="${M2E_SIMULATOR_UDID:-${SIM_UDID:-ADA078B9-3C6B-4875-8B85-A7789F368816}}"
export M2E_SIMULATOR_UDID="$SIM_UDID"
export M2E_DEVICE_ID="$SIM_UDID"

echo "═══════════════════════════════════════════════"
echo " iOS Simulator Tool Probe"
echo "═══════════════════════════════════════════════"
echo "  Simulator UDID: $SIM_UDID"
echo "  Platform:       ios"
echo "  Runner:         native_ios"
echo "  App:            com.apple.Preferences"
echo "═══════════════════════════════════════════════"

# Check if simulator is booted
BOOTED_STATE=$(xcrun simctl list devices available 2>/dev/null | grep -A1 "$SIM_UDID" | grep -c "Booted" || true)
if [ "$BOOTED_STATE" -eq 0 ]; then
  echo "⚠️  Simulator $SIM_UDID is not booted."
  echo "   Boot it with: xcrun simctl boot '$SIM_UDID'"
  echo "   Or open Xcode → Window → Devices and Simulators"
  exit 1
fi

echo ""
echo "▶ Starting probe..."
echo ""

cd "$ROOT"
npx tsx scripts/dev/ios-simulator-tool-probe.ts
