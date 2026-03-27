import { execSync } from "node:child_process";
import { buildReleaseMetadata, readChangelog, readMcpPackageVersion, validateReleaseChangelog } from "./release-changelog.js";

const GUARDED_PREFIXES = [
  "packages/contracts/",
  "packages/core/",
  "packages/mcp-server/",
  "configs/",
  "scripts/release/",
  ".github/workflows/release-mcp.yml",
];

const GUARDED_PATTERNS = [
  /^packages\/adapter-[^/]+\//,
  /^docs\/architecture\//,
  /^docs\/engineering\/(ai-first-capability-expansion-guideline|capability-family-inventory|adapter-maestro-index-decomposition-implementation-playbook\.zh-CN)\.md$/,
];

const PUBLIC_DOC_PATHS = [
  "README.md",
  "README.zh-CN.md",
  "docs/README.md",
  "docs/guides/ai-agent-invocation.zh-CN.md",
  "docs/guides/golden-path.md",
  "docs/guides/flow-generation.md",
  "docs/delivery/npm-release-and-git-tagging.zh-CN.md",
  "docs/showcase/ci-evidence.md",
  "docs/architecture/platform-implementation-matrix.zh-CN.md",
  "docs/architecture/capability-map.md",
  "docs/architecture/governance-security.md",
];

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

function previousTag(currentTag: string): string | undefined {
  const tags = listReleaseTags();
  const index = tags.indexOf(currentTag);
  if (index <= 0) {
    return undefined;
  }
  return tags[index - 1];
}

function changedFilesForRange(range: string): string[] {
  const output = run(`git diff --name-only ${range}`);
  return output.length > 0 ? output.split("\n").filter(Boolean) : [];
}

function isGuardedPath(filePath: string): boolean {
  return GUARDED_PREFIXES.some((prefix) => filePath === prefix || filePath.startsWith(prefix))
    || GUARDED_PATTERNS.some((pattern) => pattern.test(filePath));
}

function isPublicDocPath(filePath: string): boolean {
  return PUBLIC_DOC_PATHS.includes(filePath);
}

function parseArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

const explicitVersion = parseArg("--version");
const explicitTag = parseArg("--tag");

const version = explicitVersion ?? readMcpPackageVersion();
const metadata = buildReleaseMetadata(version);
const actualTag = explicitTag ?? metadata.tagName;

if (actualTag !== metadata.tagName) {
  throw new Error(`Tag '${actualTag}' does not match package version '${version}' (expected '${metadata.tagName}').`);
}

validateReleaseChangelog(readChangelog(), metadata);

const previous = previousTag(actualTag);
if (previous) {
  const range = `${previous}..${actualTag}`;
  const changedFiles = changedFilesForRange(range);
  const touchesGuardedPath = changedFiles.some(isGuardedPath);
  const touchesPublicDocs = changedFiles.some(isPublicDocPath);

  if (touchesGuardedPath && !touchesPublicDocs) {
    throw new Error(
      `Release range ${range} touches capability-guarded paths but no canonical public docs or support-boundary guides were updated.`
    );
  }
}

process.stdout.write([
  `✅ Release metadata validated for ${version}`,
  `✅ Tag matches expected format: ${metadata.tagName}`,
  `✅ CHANGELOG.md contains a non-empty section for ${version}`,
].join("\n"));
