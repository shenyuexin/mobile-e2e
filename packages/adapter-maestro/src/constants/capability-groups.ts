/**
 * Capability group name constants for the capability model.
 *
 * These snake_case strings identify functional capability groups
 * in the CapabilityProfile returned by describe_capabilities.
 */
export const CAPABILITY_GROUPS = {
  sessionManagement: "session_management",
  recordingAndReplay: "recording_and_replay",
  appLifecycle: "app_lifecycle",
  artifactsAndDiagnostics: "artifacts_and_diagnostics",
  uiInspection: "ui_inspection",
  uiActions: "ui_actions",
} as const;
