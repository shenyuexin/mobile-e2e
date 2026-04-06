# iOS Owned Runner (Repository-owned scaffold)

This directory contains the repository-owned iOS XCTest runner scaffold used for physical-device action execution.

## Purpose

- Keep iOS physical runner startup/control under `mobile-e2e-mcp` ownership.
- Reduce dependence on external runner apps as the primary lane.
- Make startup failures (`preflight`, `code74`, `dtxproxy`) observable and attributable.

## Structure

- `project.yml` — XcodeGen spec for generating local Xcode project files.
- `OwnedRunnerApp/` — minimal host app.
- `OwnedRunnerUITests/` — XCTest target (tap/type flow execution entrypoint scaffold).

## Build notes

1. Generate project (XcodeGen):
   - `xcodegen generate --spec packages/adapter-maestro/runner/project.yml`
2. Build-for-testing to produce `.xctestrun` artifacts.
3. Run through script:
   - `scripts/dev/run-ios-owned-physical-runner.sh execute-flow`

Current scaffold is intentionally minimal; runtime flow parsing and command dispatch will be implemented in follow-up slices.

## Runtime action protocol (MVP)

The adapter injects these environment variables when invoking the owned runner:

- `IOS_OWNED_RUNNER_FLOW_PATH` (original generated flow artifact path)
- `IOS_OWNED_RUNNER_ACTION_TYPE` (`tap` or `type_text`)
- `IOS_OWNED_RUNNER_TARGET_BUNDLE_ID` (optional target AUT bundle id)
- `IOS_OWNED_RUNNER_ACTION_X` / `IOS_OWNED_RUNNER_ACTION_Y` (for `tap`)
- `IOS_OWNED_RUNNER_ACTION_TEXT` (for `type_text`)

Current UITest scaffold consumes the protocol and executes deterministic in-app actions to prove end-to-end command wiring.
For `tap`, when `IOS_OWNED_RUNNER_TARGET_BUNDLE_ID` is provided, the UITest lane attempts coordinate tap on the target app.
For `type_text`, when `IOS_OWNED_RUNNER_TARGET_BUNDLE_ID` is provided, the UITest lane tries first editable field/text-view in target app and types the payload.
