import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import type { SessionTimelineEvent } from "@mobile-e2e-mcp/contracts";
import type { InterruptionPolicyRuleV2 } from "@mobile-e2e-mcp/contracts";
import type { PersistedSessionRecord } from "./session-store.js";

export interface ArtifactRetentionProfile {
  screenshots?: string;
  "debug-output"?: string;
  reports?: string;
}

export interface ArtifactGovernanceConfig {
  retention: Record<string, ArtifactRetentionProfile>;
  redaction: {
    enabled: boolean;
    targets: string[];
  };
}

export interface SessionAuditSchemaConfig {
  session_audit: {
    required_fields: string[];
  };
}

export interface SessionAuditArtifactEntry {
  path: string;
  category: "screenshots" | "debug-output" | "reports" | "other";
  retention?: string;
}

export interface SessionAuditRecord {
  session_id: string;
  phase: string;
  platform: string;
  flow_name: string;
  result: string;
  started_at: string;
  completed_at: string;
  artifact_paths: SessionAuditArtifactEntry[];
  interruption_events: string[];
  policy_profile: string;
  retention_profile: string;
  scheduler_metrics?: {
    queue_wait_ms: {
      p50: number;
      p95: number;
      max: number;
    };
    lease_conflicts: number;
    stale_recoveries: number;
  };
  schema_required_fields: string[];
  generated_at: string;
}

const DEFAULT_ARTIFACT_RETENTION_PATH = "configs/policies/artifact-retention.yaml";
const DEFAULT_SESSION_AUDIT_SCHEMA_PATH = "configs/policies/session-audit-schema.yaml";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function parseRetentionProfile(value: unknown): ArtifactRetentionProfile {
  if (!isRecord(value)) {
    return {};
  }
  return {
    screenshots: typeof value.screenshots === "string" ? value.screenshots : undefined,
    "debug-output": typeof value["debug-output"] === "string" ? value["debug-output"] : undefined,
    reports: typeof value.reports === "string" ? value.reports : undefined,
  };
}

export async function loadArtifactGovernanceConfig(
  repoRoot: string,
  policyPath = DEFAULT_ARTIFACT_RETENTION_PATH,
): Promise<ArtifactGovernanceConfig> {
  const absolutePath = path.resolve(repoRoot, policyPath);
  const content = await readFile(absolutePath, "utf8");
  const parsed: unknown = parse(content);
  if (!isRecord(parsed) || !isRecord(parsed.retention)) {
    throw new Error(`Invalid artifact governance config: ${policyPath}`);
  }

  const retention = Object.fromEntries(
    Object.entries(parsed.retention).map(([profileName, profileValue]) => [profileName, parseRetentionProfile(profileValue)]),
  );

  return {
    retention,
    redaction: {
      enabled: isRecord(parsed.redaction) && parsed.redaction.enabled === true,
      targets: isRecord(parsed.redaction) ? readStringArray(parsed.redaction.targets) : [],
    },
  };
}

export async function loadSessionAuditSchemaConfig(
  repoRoot: string,
  schemaPath = DEFAULT_SESSION_AUDIT_SCHEMA_PATH,
): Promise<SessionAuditSchemaConfig> {
  const absolutePath = path.resolve(repoRoot, schemaPath);
  const content = await readFile(absolutePath, "utf8");
  const parsed: unknown = parse(content);
  if (!isRecord(parsed) || !isRecord(parsed.session_audit)) {
    throw new Error(`Invalid session audit schema config: ${schemaPath}`);
  }

  return {
    session_audit: {
      required_fields: readStringArray(parsed.session_audit.required_fields),
    },
  };
}

export function resolveRetentionProfileName(): string {
  return process.env.CI ? "ci" : "local-dev";
}

function classifyArtifactCategory(artifactPath: string): SessionAuditArtifactEntry["category"] {
  const normalized = artifactPath.toLowerCase();
  if (normalized.includes("screenshot") || normalized.endsWith(".png") || normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
    return "screenshots";
  }
  if (
    normalized.includes("report")
    || normalized.endsWith(".html")
    || normalized.endsWith(".md")
  ) {
    return "reports";
  }
  if (
    normalized.includes("debug")
    || normalized.includes("log")
    || normalized.includes("crash")
    || normalized.includes("ui-dump")
    || normalized.includes("diagnostic")
    || normalized.endsWith(".json")
    || normalized.endsWith(".txt")
  ) {
    return "debug-output";
  }
  return "other";
}

export function redactSensitiveText(value: string, config: ArtifactGovernanceConfig): string {
  if (!config.redaction.enabled) {
    return value;
  }

  let next = value;
  if (config.redaction.targets.includes("token")) {
    next = next.replace(/token[^/\\\s]*/gi, "[REDACTED_TOKEN]");
  }
  if (config.redaction.targets.includes("password")) {
    next = next.replace(/password[^/\\\s]*/gi, "[REDACTED_PASSWORD]");
  }
  if (config.redaction.targets.includes("phone-number")) {
    next = next.replace(/\+?\d[\d\s-]{6,}\d/g, "[REDACTED_PHONE]");
  }
  return next;
}

