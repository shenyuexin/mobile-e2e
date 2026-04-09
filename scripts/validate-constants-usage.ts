#!/usr/bin/env tsx
/**
 * Constant-usage validator for the mobile-e2e-mcp monorepo.
 *
 * Scans production source files for hardcoded strings that should reference
 * shared constants. Prevents regression after the Phase 20 extraction.
 *
 * What it checks:
 *   1. TOOL_NAMES — hardcoded tool name strings in source files that already
 *      import TOOL_NAMES (new hardcoded usage is a regression)
 *   2. CLI_COMMANDS — hardcoded CLI executable names in adapter-maestro
 *   3. ACTION_TYPES — hardcoded action type strings in recording/replay files
 *
 * What it skips (type system already guards these):
 *   - Type enum values like "full", "partial", "none", "success", "failed"
 *   - Platform strings like "android", "ios"
 *   - Test files (they use string literals for mocking)
 *
 * Usage:
 *   pnpm tsx scripts/validate-constants-usage.ts
 *
 * Exit codes:
 *   0 — no violations found
 *   1 — one or more violations detected
 */

import { readFileSync, existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Violation {
  module: string;
  file: string;
  line: number;
  value: string;
  suggestion: string;
}

interface Result {
  violations: Violation[];
  filesScanned: number;
  rulesChecked: number;
}

interface Rule {
  name: string;
  constantModule: string;
  constantPrefix: string;
  scanDirs: string[];
  /** Regex to find quoted string literals that look like constant values */
  valuePattern: RegExp;
  /** Files to skip (already use constants or are definitions) */
  excludePatterns: string[];
}

interface CheckContext {
  repoRoot: string;
}

// ─── Rules ───────────────────────────────────────────────────────────────────

function getRules(repoRoot: string): Rule[] {
  return [
    {
      name: "tool-names",
      constantModule: "@mobile-e2e-mcp/contracts",
      constantPrefix: "TOOL_NAMES.",
      scanDirs: ["packages/mcp-server/src"],
      // Matches snake_case tool name patterns in quotes
      valuePattern: /"(?:start_session|end_session|run_flow|describe_capabilities|request_manual_handoff|doctor|start_record_session|get_record_session_status|end_record_session|cancel_record_session|export_session_flow|record_task_flow|replay_last_stable_path|replay_checkpoint_chain|perform_action_with_evidence|execute_intent|complete_task|recover_to_known_state|explain_last_failure|find_similar_failures|get_action_outcome|rank_failure_candidates|suggest_known_remediation|compare_against_baseline|compare_visual_baseline|detect_interruption|classify_interruption|resolve_interruption|resume_interrupted_action|inspect_ui|query_ui|resolve_ui_target|wait_for_ui|get_screen_summary|get_session_state|tap|tap_element|type_text|type_into_element|scroll_and_resolve_ui_target|scroll_and_tap_element|install_app|launch_app|terminate_app|reset_app_state|take_screenshot|capture_element_screenshot|record_screen|get_logs|get_crash_signals|collect_debug_evidence|collect_diagnostics|measure_android_performance|measure_ios_performance|capture_js_console_logs|capture_js_network_events|list_js_debug_targets|validate_flow|probe_network_readiness|list_devices)"/g,
      excludePatterns: ["/constants/", "/test/", "node_modules"],
    },
    {
      name: "cli-commands",
      constantModule: "./constants/cli-commands.js",
      constantPrefix: "CLI_COMMANDS.",
      scanDirs: ["packages/adapter-maestro/src"],
      // Matches CLI executable names in array literals like ["adb", ...]
      valuePattern: /"(?:adb|maestro|trace_processor|xcrun|xctrace)"/g,
      excludePatterns: ["/constants/", "/test/", "node_modules", "doctor-runtime.ts", "doctor-guidance.ts", "performance-runtime.ts"],
    },
    {
      name: "action-types",
      constantModule: "@mobile-e2e-mcp/contracts",
      constantPrefix: "ACTION_TYPES.",
      scanDirs: ["packages/adapter-maestro/src"],
      // Matches action type strings
      valuePattern: /"(?:tap_element|type_into_element|wait_for_ui|launch_app|terminate_app|swipe|tap|assert_not_visible|run_sub_flow|back|home|hide_keyboard|stop_app|clear_state)"/g,
      excludePatterns: ["/constants/", "/test/", "node_modules", "contracts/src/types.ts"],
    },
  ];
}

// ─── File Discovery ─────────────────────────────────────────────────────────

async function collectSourceFiles(repoRoot: string, scanDirs: string[], excludePatterns: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const scanDir of scanDirs) {
    const dirPath = path.join(repoRoot, scanDir);
    if (!existsSync(dirPath)) continue;
    await walkDir(dirPath, repoRoot, excludePatterns, files);
  }
  return files;
}

