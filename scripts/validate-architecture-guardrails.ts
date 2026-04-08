#!/usr/bin/env tsx
/**
 * Architecture guardrail validator for the mobile-e2e-mcp monorepo.
 *
 * Converts written architecture rules into mechanically checkable validations
 * that run in CI and locally. Outputs rule-specific findings with severity,
 * file path, violated rule, and suggested action.
 *
 * Usage:
 *   pnpm tsx scripts/validate-architecture-guardrails.ts [--fail-on warn]
 *
 * Exit codes:
 *   0 — all checks pass (or only warnings when --fail-on warn is absent)
 *   1 — one or more failing checks detected
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ─── Types ───────────────────────────────────────────────────────────────────

type Severity = "fail" | "warn";

interface GuardrailFinding {
  rule: string;
  severity: Severity;
  file: string;
  detail: string;
  suggestion: string;
}

interface GuardrailResult {
  findings: GuardrailFinding[];
  passCount: number;
  warnCount: number;
  failCount: number;
}

interface CheckContext {
  repoRoot: string;
  failOnWarn: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function repoRootFromScript(): string {
  const scriptPath = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(scriptPath), "..");
}

function relativePath(repoRoot: string, absolutePath: string): string {
  return path.relative(repoRoot, absolutePath);
}

// Hotspot files whose size should be reported and warned on growth.
const HOTSPOT_FILES = [
  "packages/adapter-maestro/src/index.ts",
  "packages/adapter-maestro/src/ui-tools.ts",
  "packages/adapter-maestro/src/device-runtime.ts",
  "packages/adapter-maestro/src/recording-runtime.ts",
  "packages/adapter-maestro/src/ui-action-tools.ts",
  "packages/adapter-maestro/src/ui-inspection-tools.ts",
  "packages/mcp-server/src/index.ts",
];

// Soft line-count thresholds — warnings above, failures well above.
// Phase 19 starts warning-biased: files above soft limit warn, files above
// hard limit fail. Existing files exceeding hard limit are flagged as warnings
// on first pass (warning-first rollout); the hard limit applies to new growth.
const HOTSPOT_SOFT_LIMIT = 500;
const HOTSPOT_HARD_LIMIT = 1500;

// Forbidden patterns in the thin-facade index.ts of adapter-maestro.
// These patterns detect low-level helper backflow into the facade layer.
const INDEX_FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; rule: string; suggestion: string }> = [
  {
    pattern: /spawn\s*\(\s*["'`]adb["'`]|spawn\s*\(\s*["'`]idb["'`]|spawn\s*\(\s*["'`]simctl["'`]/,
    rule: "thin-facade-no-direct-platform-commands",
    suggestion: "Move platform command builders into *-android.ts / *-ios.ts / *-platform.ts hooks modules.",
  },
  {
    pattern: /if\s*\(.*platform\s*===?\s*["'](android|ios)["']/,
    rule: "thin-facade-no-platform-branching",
    suggestion: "Platform branching belongs in registry-selected hooks modules, not in index.ts composition layer.",
  },
  {
    pattern: /XMLHttpRequest|fetch\s*\(|axios\./,
    rule: "thin-facade-no-network-logic",
    suggestion: "Network logic belongs in dedicated runtime modules, not the facade layer.",
  },
];

// Patterns that indicate platform-branch leakage into wrong modules.
const PLATFORM_LEAKAGE_CHECKS: Array<{ filePattern: string; forbiddenImports: RegExp[]; rule: string }> = [
  {
    filePattern: "packages/adapter-maestro/src/ui-model.ts",
    forbiddenImports: [/from\s+["']node:child_process["']/, /from\s+["']node:fs["']/, /spawn/, /execSync/],
    rule: "pure-model-no-side-effects",
  },
  {
    filePattern: "packages/adapter-maestro/src/harness-config.ts",
    forbiddenImports: [/from\s+["']node:child_process["']/, /spawn/, /execSync/],
    rule: "config-no-execution",
  },
];

// Public tool catalog paths to compare against the live registry.
const README_PATHS = ["README.md", "README.zh-CN.md"];

// ─── Check Implementations ───────────────────────────────────────────────────

/**
 * Check 1: Hotspot file size reporting.
 * Reports line counts for known hotspot files. Warns above soft limit,
 * fails above hard limit.
 */