export function buildAuditedArtifactEntries(paths: string[], config: ArtifactGovernanceConfig): SessionAuditArtifactEntry[] {
  const retentionProfile = config.retention[resolveRetentionProfileName()] ?? {};
  return Array.from(new Set(paths)).map((artifactPath) => {
    const category = classifyArtifactCategory(artifactPath);
    const retention = category === "other"
      ? undefined
      : retentionProfile[category === "debug-output" ? "debug-output" : category];
    return {
      path: redactSensitiveText(artifactPath, config),
      category,
      retention,
    };
  });
}

function eventLooksLikeInterruption(event: SessionTimelineEvent): boolean {
  if (event.type.toLowerCase().includes("interrupt")) {
    return true;
  }
  const blockingSignals = event.stateSummary?.blockingSignals ?? [];
  return blockingSignals.some((signal) => ["permission_prompt", "dialog_actions", "interrupted"].includes(signal));
}

export function collectInterruptionEvents(timeline: SessionTimelineEvent[], config: ArtifactGovernanceConfig): string[] {
  return timeline
    .filter((event) => eventLooksLikeInterruption(event))
    .map((event) => redactSensitiveText(event.detail ?? event.summary ?? event.type, config));
}

export function isHighRiskInterruptionRule(rule: InterruptionPolicyRuleV2): boolean {
  return rule.action.slot === "destructive";
}

export function isHighRiskInterruptionActionAllowed(
  rule: InterruptionPolicyRuleV2,
  policy: { allow: string[]; deny: string[] },
): { allowed: boolean; reason?: string } {
  if (!isHighRiskInterruptionRule(rule)) {
    return { allowed: true };
  }
  if (policy.deny.includes("interrupt-high-risk")) {
    return { allowed: false, reason: "High-risk interruption action is denied by policy profile." };
  }
  if (!policy.allow.includes("interrupt-high-risk")) {
    return { allowed: false, reason: "High-risk interruption action requires explicit interrupt-high-risk policy scope." };
  }
  return { allowed: true };
}

function parseQueueWaitMs(timeline: SessionTimelineEvent[]): number[] {
  const values: number[] = [];
  for (const event of timeline) {
    if (event.type !== "queue_wait_ended") {
      continue;
    }
    const detail = event.detail ?? "";
    const match = detail.match(/(\d+)ms/);
    if (!match) {
      continue;
    }
    const value = Number.parseInt(match[1] ?? "", 10);
    if (!Number.isNaN(value)) {
      values.push(value);
    }
  }
  return values;
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1));
  return sortedValues[index] ?? 0;
}

function buildSchedulerMetrics(timeline: SessionTimelineEvent[]): SessionAuditRecord["scheduler_metrics"] {
  const queueWait = parseQueueWaitMs(timeline).sort((a, b) => a - b);
  return {
    queue_wait_ms: {
      p50: percentile(queueWait, 50),
      p95: percentile(queueWait, 95),
      max: queueWait[queueWait.length - 1] ?? 0,
    },
    lease_conflicts: timeline.filter((event) => event.type === "session_start_rejected" && (event.detail ?? "").includes("already leased")).length,
    stale_recoveries: timeline.filter((event) => event.type === "lease_recovered_stale").length,
  };
}

export function buildSessionAuditRecord(
  sessionRecord: PersistedSessionRecord,
  governanceConfig: ArtifactGovernanceConfig,
  schemaConfig: SessionAuditSchemaConfig,
): SessionAuditRecord {
  return {
    session_id: sessionRecord.session.sessionId,
    phase: sessionRecord.session.phase ?? "unknown",
    platform: sessionRecord.session.platform,
    flow_name: sessionRecord.session.sampleName ?? sessionRecord.session.profile ?? "unknown",
    result: sessionRecord.closed ? "completed" : "in_progress",
    started_at: sessionRecord.session.startedAt,
    completed_at: sessionRecord.endedAt ?? sessionRecord.updatedAt,
    artifact_paths: buildAuditedArtifactEntries(sessionRecord.artifacts, governanceConfig),
    interruption_events: collectInterruptionEvents(sessionRecord.session.timeline, governanceConfig),
    policy_profile: sessionRecord.session.policyProfile,
    retention_profile: resolveRetentionProfileName(),
    scheduler_metrics: buildSchedulerMetrics(sessionRecord.session.timeline),
    schema_required_fields: schemaConfig.session_audit.required_fields,
    generated_at: new Date().toISOString(),
  };
}
