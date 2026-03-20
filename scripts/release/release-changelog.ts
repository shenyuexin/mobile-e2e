import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const thisDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(thisDir, "..", "..");
const changelogPath = resolve(repoRoot, "CHANGELOG.md");
const packageJsonPath = resolve(repoRoot, "packages/mcp-server/package.json");

export interface ReleaseMetadata {
  version: string;
  tagName: string;
  releaseDate: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function readMcpPackageVersion(): string {
  const pkgJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: string };
  if (!pkgJson.version) {
    throw new Error("packages/mcp-server/package.json is missing a version field.");
  }
  return pkgJson.version;
}

export function buildReleaseMetadata(version = readMcpPackageVersion()): ReleaseMetadata {
  return {
    version,
    tagName: `mcp-server-v${version}`,
    releaseDate: new Date().toISOString().slice(0, 10),
  };
}

export function readChangelog(): string {
  return readFileSync(changelogPath, "utf8").replace(/\r/g, "");
}

function extractSection(content: string, heading: string): { start: number; bodyStart: number; end: number; body: string } {
  const headingPattern = new RegExp(`^## ${escapeRegExp(heading)}\\s*$`, "m");
  const headingMatch = headingPattern.exec(content);
  if (!headingMatch || headingMatch.index === undefined) {
    throw new Error(`CHANGELOG.md is missing section heading: ## ${heading}`);
  }
  const start = headingMatch.index;
  const bodyStart = start + headingMatch[0].length;
  const rest = content.slice(bodyStart);
  const nextHeadingMatch = /^## \[.+?\](?: - \d{4}-\d{2}-\d{2})?\s*$/m.exec(rest);
  const end = nextHeadingMatch && nextHeadingMatch.index !== undefined ? bodyStart + nextHeadingMatch.index : content.length;
  return {
    start,
    bodyStart,
    end,
    body: content.slice(bodyStart, end),
  };
}

function hasMeaningfulReleaseNotes(sectionBody: string): boolean {
  return sectionBody
    .split("\n")
    .map((line) => line.trim())
    .some((line) => line.startsWith("- ") || line.startsWith("### "));
}

export function promoteUnreleasedToVersion(content: string, metadata: ReleaseMetadata): string {
  const unreleased = extractSection(content, "[Unreleased]");
  if (!hasMeaningfulReleaseNotes(unreleased.body)) {
    throw new Error("CHANGELOG.md [Unreleased] section is empty. Add release notes before preparing a tag.");
  }

  const versionHeading = `[${metadata.version}] - ${metadata.releaseDate}`;
  const existingVersionPattern = new RegExp(`^## \\[${escapeRegExp(metadata.version)}\\](?: - \\d{4}-\\d{2}-\\d{2})?\\s*$`, "m");
  if (existingVersionPattern.test(content)) {
    return content;
  }

  const before = content.slice(0, unreleased.bodyStart);
  const after = content.slice(unreleased.end).replace(/^\n+/, "\n");
  const unreleasedBody = unreleased.body.replace(/^\n+/, "\n").replace(/\n+$/, "\n");

  return `${before}\n\n## ${versionHeading}${unreleasedBody}\n${after}`.replace(/\n{3,}/g, "\n\n");
}

export function validateReleaseChangelog(content: string, metadata: ReleaseMetadata): void {
  extractSection(content, "[Unreleased]");
  const versionPattern = new RegExp(`^## \\[${escapeRegExp(metadata.version)}\\](?: - \\d{4}-\\d{2}-\\d{2})?\\s*$`, "m");
  const headingMatch = versionPattern.exec(content);
  if (!headingMatch) {
    throw new Error(`CHANGELOG.md must contain a release section for version ${metadata.version}.`);
  }
  const versionHeading = headingMatch[0].replace(/^## /, "");
  const section = extractSection(content, versionHeading);
  if (!hasMeaningfulReleaseNotes(section.body)) {
    throw new Error(`CHANGELOG.md section for ${metadata.version} is empty. Add at least one release note bullet.`);
  }
}

export function writeChangelog(content: string): void {
  writeFileSync(changelogPath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
}
