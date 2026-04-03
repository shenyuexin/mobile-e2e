# iOS Recording Showcase (Simulator + Physical Device)

This showcase demonstrates a reproducible iOS record/replay loop:

1. `start_record_session(platform=ios)`
2. Manual interaction (tap/type/swipe)
3. `end_record_session(autoExport=true)`
4. `run_flow` with exported YAML

## Preconditions

- `xcrun simctl` available
- `idb` and `idb_companion` available
- iOS simulator is booted **or** a physical iOS device is connected
- Target app installed on the selected iOS target

## Example sequence (simulator)

Start recording:

```json
{
  "name": "start_record_session",
  "arguments": {
    "sessionId": "ios-record-demo-001",
    "platform": "ios",
    "deviceId": "<simulator-udid>",
    "appId": "com.example.ios"
  }
}
```

## Example sequence (physical device)

Start recording:

```json
{
  "name": "start_record_session",
  "arguments": {
    "sessionId": "ios-record-real-device-001",
    "platform": "ios",
    "deviceId": "<ios-physical-udid>",
    "appId": "com.mobitru.demoapp"
  }
}
```

> Current truth: physical-device iOS recording is still partial and proof-gated. Raw event streams can be sparse; snapshot/context evidence remains the primary fallback signal.

End + export:

```json
{
  "name": "end_record_session",
  "arguments": {
    "recordSessionId": "<recordSessionId-from-start>",
    "autoExport": true,
    "runReplayDryRun": true
  }
}
```

Replay:

```json
{
  "name": "run_flow",
  "arguments": {
    "sessionId": "ios-record-demo-001",
    "platform": "ios",
    "deviceId": "<simulator-udid>",
    "flowPath": "flows/samples/native/ios-recording-minimal.yaml",
    "dryRun": true
  }
}
```

## Artifacts to inspect

- `artifacts/record-events/<recordSessionId>.jsonl`
- `artifacts/recorded-steps/<recordSessionId>.json`
- `flows/samples/generated/<recordSessionId>-<timestamp>.yaml`

## Known limits

- iOS target selection now supports simulator and discoverable physical devices.
- Simulator capture still provides the richest raw event stream (`simctl log stream`).
- Physical-device capture currently depends more on snapshot/context evidence and may emit sparse raw events.
- Snapshot capture depends on idb hierarchy availability.
- Low-confidence selector mapping may degrade to coordinate-based flow steps with warnings.
