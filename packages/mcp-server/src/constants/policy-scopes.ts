/**
 * Policy scope constants for MCP tool descriptors.
 *
 * These values define the permission boundary each tool operates within.
 * Replaces the inline union type in index.ts.
 */
export const POLICY_SCOPES = {
  none: "none",
  read: "read",
  write: "write",
  diagnostics: "diagnostics",
  interrupt: "interrupt",
  interruptHighRisk: "interrupt-high-risk",
} as const;

/** The tool policy requirement union — derived from constants. */
export type ToolPolicyRequirement = typeof POLICY_SCOPES[keyof typeof POLICY_SCOPES];