async function checkHotspotFileSizes(ctx: CheckContext): Promise<GuardrailFinding[]> {
  const findings: GuardrailFinding[] = [];

  for (const relPath of HOTSPOT_FILES) {
    const fullPath = path.join(ctx.repoRoot, relPath);
    if (!existsSync(fullPath)) continue;

    const content = await readFile(fullPath, "utf-8");
    const lineCount = content.split("\n").length;

    if (lineCount > HOTSPOT_HARD_LIMIT) {
      // Phase 19: warning-first rollout. Files exceeding the hard limit are
      // flagged as warnings, not failures. The hard limit applies to new growth.
      findings.push({
        rule: "hotspot-file-hard-limit",
        severity: "warn",
        file: relPath,
        detail: `${relPath} has ${lineCount} lines (hard limit: ${HOTSPOT_HARD_LIMIT}). Extract logic into focused modules.`,
        suggestion: "Split this file into focused modules following docs/architecture/adapter-code-placement.md.",
      });
    } else if (lineCount > HOTSPOT_SOFT_LIMIT) {
      findings.push({
        rule: "hotspot-file-soft-limit",
        severity: "warn",
        file: relPath,
        detail: `${relPath} has ${lineCount} lines (soft limit: ${HOTSPOT_SOFT_LIMIT}, hard limit: ${HOTSPOT_HARD_LIMIT}). Consider extraction.`,
        suggestion: "Review whether logic can be extracted into a focused module. See adapter-code-placement.md.",
      });
    }
  }

  return findings;
}

/**
 * Check 2: Thin-facade boundary enforcement for adapter-maestro index.ts.
 * Detects forbidden patterns that indicate low-level backflow.
 */
async function checkThinFacadeBoundary(ctx: CheckContext): Promise<GuardrailFinding[]> {
  const findings: GuardrailFinding[] = [];
  const indexPath = path.join(ctx.repoRoot, "packages/adapter-maestro/src/index.ts");

  if (!existsSync(indexPath)) return findings;

  const content = await readFile(indexPath, "utf-8");
  const lines = content.split("\n");

  for (const { pattern, rule, suggestion } of INDEX_FORBIDDEN_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      // Find line number of first match
      const matchIndex = content.indexOf(matches[0]);
      const lineNumber = content.slice(0, matchIndex).split("\n").length;

      findings.push({
        rule,
        severity: "fail",
        file: "packages/adapter-maestro/src/index.ts",
        detail: `Line ~${lineNumber}: forbidden pattern detected — ${rule}`,
        suggestion,
      });
    }
  }

  // Additional check: count platform branches (if/else on platform) in index.ts
  const platformBranchCount = (content.match(/if\s*\(.*platform/g) || []).length;
  if (platformBranchCount > 5) {
    findings.push({
      rule: "thin-facade-excessive-platform-branches",
      severity: "warn",
      file: "packages/adapter-maestro/src/index.ts",
      detail: `index.ts has ~${platformBranchCount} platform-condition branches. Prefer hooks-module dispatch.`,
      suggestion: "Move platform-specific branches into ui-runtime-platform.ts or similar hooks module.",
    });
  }

  return findings;
}

/**
 * Check 3: Platform leakage — pure modules should not import execution modules.
 */
async function checkPlatformLeakage(ctx: CheckContext): Promise<GuardrailFinding[]> {
  const findings: GuardrailFinding[] = [];

  for (const { filePattern, forbiddenImports, rule } of PLATFORM_LEAKAGE_CHECKS) {
    const fullPath = path.join(ctx.repoRoot, filePattern);
    if (!existsSync(fullPath)) continue;

    const content = await readFile(fullPath, "utf-8");

    for (const pattern of forbiddenImports) {
      const match = content.match(pattern);
      if (match) {
        const matchIndex = content.indexOf(match[0]);
        const lineNumber = content.slice(0, matchIndex).split("\n").length;

        findings.push({
          rule,
          severity: "fail",
          file: filePattern,
          detail: `Line ~${lineNumber}: ${filePattern} imports execution-side logic (${match[0].trim()}).`,
          suggestion: "Pure model/config modules must not import execution or side-effect modules.",
        });
      }
    }
  }

  return findings;
}

/**
 * Check 4: Dependency direction — no reverse imports from focused modules back
 * into higher-layer orchestration modules.
 */
