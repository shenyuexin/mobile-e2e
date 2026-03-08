import type { ReasonCode } from "./reason-codes.js";

export type Platform = "android" | "ios";
export type ToolStatus = "success" | "failed" | "partial";
export type RunnerProfile = "phase1" | "native_android" | "native_ios" | "flutter_android";

export interface SessionTimelineEvent { timestamp: string; type: string; detail?: string; }
export interface Session { sessionId: string; platform: Platform; deviceId: string; appId: string; policyProfile: string; startedAt: string; artifactsRoot: string; timeline: SessionTimelineEvent[]; profile?: RunnerProfile | null; phase?: string | null; sampleName?: string | null; }
export interface ToolResult<TData = unknown> { status: ToolStatus; reasonCode: ReasonCode; sessionId: string; durationMs: number; attempts: number; artifacts: string[]; data: TData; nextSuggestions: string[]; }
export interface DeviceInfo { id: string; name?: string; platform: Platform; state: string; available: boolean; }
export interface DoctorCheck { name: string; status: "pass" | "warn" | "fail"; detail: string; }
export interface DoctorInput { includeUnavailable?: boolean; }
export interface InspectUiNode {
  index?: number;
  text?: string;
  resourceId?: string;
  className?: string;
  packageName?: string;
  contentDesc?: string;
  clickable: boolean;
  enabled: boolean;
  scrollable: boolean;
  bounds?: string;
}
export interface UiPoint {
  x: number;
  y: number;
}
export interface UiBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  center: UiPoint;
}
export interface InspectUiSummary {
  totalNodes: number;
  clickableNodes: number;
  scrollableNodes: number;
  nodesWithText: number;
  nodesWithContentDesc: number;
  sampleNodes: InspectUiNode[];
}
export type InspectUiMatchField = "resourceId" | "contentDesc" | "text" | "className" | "clickable";
export interface InspectUiQuery {
  resourceId?: string;
  contentDesc?: string;
  text?: string;
  className?: string;
  clickable?: boolean;
  limit?: number;
}
export interface InspectUiMatch {
  node: InspectUiNode;
  matchedBy: InspectUiMatchField[];
  score?: number;
}
export interface InspectUiQueryResult {
  query: InspectUiQuery;
  totalMatches: number;
  matches: InspectUiMatch[];
}
export type QueryUiMatchField = InspectUiMatchField;
export interface QueryUiSelector extends InspectUiQuery {}
export interface QueryUiMatch extends InspectUiMatch {}
export interface QueryUiData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  outputPath: string;
  query: InspectUiQuery;
  command: string[];
  exitCode: number | null;
  result: InspectUiQueryResult;
  supportLevel: "full" | "partial";
  content?: string;
  summary?: InspectUiSummary;
}
export interface InspectUiInput { sessionId: string; platform: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; deviceId?: string; outputPath?: string; dryRun?: boolean; }
export interface InspectUiQueryInput extends InspectUiInput, InspectUiQuery {}
export interface QueryUiInput extends InspectUiQueryInput {}
export interface InstallAppInput { sessionId: string; platform: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; artifactPath?: string; deviceId?: string; dryRun?: boolean; }
export interface LaunchAppInput { sessionId: string; platform: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; deviceId?: string; appId?: string; launchUrl?: string; dryRun?: boolean; }
export interface ListDevicesInput { includeUnavailable?: boolean; }
export interface ScreenshotInput { sessionId: string; platform: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; deviceId?: string; outputPath?: string; dryRun?: boolean; }
export interface TapInput { sessionId: string; platform: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; deviceId?: string; x: number; y: number; dryRun?: boolean; }
export interface TerminateAppInput { sessionId: string; platform: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; deviceId?: string; appId?: string; dryRun?: boolean; }
export interface TypeTextInput { sessionId: string; platform: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; deviceId?: string; text: string; dryRun?: boolean; }
export interface TapElementInput extends InspectUiQuery {
  sessionId: string;
  platform: Platform;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  deviceId?: string;
  outputPath?: string;
  dryRun?: boolean;
}
export interface TapElementData {
  dryRun: boolean;
  runnerProfile: RunnerProfile;
  query: InspectUiQuery;
  matchCount?: number;
  matchedNode?: InspectUiNode;
  resolvedBounds?: UiBounds;
  resolvedX?: number;
  resolvedY?: number;
  command: string[];
  exitCode: number | null;
  supportLevel: "full" | "partial";
}
export interface RunFlowInput { sessionId: string; platform: Platform; runnerProfile?: RunnerProfile; flowPath?: string; harnessConfigPath?: string; runnerScript?: string; runCount?: number; dryRun?: boolean; artifactRoot?: string; deviceId?: string; appId?: string; launchUrl?: string; env?: Record<string, string>; }
export interface StartSessionInput { platform: Platform; sessionId?: string; deviceId?: string; appId?: string; policyProfile?: string; phase?: string | null; profile?: RunnerProfile | null; sampleName?: string | null; artifactsRoot?: string; harnessConfigPath?: string; }
export interface EndSessionInput { sessionId: string; artifacts?: string[]; }
