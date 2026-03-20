import { execSync } from "node:child_process";
import { buildReleaseMetadata, readChangelog, readMcpPackageVersion, writeChangelog } from "./release-changelog.js";

type SectionName = "Added" | "Changed" | "Fixed";

function parseArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function run(command: string): string {
  return execSync(command, {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  }).trim();
}

function listReleaseTags(): string[] {
  const output = run('git tag -l "mcp-server-v*" --sort=version:refname');
  return output.length > 0 ? output.split("\n").filter(Boolean) : [];
}

function resolveTagAndVersion(): { version: string; tagName?: string } {
  const explicitTag = parseArg("--tag");
  const explicitVersion = parseArg("--version");
  if (explicitTag) {
    return { version: explicitTag.replace(/^mcp-server-v/, ""), tagName: explicitTag };
  }
  if (explicitVersion) {
    return { version: explicitVersion, tagName: undefined };
  }
  return { version: readMcpPackageVersion(), tagName: undefined };
}

function previousTag(currentTag: string | undefined): string | undefined {
  const tags = listReleaseTags();
  if (tags.length === 0) {
    return undefined;
  }
  if (!currentTag) {
    return tags[tags.length - 1];
  }
  const index = tags.indexOf(currentTag);
  if (index <= 0) {
    return undefined;
  }
  return tags[index - 1];
}

function releaseCommitRange(currentTag: string | undefined, previous: string | undefined): string {
  if (currentTag && previous) {
    return `${previous}..${currentTag}`;
  }
  if (currentTag && !previous) {
    return currentTag;
  }
  if (!currentTag && previous) {
    return `${previous}..HEAD`;
  }
  return "HEAD";
}

function collectSubjects(range: string): string[] {
  return run(`git log --no-merges --pretty=format:%s ${range}`)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("release(mcp-server):"));
}

function firstReleaseSummary(): Map<SectionName, string[]> {
  return new Map<SectionName, string[]>([
    ["Added", [
      "Introduced the first public AI-first mobile E2E MCP server with session lifecycle, app control, UI inspection, interaction, diagnostics, interruption handling, and failure-analysis tools.",
      "Established deterministic-first execution adapters plus bounded OCR/vision fallback for Android, iOS, React Native, and Flutter automation workflows.",
      "Published runnable sample flows, showcase demos, and real-device/simulator validation assets for login, recovery, and harness onboarding scenarios.",
    ]],
    ["Changed", [
      "Reorganized the repository into a pnpm monorepo with explicit contracts, core orchestration, adapters, and MCP server package boundaries.",
      "Added stdio/dev CLI entrypoints, package metadata, governance baselines, and release automation needed for public npm distribution.",
    ]],
    ["Fixed", [
      "Hardened doctor checks, dry-run behavior, selector resolution, and session or lease stability during the initial release cycle.",
    ]],
  ]);
}

interface ThemeRule {
  section: SectionName;
  patterns: RegExp[];
  summary: string;
}

const THEME_RULES: ThemeRule[] = [
  {
    section: "Added",
    patterns: [/replay|run_flow|flow|runner|record/i, /session|lease|scheduler/i],
    summary: "Expanded replay, recording, and session-orchestration capabilities across the MCP harness.",
  },
  {
    section: "Added",
    patterns: [/tap|type|scroll|inspect ui|query ui|target|locator|ui/i],
    summary: "Extended deterministic UI inspection, targeting, and interaction coverage for mobile flows.",
  },
  {
    section: "Added",
    patterns: [/ocr|vision/i],
    summary: "Improved bounded OCR and vision fallback support for cases where deterministic selectors are unavailable.",
  },
  {
    section: "Changed",
    patterns: [/doctor|diagnostic|performance|evidence|crash|log/i],
    summary: "Improved diagnostics, evidence capture, and performance analysis workflows for mobile automation runs.",
  },
  {
    section: "Changed",
    patterns: [/docs|readme|guide|architecture|governance|policy/i],
    summary: "Refined operator documentation, governance guidance, and architecture references around the release.",
  },
  {
    section: "Fixed",
    patterns: [/fix:|stabilize|stability|harden|guard|conflict|lease|timeout|release/i],
    summary: "Hardened release reliability, runtime guardrails, and end-to-end flow stability on supported platforms.",
  },
];