async function walkDir(dir: string, repoRoot: string, excludePatterns: string[], files: string[]): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "test") continue;
      await walkDir(fullPath, repoRoot, excludePatterns, files);
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      const relPath = path.relative(repoRoot, fullPath);
      if (excludePatterns.some((p) => relPath.includes(p))) continue;
      files.push(fullPath);
    }
  }
}

// ─── Scanning ────────────────────────────────────────────────────────────────

function scanFile(filePath: string, rule: Rule, ctx: CheckContext): Violation[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const violations: Violation[] = [];
  const relPath = path.relative(ctx.repoRoot, filePath);

  // Whitelist: files excluded from constant validation
  // Add here if a file is too large/complex to migrate in one shot
  const WHITELIST = [
    "packages/mcp-server/src/dev-cli.ts",
    "packages/adapter-maestro/src/ui-action-tools-ios-physical.ts",
    "packages/adapter-maestro/src/recording-runtime-platform.ts",
    "packages/adapter-maestro/src/recording-runtime-snapshot.ts",
  ];
  if (WHITELIST.some((w) => relPath.includes(w))) return [];

  // Only scan files that already import the constant module.
  // This prevents REGRESSION — files that migrated to constants
  // must not reintroduce hardcoded strings.
  // Files that never imported the module are out of scope (they can
  // be migrated incrementally in future work).
  const hasImport = content.includes(`from "${rule.constantModule}"`)
    || content.includes(`from '${rule.constantModule}'`)
    || content.includes(`import { ${rule.constantPrefix.replace(/\.$/, "")}`);
  if (!hasImport) return [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip imports and comments
    if (trimmed.startsWith("import ") || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
      continue;
    }

    // Skip type definition lines (type unions like `type X = "a" | "b"`)
    // These are inherently string-literal types, not runtime values
    if (trimmed.startsWith("export type ") || trimmed.startsWith("type ") || trimmed.startsWith("export interface ")) {
      continue;
    }

    const matches = line.matchAll(rule.valuePattern);
    for (const m of matches) {
      const quotedValue = m[0];
      const rawValue = quotedValue.slice(1, -1); // strip quotes

      // Skip if this line already uses the constant
      if (line.includes(`${rule.constantPrefix}`)) continue;

      violations.push({
        module: rule.name,
        file: relPath,
        line: i + 1,
        value: rawValue,
        suggestion: `Use ${rule.constantPrefix} instead of "${rawValue}"`,
      });
    }
  }

  return violations;
}

// ─── Main Runner ─────────────────────────────────────────────────────────────

async function runCheck(ctx: CheckContext): Promise<Result> {
  const rules = getRules(ctx.repoRoot);
  const allViolations: Violation[] = [];
  let totalFilesScanned = 0;

  for (const rule of rules) {
    const files = await collectSourceFiles(ctx.repoRoot, rule.scanDirs, rule.excludePatterns);
    totalFilesScanned += files.length;

    for (const file of files) {
      allViolations.push(...scanFile(file, rule, ctx));
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  const unique: Violation[] = [];
  for (const v of allViolations) {
    const key = `${v.file}:${v.line}:${v.value}:${v.module}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(v);
    }
  }

  return {
    violations: unique,
    filesScanned: totalFilesScanned,
    rulesChecked: rules.length,
  };
}

function formatResult(result: Result): string {
  const lines: string[] = [];

  lines.push("=== Constants Usage Validation ===\n");
  lines.push(`Rules checked:  ${result.rulesChecked}`);
  lines.push(`Files scanned:  ${result.filesScanned}`);
  lines.push(`Violations:     ${result.violations.length}\n`);

  if (result.violations.length === 0) {
    lines.push("✅ No hardcoded constant values found in production source files.");
    return lines.join("\n");
  }

  // Group by module
  const byModule = new Map<string, Violation[]>();
  for (const v of result.violations) {
    const group = byModule.get(v.module) || [];
    group.push(v);
    byModule.set(v.module, group);
  }

  for (const [mod, violations] of byModule) {
    lines.push(`── ${mod} ──`);
    for (const v of violations) {
      lines.push(`  ❌ ${v.file}:${v.line}`);
      lines.push(`     Found: "${v.value}"`);
      lines.push(`     → ${v.suggestion}`);
    }
    lines.push("");
  }

  lines.push(`\n❌ ${result.violations.length} violation(s) must be fixed before merge.`);
  return lines.join("\n");
}

// ─── CLI Entry ───────────────────────────────────────────────────────────────

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const ctx: CheckContext = { repoRoot };

  const result = await runCheck(ctx);
  console.log(formatResult(result));

  if (result.violations.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Constants validation failed with error:", err.message);
  process.exit(1);
});
