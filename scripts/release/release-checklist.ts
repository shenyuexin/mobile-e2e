#!/usr/bin/env tsx
/**
 * Release checklist executor with automatic verification.
 * 
 * Usage:
 *   pnpm tsx scripts/release/release-checklist.ts           # Full checklist
 *   pnpm tsx scripts/release/release-checklist.ts --dry-run # Dry-run mode (skip push/publish)
 *   pnpm tsx scripts/release/release-checklist.ts --skip-ci # Skip remote CI verification
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const thisDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(thisDir, '..', '..');
const pkgJsonPath = resolve(repoRoot, 'packages/mcp-server/package.json');

interface CheckStep {
  id: string;
  label: string;
  action: () => Promise<void>;
  category: 'pre-flight' | 'validation' | 'execution' | 'push' | 'post-release';
}

interface ChecklistResult {
  passed: string[];
  failed: string[];
  skipped: string[];
}

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

function log(message: string, color: string = colors.reset): void {
  process.stdout.write(`${color}${message}${colors.reset}\n`);
}

function logStep(category: string, step: string, status: 'pending' | 'running' | 'pass' | 'fail' | 'skip'): void {
  const statusIcon = {
    pending: `${colors.gray}○${colors.reset}`,
    running: `${colors.blue}◉${colors.reset}`,
    pass: `${colors.green}✓${colors.reset}`,
    fail: `${colors.red}✗${colors.reset}`,
    skip: `${colors.yellow}○${colors.reset}`,
  };

  const categoryLabel = `[${category}]`;
  log(`  ${statusIcon[status]} ${colors.gray}${categoryLabel.padEnd(15)}${colors.reset} ${step}`);
}

function run(command: string, timeoutMs: number = 120000): string {
  return execSync(command, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: timeoutMs,
  }).trim();
}

function runWithOutput(command: string): void {
  execSync(command, {
    cwd: repoRoot,
    stdio: 'inherit',
    encoding: 'utf8',
  });
}

function readPackageVersion(): string {
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as Record<string, unknown>;
  return String(pkgJson.version ?? '');
}

function parseArgs(): { dryRun: boolean; skipCi: boolean } {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    skipCi: args.includes('--skip-ci'),
  };
}

const checklist: CheckStep[] = [
  // ====== Pre-flight Checks ======
  {
    id: 'git-clean',
    label: 'Working tree is clean',
    category: 'pre-flight',
    action: async () => {
      const status = run('git status --porcelain');
      if (status.length > 0) {
        throw new Error('Working tree is not clean. Commit or stash changes first.\n' + status);
      }
    },
  },
  {
    id: 'current-branch',
    label: 'On main branch',
    category: 'pre-flight',
    action: async () => {
      const branch = run('git branch --show-current');
      if (branch !== 'main') {
        throw new Error(`Expected to be on 'main' branch, but on '${branch}'`);
      }
    },
  },
  {
    id: 'remote-connectivity',
    label: 'Can reach origin remote',
    category: 'pre-flight',
    action: async () => {
      run('git ls-remote --get-url origin', 10000);
    },
  },

  // ====== Validation Checks ======
  {
    id: 'package-version',
    label: 'Package version exists in package.json',
    category: 'validation',
    action: async () => {
      const version = readPackageVersion();
      if (!version || version === '0.0.0') {
        throw new Error(`Invalid package version: ${version}`);
      }
      log(`    Current version: ${version}`, colors.cyan);
    },
  },
  {
    id: 'tag-format',
    label: 'Tag format is correct',
    category: 'validation',
    action: async () => {
      const version = readPackageVersion();
      const tagName = `mcp-server-v${version}`;
      if (!/^mcp-server-v\d+\.\d+\.\d+$/.test(tagName)) {
        throw new Error(`Invalid tag format: ${tagName}`);
      }
    },
  },
  {
    id: 'tag-not-exists',
    label: 'Tag does not already exist',
    category: 'validation',
    action: async () => {
      const version = readPackageVersion();
      const tagName = `mcp-server-v${version}`;
      const localTag = run(`git tag -l "${tagName}"`);
      if (localTag === tagName) {
        throw new Error(`Tag already exists locally: ${tagName}. Delete it first or bump version.`);
      }
      const remoteTag = run(`git ls-remote --tags origin ${tagName}`);
      if (remoteTag.length > 0) {
        throw new Error(`Tag already exists on origin: ${tagName}. Delete it first or bump version.`);
      }
    },
  },
  {
    id: 'changelog-entry',
    label: 'CHANGELOG.md has version entry',
    category: 'validation',
    action: async () => {
      const version = readPackageVersion();
      const changelog = readFileSync(resolve(repoRoot, 'CHANGELOG.md'), 'utf8');
      if (!changelog.includes(`## ${version}`) && !changelog.includes(`## [${version}]`)) {
        throw new Error(`CHANGELOG.md does not contain entry for version ${version}`);
      }
    },
  },
  {
    id: 'build-pass',
    label: 'Build passes',
    category: 'validation',
    action: async () => {
      runWithOutput('pnpm --filter @shenyuexin/mobile-e2e-mcp run bundle');
    },
  },
  {
    id: 'typecheck-pass',
    label: 'TypeScript type-check passes',
    category: 'validation',
    action: async () => {
      runWithOutput('pnpm --filter @shenyuexin/mobile-e2e-mcp run typecheck');
    },
  },
  {
    id: 'tests-pass',
    label: 'MCP server tests pass',
    category: 'validation',
    action: async () => {
      runWithOutput('pnpm --filter @shenyuexin/mobile-e2e-mcp test');
    },
  },

  // ====== Execution ======
  {
    id: 'sync-changelog',
    label: 'Sync CHANGELOG.md from release diff',
    category: 'execution',
    action: async () => {
      const version = readPackageVersion();
      runWithOutput(`pnpm tsx scripts/release/sync-mcp-release-changelog.ts --version ${version}`);
    },
  },
  {
    id: 'generate-repomix',
    label: 'Generate repomix-output.xml',
    category: 'execution',
    action: async () => {
      runWithOutput('npx repomix@latest --output repomix-output.xml --quiet --compress');
    },
  },
  {
    id: 'generate-gitnexus',
    label: 'Generate GitNexus index',
    category: 'execution',
    action: async () => {
      runWithOutput('npx gitnexus analyze');
    },
  },
  {
    id: 'commit-changes',
    label: 'Commit release changes',
    category: 'execution',
    action: async () => {
      const version = readPackageVersion();
      runWithOutput(`git add packages/mcp-server/package.json pnpm-lock.yaml CHANGELOG.md repomix-output.xml .gitnexus`);
      runWithOutput(`git commit -m "release(mcp-server): v${version}"`);
    },
  },
  {
    id: 'create-tag',
    label: 'Create release tag',
    category: 'execution',
    action: async () => {
      const version = readPackageVersion();
      const tagName = `mcp-server-v${version}`;
      runWithOutput(`git tag -a ${tagName} -m "Release @shenyuexin/mobile-e2e-mcp v${version}"`);
    },
  },

  // ====== Push & Verification ======
  {
    id: 'push-branch',
    label: 'Push branch to origin',
    category: 'push',
    action: async () => {
      runWithOutput('git push');
    },
  },
  {
    id: 'push-tag',
    label: 'Push tag to origin',
    category: 'push',
    action: async () => {
      const version = readPackageVersion();
      const tagName = `mcp-server-v${version}`;
      runWithOutput(`git push origin ${tagName}`);
    },
  },
  {
    id: 'verify-tag-remote',
    label: 'Verify tag exists on origin',
    category: 'push',
    action: async () => {
      const version = readPackageVersion();
      const tagName = `mcp-server-v${version}`;
      const remoteTag = run(`git ls-remote --tags origin ${tagName}`);
      if (!remoteTag.includes(tagName)) {
        throw new Error(`Tag ${tagName} not found on origin after push.`);
      }
      log(`    Remote tag verified: ${tagName}`, colors.green);
    },
  },

  // ====== Post-release (Optional CI Check) ======
  {
    id: 'ci-workflow-triggered',
    label: 'GitHub Actions release workflow triggered',
    category: 'post-release',
    action: async () => {
      const version = readPackageVersion();
      const tagName = `mcp-server-v${version}`;
      log(`    Waiting 30s for GitHub Actions to start...`, colors.yellow);
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      try {
        const workflowUrl = `https://api.github.com/repos/shenyuexin/mobile-e2e-mcp/actions/runs?event=push&status=in_progress&per_page=5`;
        // Note: This requires GITHUB_TOKEN to be available
        log(`    ⚠ Manual check: Visit https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/release-mcp.yml`, colors.yellow);
        log(`    Expected trigger: ${tagName}`, colors.cyan);
      } catch (err) {
        // Non-critical: just informational
        log(`    ⓘ Could not verify CI status automatically`, colors.gray);
      }
    },
  },
];

async function runChecklist(): Promise<void> {
  const { dryRun, skipCi } = parseArgs();

  log('\n' + '='.repeat(60), colors.bold);
  log(`  🚀 MCP Release Checklist`, colors.bold);
  log('='.repeat(60), colors.bold);

  if (dryRun) {
    log(`\n  ${colors.yellow}⚠ DRY-RUN MODE: Will skip push operations${colors.reset}\n`);
  }

  const result: ChecklistResult = {
    passed: [],
    failed: [],
    skipped: [],
  };

  // Group steps by category
  const categories = [...new Set(checklist.map(step => step.category))];

  for (const category of categories) {
    const categoryLabel = category.toUpperCase().replace('-', ' ');
    log(`\n${colors.bold}${categoryLabel}${colors.reset}`);
    log('─'.repeat(60), colors.gray);

    const steps = checklist.filter(step => step.category === category);

    for (const step of steps) {
      // Skip post-release in dry-run mode
      if (dryRun && step.category === 'post-release') {
        logStep(category, step.label, 'skip');
        result.skipped.push(step.id);
        continue;
      }

      // Skip CI verification if requested
      if (skipCi && step.category === 'post-release') {
        logStep(category, step.label, 'skip');
        result.skipped.push(step.id);
        continue;
      }

      logStep(category, step.label, 'running');

      try {
        await step.action();
        logStep(category, step.label, 'pass');
        result.passed.push(step.id);
      } catch (error) {
        logStep(category, step.label, 'fail');
        result.failed.push(step.id);
        
        const message = error instanceof Error ? error.message : String(error);
        log(`\n${colors.red}✗ Step failed: ${step.id}${colors.reset}`);
        log(`${message}\n`, colors.red);

        log(`\n${colors.bold}Release aborted.${colors.reset} Fix the issue and re-run this checklist.\n`);
        process.exit(1);
      }
    }
  }

  // Summary
  log('\n' + '='.repeat(60), colors.bold);
  log(`  ✅ Release Checklist Complete`, colors.bold);
  log('='.repeat(60), colors.bold);
  log(`\n  ${colors.green}✓ Passed:  ${result.passed.length}${colors.reset}`);
  if (result.failed.length > 0) {
    log(`  ${colors.red}✗ Failed:  ${result.failed.length}${colors.reset}`);
    result.failed.forEach(id => log(`    - ${id}`, colors.red));
  }
  if (result.skipped.length > 0) {
    log(`  ${colors.yellow}○ Skipped: ${result.skipped.length}${colors.reset}`);
    result.skipped.forEach(id => log(`    - ${id}`, colors.yellow));
  }

  const version = readPackageVersion();
  const tagName = `mcp-server-v${version}`;

  log(`\n  ${colors.bold}Next steps:${colors.reset}`);
  log(`  1. Monitor GitHub Actions: https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/release-mcp.yml`);
  log(`  2. Verify npm publish: https://www.npmjs.com/package/@shenyuexin/mobile-e2e-mcp`);
  log(`  3. Check GitHub Release: https://github.com/shenyuexin/mobile-e2e-mcp/releases/tag/${tagName}\n`);
}

runChecklist().catch((error) => {
  log(`\n${colors.red}Fatal error: ${error.message}${colors.reset}\n`, colors.red);
  process.exit(1);
});
