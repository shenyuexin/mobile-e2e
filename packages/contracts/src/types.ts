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
export interface InspectUiInput { sessionId: string; platform: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; deviceId?: string; outputPath?: string; dryRun?: boolean; }
export interface InstallAppInput { sessionId: string; platform: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; artifactPath?: string; deviceId?: string; dryRun?: boolean; }
export interface LaunchAppInput { sessionId: string; platform: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; deviceId?: string; appId?: string; launchUrl?: string; dryRun?: boolean; }
export interface ListDevicesInput { includeUnavailable?: boolean; }
export interface ScreenshotInput { sessionId: string; platform: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; deviceId?: string; outputPath?: string; dryRun?: boolean; }
export interface TapInput { sessionId: string; platform: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; deviceId?: string; x: number; y: number; dryRun?: boolean; }
export interface TerminateAppInput { sessionId: string; platform: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; deviceId?: string; appId?: string; dryRun?: boolean; }
export interface TypeTextInput { sessionId: string; platform: Platform; runnerProfile?: RunnerProfile; harnessConfigPath?: string; deviceId?: string; text: string; dryRun?: boolean; }
export interface RunFlowInput { sessionId: string; platform: Platform; runnerProfile?: RunnerProfile; flowPath?: string; harnessConfigPath?: string; runnerScript?: string; runCount?: number; dryRun?: boolean; artifactRoot?: string; deviceId?: string; appId?: string; launchUrl?: string; env?: Record<string, string>; }
export interface StartSessionInput { platform: Platform; sessionId?: string; deviceId?: string; appId?: string; policyProfile?: string; phase?: string | null; profile?: RunnerProfile | null; sampleName?: string | null; artifactsRoot?: string; harnessConfigPath?: string; }
export interface EndSessionInput { sessionId: string; artifacts?: string[]; }
