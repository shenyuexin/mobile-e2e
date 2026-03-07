export const REASON_CODES = {
  ok: "OK",
  adapterError: "ADAPTER_ERROR",
  configurationError: "CONFIGURATION_ERROR",
  deviceUnavailable: "DEVICE_UNAVAILABLE",
  flowFailed: "FLOW_FAILED",
  policyDenied: "POLICY_DENIED",
  unsupportedOperation: "UNSUPPORTED_OPERATION",
} as const;

export type ReasonCode = (typeof REASON_CODES)[keyof typeof REASON_CODES];
