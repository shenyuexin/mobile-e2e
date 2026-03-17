import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type ReleaseLevel = 'patch' | 'minor' | 'major';

const levelArg = (process.argv[2] ?? 'patch').trim() as ReleaseLevel;
const allowedLevels = new Set<ReleaseLevel>(['patch', 'minor', 'major']);

if (!allowedLevels.has(levelArg)) {
  throw new Error(`Invalid release level: ${levelArg}. Use patch|minor|major.`);
}

const thisDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(thisDir, '..', '..');
const pkgName = '@shenyuexin/mobile-e2e-mcp';
const pkgJsonPath = resolve(repoRoot, 'packages/mcp-server/package.json');

function bumpSemver(version: string, level: ReleaseLevel): string {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Unsupported version format: ${version}. Expected x.y.z`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (level === 'major') {
    return `${major + 1}.0.0`;
  }

  if (level === 'minor') {
    return `${major}.${minor + 1}.0`;
  }

  return `${major}.${minor}.${patch + 1}`;
}

function run(command: string): string {
  return execSync(command, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8'
  }).trim();
}

function runWithOutput(command: string): void {
  execSync(command, {
    cwd: repoRoot,
    stdio: 'inherit',
    encoding: 'utf8'
  });
}

const status = run('git status --porcelain');
if (status.length > 0) {
  throw new Error('Working tree is not clean. Commit or stash changes before release.');
}

const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as Record<string, unknown>;
const currentVersion = String(pkgJson.version ?? '');
const version = bumpSemver(currentVersion, levelArg);
pkgJson.version = version;
writeFileSync(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`, 'utf8');

const tagName = `mcp-server-v${version}`;

runWithOutput('pnpm build');
runWithOutput('pnpm typecheck');
runWithOutput('pnpm test:mcp-server');

runWithOutput('git add packages/mcp-server/package.json pnpm-lock.yaml');
runWithOutput(`git commit -m "release(mcp-server): v${version}"`);

const localTagExists = run(`git tag -l "${tagName}"`);
if (localTagExists === tagName) {
  throw new Error(`Tag already exists locally: ${tagName}`);
}

const remoteTagExists = run(`git ls-remote --tags origin ${tagName}`);
if (remoteTagExists.length > 0) {
  throw new Error(`Tag already exists on origin: ${tagName}`);
}

runWithOutput(`git tag -a ${tagName} -m "Release ${pkgName} v${version}"`);

runWithOutput('git push');
runWithOutput(`git push origin ${tagName}`);

process.stdout.write(
  [
    '',
    `✅ Prepared and pushed ${pkgName} ${version}`,
    `✅ Created and pushed tag: ${tagName}`,
    'ℹ️ GitHub Actions will publish to npm on this tag.'
  ].join('\n')
);