function matchesAny(subjects: string[], patterns: RegExp[]): boolean {
  return subjects.some((subject) => patterns.some((pattern) => pattern.test(subject)));
}

function summarizeSubjects(subjects: string[], previous?: string): Map<SectionName, string[]> {
  if (!previous) {
    return firstReleaseSummary();
  }

  const grouped = new Map<SectionName, string[]>([
    ["Added", []],
    ["Changed", []],
    ["Fixed", []],
  ]);

  for (const rule of THEME_RULES) {
    if (matchesAny(subjects, rule.patterns)) {
      grouped.get(rule.section)?.push(rule.summary);
    }
  }

  const commitCount = subjects.length;
  if (commitCount > 0) {
    grouped.get("Changed")?.push(`Release scope includes ${commitCount} merged commit${commitCount === 1 ? "" : "s"} between ${previous} and the target tag.`);
  }

  return grouped;
}

function renderReleaseSection(version: string, date: string, grouped: Map<SectionName, string[]>): string {
  const parts: string[] = [`## [${version}] - ${date}`, ""];
  for (const section of ["Added", "Changed", "Fixed"] as const) {
    const items = grouped.get(section) ?? [];
    if (items.length === 0) {
      continue;
    }
    parts.push(`### ${section}`);
    for (const item of items) {
      parts.push(`- ${item}`);
    }
    parts.push("");
  }
  return `${parts.join("\n").trim()}\n`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function upsertReleaseSection(changelog: string, version: string, section: string): string {
  const normalized = changelog.replace(/\r/g, "");
  const unreleasedHeading = "## [Unreleased]";
  const unreleasedIndex = normalized.indexOf(unreleasedHeading);
  if (unreleasedIndex === -1) {
    throw new Error("CHANGELOG.md is missing ## [Unreleased].");
  }

  const versionPattern = new RegExp(`^## \\[${escapeRegExp(version)}\\](?: - \\d{4}-\\d{2}-\\d{2})?\\s*$`, "m");
  const match = versionPattern.exec(normalized);
  if (match && match.index !== undefined) {
    const start = match.index;
    const bodyStart = start + match[0].length;
    const rest = normalized.slice(bodyStart);
    const nextHeading = /^## \[.+?\](?: - \d{4}-\d{2}-\d{2})?\s*$/m.exec(rest);
    const end = nextHeading && nextHeading.index !== undefined ? bodyStart + nextHeading.index : normalized.length;
    return `${normalized.slice(0, start)}${section}\n${normalized.slice(end).replace(/^\n+/, "")}`.replace(/\n{3,}/g, "\n\n");
  }

  const insertAt = unreleasedIndex + unreleasedHeading.length;
  const before = normalized.slice(0, insertAt);
  const after = normalized.slice(insertAt).replace(/^\n*/, "\n\n");
  return `${before}\n\n${section}${after}`.replace(/\n{3,}/g, "\n\n");
}

const { version, tagName } = resolveTagAndVersion();
const metadata = buildReleaseMetadata(version);
const prevTag = previousTag(tagName);
const range = releaseCommitRange(tagName, prevTag);
const subjects = collectSubjects(range);
const grouped = summarizeSubjects(subjects, prevTag);
const section = renderReleaseSection(version, metadata.releaseDate, grouped);
const updated = upsertReleaseSection(readChangelog(), version, section);
writeChangelog(updated);

process.stdout.write([
  `✅ Synced CHANGELOG.md for ${version}`,
  `ℹ️ Commit range: ${range}`,
  `ℹ️ Previous tag: ${prevTag ?? "none (first release)"}`,
  `ℹ️ Summarized ${subjects.length} commit subject${subjects.length === 1 ? "" : "s"}`,
].join("\n"));
