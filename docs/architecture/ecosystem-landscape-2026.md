# Ecosystem Landscape (2026)

## 1. Purpose

Map relevant projects/tools and identify reusable patterns vs strategic gaps.

## 2. Representative Implementations

- mobile-next/mobile-mcp
- getsentry/XcodeBuildMCP
- appium/appium-mcp
- Arenukvern/mcp_flutter
- twodoorsdev/react-native-debugger-mcp
- minhalvp/android-mcp-server

Note: Capabilities and maturity should be periodically re-validated before adoption decisions.

## 3. Pattern Extraction

### Common Patterns

1. Adapter wrappers around mature tooling (ADB, XCUITest/WDA, Appium).
2. Accessibility tree as first-class interaction model.
3. Supplemental screenshot-based diagnostics.
4. Session/state handling for long-running interactions.

### Missing in Many Implementations

1. Cross-adapter orchestration and policy routing.
2. Evidence-rich failure packet standardization.
3. Fine-grained governance and action controls.
4. Deterministic fallback ladder telemetry and confidence tracking.

## 4. Strategic Gap (Opportunity)

Build the **orchestration and governance layer** rather than another raw driver wrapper:

- Unified semantics for AI agents.
- Multi-backend execution policy.
- Reliability instrumentation and self-healing suggestions.
