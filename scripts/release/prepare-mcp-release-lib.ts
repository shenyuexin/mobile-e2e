export type ReleaseLevel = "patch" | "minor" | "major";

export type PrepareReleaseArgs =
  | { mode: "level"; level: ReleaseLevel }
  | { mode: "explicit"; version: string };

const RELEASE_LEVELS = new Set<ReleaseLevel>(["patch", "minor", "major"]);
const EXACT_SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

export function isExactSemver(version: string): boolean {
  return EXACT_SEMVER_PATTERN.test(version);
}

export function bumpSemver(version: string, level: ReleaseLevel): string {
  const match = version.match(EXACT_SEMVER_PATTERN);
  if (!match) {
    throw new Error(`Unsupported version format: ${version}. Expected x.y.z`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (level === "major") {
    return `${major + 1}.0.0`;
  }

  if (level === "minor") {
    return `${major}.${minor + 1}.0`;
  }

  return `${major}.${minor}.${patch + 1}`;
}

export function compareSemver(left: string, right: string): number {
  const leftMatch = left.match(EXACT_SEMVER_PATTERN);
  const rightMatch = right.match(EXACT_SEMVER_PATTERN);
  if (!leftMatch || !rightMatch) {
    throw new Error(`Cannot compare non-semver versions: '${left}' vs '${right}'. Expected x.y.z`);
  }

  for (let index = 1; index <= 3; index += 1) {
    const delta = Number(leftMatch[index]) - Number(rightMatch[index]);
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

export function parsePrepareReleaseArgs(argv: string[]): PrepareReleaseArgs {
  const [firstArg, secondArg, ...rest] = argv;

  if (rest.length > 0) {
    throw new Error(`Unexpected extra arguments: ${rest.join(" ")}`);
  }

  if (!firstArg) {
    return { mode: "level", level: "patch" };
  }

  if (firstArg === "--version") {
    if (!secondArg || !isExactSemver(secondArg)) {
      throw new Error("--version requires an exact x.y.z version.");
    }
    return { mode: "explicit", version: secondArg };
  }

  if (secondArg) {
    throw new Error(`Invalid argument combination: ${firstArg} ${secondArg}`);
  }

  if (RELEASE_LEVELS.has(firstArg as ReleaseLevel)) {
    return { mode: "level", level: firstArg as ReleaseLevel };
  }

  throw new Error(`Invalid release selector: ${firstArg}. Use patch|minor|major or --version x.y.z.`);
}

export function resolveTargetVersion(currentVersion: string, args: PrepareReleaseArgs): string {
  if (args.mode === "level") {
    return bumpSemver(currentVersion, args.level);
  }

  if (compareSemver(args.version, currentVersion) <= 0) {
    throw new Error(`Explicit version ${args.version} must be greater than current version ${currentVersion}.`);
  }

  return args.version;
}

export function buildPrepareReleaseArgv(version: string): string[] {
  if (!isExactSemver(version)) {
    throw new Error(`Invalid explicit version: ${version}. Expected x.y.z.`);
  }
  return ["--version", version];
}
