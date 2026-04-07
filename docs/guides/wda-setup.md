# WDA (WebDriverAgent) Setup Guide for iOS Real-Device Automation

> WDA is the backend for iOS physical-device UI automation (Phase 15+).
> This guide walks through building, signing, and connecting WDA to this project.

## What is WDA?

WebDriverAgent (WDA) is an open-source iOS automation framework that exposes an HTTP API for UI inspection, tap, type, swipe, and screenshot on real devices. This project communicates directly with WDA's HTTP API — **no Appium, no Maestro helper app needed**.

## Prerequisites

| Requirement | Version | Install |
|---|---|---|
| macOS | 13+ | Built-in |
| Xcode | 14+ | App Store or [developer.apple.com](https://developer.apple.com/download/) |
| Apple Developer Account | Free or $99/year | [Apple Developer](https://developer.apple.com/) |
| Physical iOS device | iOS 14+ | USB-C or Lightning connection |
| libusbmuxd | Any | `brew install libusbmuxd` |

## Step 1: Install libusbmuxd

```bash
brew install libusbmuxd
```

This provides the `iproxy` command for port forwarding.

## Step 2: Clone and Build WDA

```bash
cd ~
git clone https://github.com/appium/WebDriverAgent
cd WebDriverAgent
```

## Step 3: Configure Code Signing

Open the project in Xcode:

```bash
open WebDriverAgent.xcodeproj
```

In Xcode:

1. Select the `WebDriverAgentRunner` target (not the main target)
2. Go to **Signing & Capabilities**
3. Check **Automatically manage signing**
4. Select your **Team**:
   - **Free Apple ID**: Works for 7 days, then needs re-signing. Good for testing.
   - **Paid Developer Account ($99/year)**: Certificates last 1 year. Required for production.
5. Set a unique **Bundle Identifier** prefix (e.g., `com.yourname.WebDriverAgentRunner`)

## Step 4: Build to Device

1. Connect your iOS device via USB
2. In Xcode, select your **device** as the destination (not a simulator)
3. **Product → Build For → Testing** (`⌘ + Shift + U`)

If signing fails:
- Go to **Settings → General → VPN & Device Management** on your device
- Trust your developer certificate
- Retry the build

## Step 5: Launch WDA on Device

After a successful build, WDA is installed on your device but not running. Start it:

```bash
# Find your device UDID
xcrun xctrace list devices

# Launch WDA via xcrun devicectl (Xcode 14+)
xcrun devicectl device process launch --device <UDID> <BUNDLE_ID>
```

The bundle ID is what you set in Step 3 (e.g., `com.yourname.WebDriverAgentRunner`).

You should see output like:

```
ServerURLHere->http://localhost:8100<-ServerURLHere
```

This means WDA is running and listening on port 8100.

## Step 6: Set Up Port Forwarding

WDA listens on the device's localhost. To access it from your Mac:

```bash
iproxy 8100 8100 --udid <UDID> &
```

This forwards your Mac's `localhost:8100` to the device's `localhost:8100`.

## Step 7: Verify Connection

```bash
# Check WDA status
curl -s http://localhost:8100/status | python3 -m json.tool

# Get accessibility tree
curl -s http://localhost:8100/source | python3 -m json.tool | head -50

# Test a tap
curl -s -X POST http://localhost:8100/wda/tap -d '{"x":100,"y":200}'
```

If these commands return JSON responses, WDA is fully connected.

## Using WDA with This Project

### Automatic (Recommended)

This project auto-detects the WDA backend when you target a physical device UDID:

```bash
# Set the backend explicitly (optional, auto-detect works too)
export IOS_EXECUTION_BACKEND=wda

# Run inspect_ui on a physical device
mobile-e2e-mcp inspect_ui --platform ios --deviceId <UDID>
```

### Via Doctor

Check WDA connectivity:

```bash
mobile-e2e-mcp doctor
```

Expected output:
- `iproxy` — pass (if installed)
- `wda` — pass (if WDA is running and iproxy is forwarding)

### Via Environment Variable

| Variable | Value | Effect |
|---|---|---|
| `IOS_EXECUTION_BACKEND` | `wda` | Force WDA backend for all iOS actions |
| `IOS_EXECUTION_BACKEND` | `axe` | Force AXe CLI (simulators only) |
| (not set) | — | Auto-detect: simulator UDID → axe, physical UDID → wda |

## Troubleshooting

### WDA returns "Connection refused"

- WDA is not running on the device. Relaunch via `xcrun devicectl device process launch`.
- Check WDA logs on the device: **Settings → Privacy → Analytics & Improvements → Analytics Data → search for "WebDriverAgent"**.

### iproxy fails to start

- Device not connected via USB. Check with `xcrun xctrace list devices`.
- libusbmuxd not installed. Run `brew install libusbmuxd`.
- Another process using port 8100. Kill it or use a different port: `iproxy 8200 8100 --udid <UDID>`.

### WDA certificate expired (free Apple ID)

- Free Apple ID certificates expire every 7 days.
- Re-open Xcode, select the device, and **Product → Build For → Testing** again.
- Then trust the certificate on the device again (Settings → General → VPN & Device Management).

### WDA crashes during hierarchy capture

- Large UI trees can cause WDA to crash. This is a known issue.
- Workaround: simplify the current screen (navigate away from heavy lists/grids) before `inspect_ui`.
- The project includes a health check (`GET /status`) before each action. If WDA is down, you'll get a clear error message.

## Architecture Note

This project communicates with WDA via Node.js `fetch()` — no Python, no Appium, no Ruby. The WDA backend (`ios-backend-wda.ts`) transforms WDA's `/source` JSON format (XCUIElementType names, `name`/`label` fields, `rect` coordinates) into the project's internal format (`Button`, `AXLabel`, `frame`), making it compatible with existing UI resolution logic.

```
┌─────────────┐     HTTP      ┌─────────────┐     iproxy     ┌─────────────┐
│ MCP Server  │ ────────────→ │   Node.js   │ ─────────────→ │ iOS Device  │
│ (this proj) │  fetch()      │   WDA Backend│   localhost    │   (WDA)     │
│             │ ←──────────── │             │ ←───────────── │             │
└─────────────┘   JSON resp   └─────────────┘   port 8100    └─────────────┘
```