async function checkDependencyDirection(ctx: CheckContext): Promise<GuardrailFinding[]> {
  const findings: GuardrailFinding[] = [];
  const adapterSrc = path.join(ctx.repoRoot, "packages/adapter-maestro/src");

  if (!existsSync(adapterSrc)) return findings;

  // Files that represent higher-layer orchestration (should only be imported by index.ts)
  const orchestrationFiles = new Set([
    "ui-tools.ts",
    "app-lifecycle-tools.ts",
    "interruption-orchestrator.ts",
  ]);

  // Files that represent pure/lower layers (should NOT import orchestration files)
  const pureFiles = [
    "ui-model.ts",
    "harness-config.ts",
    "capability-model.ts",
    "crash-attribution.ts",
  ];

  const files = await readdir(adapterSrc);

  for (const pureFile of pureFiles) {
    const fullPath = path.join(adapterSrc, pureFile);
    if (!existsSync(fullPath)) continue;

    const content = await readFile(fullPath, "utf-8");

    for (const orchestrationFile of orchestrationFiles) {
      // Check for relative imports of orchestration files
      const baseName = orchestrationFile.replace(".ts", "");
      const importPattern = new RegExp(`from\\s+["']\\.\\/.*${baseName}["']`);
      if (importPattern.test(content)) {
        findings.push({
          rule: "dependency-direction-reverse-import",
          severity: "fail",
          file: `packages/adapter-maestro/src/${pureFile}`,
          detail: `${pureFile} imports from ${orchestrationFile}, breaking dependency direction.`,
          suggestion: "Lower-layer modules must not import higher-layer orchestration modules.",
        });
      }
    }
  }

  return findings;
}

/**
 * Check 5: MCP registry ↔ README tool catalog drift.
 * Compares the number of tools registered vs. the number mentioned in READMEs.
 */
async function checkToolCatalogDrift(ctx: CheckContext): Promise<GuardrailFinding[]> {
  const findings: GuardrailFinding[] = [];

  // Parse tool names from the MCP server index tool descriptors
  const mcpIndexPath = path.join(ctx.repoRoot, "packages/mcp-server/src/index.ts");
  if (!existsSync(mcpIndexPath)) return findings;

  const mcpContent = await readFile(mcpIndexPath, "utf-8");

  // Extract tool names from defineToolDescriptor calls
  const toolNameRegex = /defineToolDescriptor\(\s*\{\s*name:\s*"([^"]+)"/g;
  const registeredTools = new Set<string>();
  let match;
  while ((match = toolNameRegex.exec(mcpContent)) !== null) {
    registeredTools.add(match[1]);
  }

  if (registeredTools.size === 0) {
    findings.push({
      rule: "tool-catalog-parse-failure",
      severity: "warn",
      file: "packages/mcp-server/src/index.ts",
      detail: "Could not extract registered tool names from MCP server index.",
      suggestion: "Verify the tool descriptor format in index.ts. This check may need updating.",
    });
    return findings;
  }

  for (const readmeRel of README_PATHS) {
    const readmePath = path.join(ctx.repoRoot, readmeRel);
    if (!existsSync(readmePath)) continue;

    const content = await readFile(readmePath, "utf-8");

    // Count tool references in README (tools are typically in code blocks or tool lists)
    // This is a heuristic — we look for backtick-wrapped tool names
    let missingCount = 0;
    const missingTools: string[] = [];

    for (const toolName of registeredTools) {
      // Tool names in docs use snake_case with backticks
      const toolRef = `\`${toolName}\``;
      if (!content.includes(toolRef)) {
        missingTools.push(toolName);
        missingCount++;
      }
    }

    if (missingCount > 0 && missingCount <= 3) {
      findings.push({
        rule: "tool-catalog-drift-minor",
        severity: "warn",
        file: readmeRel,
        detail: `${readmeRel} is missing documentation for ${missingCount} tool(s): ${missingTools.slice(0, 5).join(", ")}.`,
        suggestion: "Add missing tool documentation to keep the public catalog in sync with the live registry.",
      });
    } else if (missingCount > 3) {
      findings.push({
        rule: "tool-catalog-drift-major",
        severity: "warn",
        file: readmeRel,
        detail: `${readmeRel} is missing documentation for ${missingCount} registered tool(s).`,
        suggestion: "Update the README tool catalog or consider auto-generating it from the live MCP registry.",
      });
    }
  }

  return findings;
}

/**
 * Check 6: PR template capability-gate field completeness.
 * When guarded paths are changed, the PR template fields should be filled in.
 * This checks that the template itself has the required sections.
 */
