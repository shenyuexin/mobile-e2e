# Contracts

This package defines the shared TypeScript execution boundary for `mobile-e2e-mcp`.

Current scope:

- `Session`
- `ToolResult`
- `ReasonCode`
- `RunFlowInput`
- JSON schemas for session and tool-result payloads

These types are now shared by `packages/mcp-server`, `packages/adapter-maestro`, and future reporting/policy code.
