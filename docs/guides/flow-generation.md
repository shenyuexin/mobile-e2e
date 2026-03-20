# Flow Generation Guide

This document is the flow export/replay operation guide. It covers two valid paths:

1. Action-record path: `perform_action_with_evidence -> export_session_flow -> run_flow`
2. Passive recording path: `start_record_session -> end_record_session -> run_flow`

## 1) Passive recording path (MCP front door)

Use this path when you want to manually operate device/emulator and generate a replayable flow.

Start recording:

```json
{
  "method": "tools/call",
  "params": {
    "name": "start_record_session",
    "arguments": {
      "sessionId": "record-login-001",
      "platform": "android",
      "deviceId": "emulator-5554",
      "appId": "com.example.app",
      "dryRun": false
    }
  }
}
```

Manually operate the app, then end recording:

```json
{
  "method": "tools/call",
  "params": {
    "name": "end_record_session",
    "arguments": {
      "recordSessionId": "<recordSessionId-from-start>",
      "autoExport": true,
      "runReplayDryRun": true,
      "dryRun": false
    }
  }
}
```

Read `result.data.report.flowPath`, then replay:

```json
{
  "method": "tools/call",
  "params": {
    "name": "run_flow",
    "arguments": {
      "sessionId": "record-login-001",
      "platform": "android",
      "flowPath": "flows/samples/generated/<generated>.yaml",
      "dryRun": true
    }
  }
}
```

For OEM real devices that need explicit replay controls (for example vivo/oppo multi-user devices), pass `androidReplayOptions`:

```json
{
  "method": "tools/call",
  "params": {
    "name": "run_flow",
    "arguments": {
      "sessionId": "record-login-001",
      "platform": "android",
      "deviceId": "10AEA40Z3Y000R5",
      "flowPath": "flows/samples/native/mobitru-android-login.yaml",
      "androidReplayOptions": {
        "userId": "0",
        "textInputStrategy": "oem_fallback",
        "expectedAppPhase": "detail"
      }
    }
  }
}
```

Use cases:

- `userId`: force replay in a specific Android user space (typically `0` for vivo/oppo XSpace devices)
- `textInputStrategy`:
  - `auto` — default adapter decision
  - `maestro` — force native Maestro text input path
  - `oem_fallback` — force adb/UI-dump based OEM-safe text replay path
- `expectedAppPhase`: strong post-run validation target (for example `detail` after login)

For a compact quickstart version, also see `docs/guides/record-session-quickstart.md`.

## 2) Action-record export path

Use this path when session action records already exist (from `perform_action_with_evidence`).

Export:

```json
{
  "name": "export_session_flow",
  "arguments": {
    "sessionId": "demo-record-android-01"
  }
}
```

Optional task-oriented export:

```json
{
  "name": "record_task_flow",
  "arguments": {
    "sessionId": "demo-record-android-01",
    "goal": "Login and reach catalog"
  }
}
```

Replay exported flow with `run_flow` and returned `data.outputPath`.

## 3) Mapping coverage and current limit

Current mapping covers `launch_app`, `tap_element`, `type_into_element`, and `wait_for_ui`. `terminate_app` is skipped and reported in warnings.

For OEM-specific replay caveats and troubleshooting, see `docs/guides/vivo-oppo-multi-user-replay.md`.