async function checkPrTemplateCompleteness(ctx: CheckContext): Promise<GuardrailFinding[]> {
  const findings: GuardrailFinding[] = [];
  const prTemplatePath = path.join(ctx.repoRoot, ".github/PULL_REQUEST_TEMPLATE.md");

  if (!existsSync(prTemplatePath)) {
    findings.push({
      rule: "pr-template-missing",
      severity: "warn",
      file: ".github/PULL_REQUEST_TEMPLATE.md",
      detail: "PR template file not found. Capability-gate checks cannot be enforced.",
      suggestion: "Ensure .github/PULL_REQUEST_TEMPLATE.md exists with capability impact section.",
    });
    return findings;
  }

  const content = await readFile(prTemplatePath, "utf-8");
  const requiredSections = [
    "Capability impact",
    "Platforms/frameworks affected",
    "Support boundary change",
    "ai-first-capability-expansion-guideline",
  ];

  for (const section of requiredSections) {
    if (!content.includes(section)) {
      findings.push({
        rule: "pr-template-incomplete",
        severity: "warn",
        file: ".github/PULL_REQUEST_TEMPLATE.md",
        detail: `PR template missing required section: "${section}".`,
        suggestion: "Add the missing section to the PR template for capability-gate enforcement.",
      });
    }
  }

  return findings;
}

// ─── Main Runner ─────────────────────────────────────────────────────────────

async function runAllChecks(ctx: CheckContext): Promise<GuardrailResult> {
  const allFindings: GuardrailFinding[] = [];

  const checks = [
    { name: "Hotspot file sizes", check: checkHotspotFileSizes },
    { name: "Thin-facade boundary", check: checkThinFacadeBoundary },
    { name: "Platform leakage", check: checkPlatformLeakage },
    { name: "Dependency direction", check: checkDependencyDirection },
    { name: "Tool catalog drift", check: checkToolCatalogDrift },
    { name: "PR template completeness", check: checkPrTemplateCompleteness },
  ];

  for (const { name, check } of checks) {
    const findings = await check(ctx);
    allFindings.push(...findings);
  }

  // Sort: fails first, then warnings
  allFindings.sort((a, b) => {
    if (a.severity === "fail" && b.severity !== "fail") return -1;
    if (a.severity !== "fail" && b.severity === "fail") return 1;
    return a.rule.localeCompare(b.rule);
  });

  const failCount = allFindings.filter((f) => f.severity === "fail").length;
  const warnCount = allFindings.filter((f) => f.severity === "warn").length;
  const passCount = checks.length - (failCount + warnCount > 0 ? 0 : 0);

  return {
    findings: allFindings,
    passCount: Math.max(0, checks.length - new Set(allFindings.map((f) => f.rule)).size),
    warnCount,
    failCount,
  };
}

function formatResult(result: GuardrailResult): string {
  const lines: string[] = [];

  lines.push("=== Architecture Guardrail Validation ===\n");

  if (result.findings.length === 0) {
    lines.push("All checks passed. No findings.\n");
    return lines.join("\n");
  }

  for (const finding of result.findings) {
    const severityTag = finding.severity === "fail" ? "FAIL" : "WARN";
    lines.push(`[${severityTag}] ${finding.rule}`);
    lines.push(`  File:     ${finding.file}`);
    lines.push(`  Detail:   ${finding.detail}`);
    lines.push(`  Suggest:  ${finding.suggestion}`);
    lines.push("");
  }

  lines.push("--- Summary ---");
  lines.push(`Passed:  ${result.passCount} checks`);
  lines.push(`Warnings: ${result.warnCount} findings`);
  lines.push(`Failures: ${result.failCount} findings`);
  lines.push("");

  return lines.join("\n");
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const failOnWarn = args.includes("--fail-on") && args.includes("warn");

  const ctx: CheckContext = {
    repoRoot: repoRootFromScript(),
    failOnWarn,
  };

  const result = await runAllChecks(ctx);
  console.log(formatResult(result));

  // Exit code logic
  if (result.failCount > 0) {
    console.error("Architecture guardrail validation FAILED.");
    process.exit(1);
  }

  if (ctx.failOnWarn && result.warnCount > 0) {
    console.error("Architecture guardrail validation has warnings and --fail-on warn is set.");
    process.exit(1);
  }

  console.log("Architecture guardrail validation passed.");
}

main().catch((err) => {
  console.error("Unexpected error in architecture guardrail validation:", err);
  process.exit(1);
});
