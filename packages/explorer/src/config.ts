/**
 * Configuration module for the explorer CLI.
 *
 * Provides interview questions, config persistence, and adaptive page budgeting.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from "fs";
import { homedir, platform } from "os";
import { join } from "path";
import type { AuthConfig, DestructiveActionPolicy, ExplorerConfig, ExplorerPlatform, FailureStrategy, ExplorationMode, SamplingRule } from "./types.js";

// ---------------------------------------------------------------------------
// Default sampling rules for high-fanout collection pages (smoke mode).
// SPEC: explorer-high-fanout-list-sampling
// ---------------------------------------------------------------------------

export const DEFAULT_SAMPLING_RULES: SamplingRule[] = [
  {
    match: {
      pathPrefix: ["General", "Fonts", "System Fonts"],
    },
    mode: "smoke",
    strategy: "representative-child",
    maxChildrenToValidate: 1,
    stopAfterFirstSuccessfulNavigation: true,
    excludeActions: ["Download"],
  },
];

// ---------------------------------------------------------------------------
// Interview question definitions
// ---------------------------------------------------------------------------

interface Question {
  id: string;
  prompt: string;
  options: { label: string; value: unknown }[];
  defaultValue: unknown;
}

export const INTERVIEW_QUESTIONS: Question[] = [
  {
    id: "mode",
    prompt: "探索模式",
    options: [
      { label: "A) 主流程冒烟", value: "smoke" },
      { label: "B) 指定模块", value: "scoped" },
      { label: "C) 全量探索", value: "full" },
    ],
    defaultValue: "scoped",
  },
  {
    id: "auth",
    prompt: "登录态",
    options: [
      { label: "A) 已登录", value: { type: "already-logged-in" } },
      { label: "B) 测试账号", value: { type: "auto-login" } },
      { label: "C) 手动登录", value: { type: "handoff" } },
      { label: "D) 不需要", value: { type: "skip-auth" } },
    ],
    defaultValue: { type: "already-logged-in" },
  },
  {
    id: "failureStrategy",
    prompt: "失败策略",
    options: [
      { label: "A) 重试3次", value: "retry-3" },
      { label: "B) 跳过", value: "skip" },
      { label: "C) 等待处理", value: "handoff" },
    ],
    defaultValue: "retry-3",
  },
  {
    id: "maxDepth",
    prompt: "探索深度",
    options: [
      { label: "A) 浅层 (5)", value: 5 },
      { label: "B) 标准 (8)", value: 8 },
      { label: "C) 深层 (12)", value: 12 },
    ],
    defaultValue: 8,
  },
  {
    id: "compareWith",
    prompt: "历史对比",
    options: [
      { label: "A) 对比最近一次", value: "latest" },
      { label: "B) 选择历史版本", value: "select" },
      { label: "C) 不对比", value: null },
    ],
    defaultValue: null,
  },
  {
    id: "platform",
    prompt: "平台",
    options: [
      { label: "A) iOS 模拟器", value: "ios-simulator" },
      { label: "B) iOS 真机", value: "ios-device" },
      { label: "C) Android 模拟器", value: "android-emulator" },
      { label: "D) Android 真机", value: "android-device" },
    ],
    defaultValue: "ios-simulator",
  },
  {
    id: "destructiveActionPolicy",
    prompt: "破坏性操作策略",
    options: [
      { label: "A) 跳过 (默认)", value: "skip" },
      { label: "B) 允许", value: "allow" },
      { label: "C) 弹出确认", value: "confirm" },
    ],
    defaultValue: "skip",
  },
];

// ---------------------------------------------------------------------------
// Default config paths
// ---------------------------------------------------------------------------

const PROJECT_CONFIG = ".explorer-config.json";

function globalConfigDir(): string {
  const home = homedir();
  if (platform() === "win32") {
    return join(home, "AppData", "Local", "mobile-e2e-mcp");
  }
  return join(home, ".config", "mobile-e2e-mcp");
}

export function globalConfigPath(): string {
  return join(globalConfigDir(), "explorer.json");
}

export function projectConfigPath(): string {
  return PROJECT_CONFIG;
}

// ---------------------------------------------------------------------------
// Config persistence helpers
// ---------------------------------------------------------------------------

function defaultDepthForMode(mode: ExplorationMode): number {
  switch (mode) {
    case "smoke":
      return 5;
    case "scoped":
      return 8;
    case "full":
      return Infinity;
  }
}

export function buildDefaultConfig(overrides: Partial<ExplorerConfig> = {}): ExplorerConfig {
  const mode = (overrides.mode ?? "scoped") as ExplorationMode;
  const auth = (overrides.auth ?? { type: "already-logged-in" }) as AuthConfig;
  const plat = (overrides.platform ?? "ios-simulator") as ExplorerPlatform;
  const failureStrategy = (overrides.failureStrategy ?? "retry-3") as FailureStrategy;
  const destructiveActionPolicy = (overrides.destructiveActionPolicy ?? "skip") as DestructiveActionPolicy;
  const maxDepth = overrides.maxDepth ?? defaultDepthForMode(mode);
  const compareWith = overrides.compareWith ?? null;
  const appId = overrides.appId ?? "";
  const maxPages = overrides.maxPages ?? 200;
  const timeoutMs = overrides.timeoutMs ?? 300_000;
  const reportDir = overrides.reportDir ?? "./explorer-reports";
  const samplingRules = overrides.samplingRules ?? DEFAULT_SAMPLING_RULES;

  return {
    mode,
    auth,
    failureStrategy,
    maxDepth,
    maxPages,
    timeoutMs,
    compareWith,
    platform: plat,
    destructiveActionPolicy,
    appId,
    reportDir,
    samplingRules,
  };
}

/**
 * Load config from the given path, or from the default project-local location.
 * Returns null if the file does not exist or is invalid.
 */
export function loadConfig(path?: string): ExplorerConfig | null {
  const target = path ?? projectConfigPath();
  if (!existsSync(target)) return null;
  try {
    const raw = readFileSync(target, "utf-8");
    return JSON.parse(raw) as ExplorerConfig;
  } catch {
    return null;
  }
}

/**
 * Persist config to the given path, or to the default project-local location.
 */
export function saveConfig(config: ExplorerConfig, path?: string): void {
  const target = path ?? projectConfigPath();
  writeFileSync(target, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Check if a project-local config exists and is recent (modified within 24 hours).
 */
export function shouldReuseConfig(path?: string): boolean {
  const target = path ?? projectConfigPath();
  if (!existsSync(target)) return false;
  try {
    const stat = statSync(target);
    const ageMs = Date.now() - stat.mtimeMs;
    return ageMs < 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Adaptive max-pages calculation
// ---------------------------------------------------------------------------

/**
 * EMA-based rolling average for dynamic page budget.
 */
export class AdaptiveMaxPages {
  private rollingAvg: number;
  private alpha: number;

  constructor(initialEstimateMs = 9000, alpha = 0.3) {
    this.rollingAvg = initialEstimateMs;
    this.alpha = alpha;
  }

  update(observedMs: number): void {
    this.rollingAvg = (1 - this.alpha) * this.rollingAvg + this.alpha * observedMs;
  }

  getMaxPages(timeoutMs: number): number {
    const raw = Math.floor((timeoutMs * 0.8) / this.rollingAvg);
    return Math.min(500, Math.max(50, raw));
  }

  get rollingAvgMs(): number {
    return this.rollingAvg;
  }
}
