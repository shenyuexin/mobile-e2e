export const REASON_CODES = {
  actionFocusFailed: "ACTION_FOCUS_FAILED",
  actionScrollFailed: "ACTION_SCROLL_FAILED",
  actionTapFailed: "ACTION_TAP_FAILED",
  actionTypeFailed: "ACTION_TYPE_FAILED",
  ok: "OK",
  adapterError: "ADAPTER_ERROR",
  ambiguousMatch: "AMBIGUOUS_MATCH",
  configurationError: "CONFIGURATION_ERROR",
  deviceUnavailable: "DEVICE_UNAVAILABLE",
  flowFailed: "FLOW_FAILED",
  missingBounds: "MISSING_BOUNDS",
  noMatch: "NO_MATCH",
  policyDenied: "POLICY_DENIED",
  timeout: "TIMEOUT",
  unsupportedOperation: "UNSUPPORTED_OPERATION",
} as const;

export type ReasonCode = (typeof REASON_CODES)[keyof typeof REASON_CODES];
