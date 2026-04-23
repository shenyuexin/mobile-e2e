import type { ExecutionEvidence, InterruptionType, Platform, RunnerProfile, StateSummary } from "./types.js";

export type PageContextType =
  | "normal_page"
  | "app_dialog"
  | "system_alert_surface"
  | "action_sheet_surface"
  | "app_modal"
  | "system_overlay"
  | "permission_surface"
  | "keyboard_surface"
  | "unknown";

export type PageContextDetectionSource = "deterministic" | "heuristic" | "ocr" | "cv" | "unknown";

export type PageContextRuntimeFlavor = "android_default" | "ios_simulator" | "ios_real_device" | "unknown";

export interface PageContextAppIdentity {
  appId?: string;
  source: "session" | "input_override" | "unknown";
}

export interface PageContext {
  type: PageContextType;
  platform: Platform;
  detectionSource: PageContextDetectionSource;
  runtimeFlavor?: PageContextRuntimeFlavor;
  confidence: number;
  title?: string;
  ownerPackage?: string;
  ownerBundle?: string;
  containerRole?: string;
  visibleSignals?: string[];
  appIdentity?: PageContextAppIdentity;
}

export interface PageContextDecision {
  blocked: boolean;
  requiresInterruptionHandling?: boolean;
  requiredScope?: string;
  currentProfile?: string;
  rationale?: string[];
}

export interface PageContextInterruptionMapping {
  mappedType: InterruptionType;
  mappingSource: "page-context-mapper";
  rationale?: string[];
}

export interface PageContextPreflightProbe {
  available: boolean;
  version?: string;
  error?: string;
  source: "ios_wda_status";
}

export interface GetPageContextInput {
  sessionId: string;
  platform?: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  /** Canonical app identity field for session-bound resolution in this repo. */
  appId?: string;
  dryRun?: boolean;
}

export interface GetPageContextData {
  sessionRecordFound: boolean;
  pageContext?: PageContext;
  pageContextDecision?: PageContextDecision;
  interruptionMapping?: PageContextInterruptionMapping;
  preflightProbe?: PageContextPreflightProbe;
  stateSummary?: StateSummary;
  evidence?: ExecutionEvidence[];
}
