import { buildReleaseMetadata, readChangelog, readMcpPackageVersion, validateReleaseChangelog } from "./release-changelog.js";

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

process.stdout.write([
  `✅ Release metadata validated for ${version}`,
  `✅ Tag matches expected format: ${metadata.tagName}`,
  `✅ CHANGELOG.md contains a non-empty section for ${version}`,
].join("\n"));
