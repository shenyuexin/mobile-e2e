import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePrepareReleaseArgs, resolveTargetVersion } from './prepare-mcp-release-lib.ts';

const thisDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(thisDir, '..', '..');
const pkgName = '@shenyuexin/mobile-e2e-mcp';
const pkgJsonPath = resolve(repoRoot, 'packages/mcp-server/package.json');
const repomixOutputPath = 'repomix-output.xml';
const releaseArgs = parsePrepareReleaseArgs(process.argv.slice(2));

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
const version = resolveTargetVersion(currentVersion, releaseArgs);

const tagName = `mcp-server-v${version}`;

const localTagExists = run(`git tag -l "${tagName}"`);
if (localTagExists === tagName) {
  throw new Error(`Tag already exists locally: ${tagName}`);
}

const remoteTagExists = run(`git ls-remote --tags origin ${tagName}`);
if (remoteTagExists.length > 0) {
  throw new Error(`Tag already exists on origin: ${tagName}`);
}

pkgJson.version = version;
writeFileSync(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`, 'utf8');

runWithOutput(`pnpm tsx scripts/release/sync-mcp-release-changelog.ts --version ${version}`);
runWithOutput(`pnpm tsx scripts/release/validate-mcp-release.ts --version ${version} --tag ${tagName}`);
runWithOutput(`npx repomix@latest --output ${repomixOutputPath} --quiet --compress`);

runWithOutput('pnpm build');
runWithOutput('pnpm typecheck');
runWithOutput('pnpm test:mcp-server');

runWithOutput(`git add packages/mcp-server/package.json pnpm-lock.yaml CHANGELOG.md ${repomixOutputPath}`);
runWithOutput(`git commit -m "release(mcp-server): v${version}"`);

runWithOutput(`git tag -a ${tagName} -m "Release ${pkgName} v${version}"`);

runWithOutput('git push');
runWithOutput(`git push origin ${tagName}`);

process.stdout.write(
  [
    '',
    `✅ Prepared and pushed ${pkgName} ${version}`,
    `✅ Created and pushed tag: ${tagName}`,
    `✅ Refreshed ${repomixOutputPath} for this release commit`,
    'ℹ️ GitHub Actions will publish to npm on this tag.'
  ].join('\n')
);
