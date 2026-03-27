import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const GUARDED_PREFIXES = [
  'packages/contracts/',
  'packages/core/',
  'packages/mcp-server/',
  'configs/'
];

const GUARDED_PATTERNS = [
  /^packages\/adapter-[^/]+\//,
  /^docs\/architecture\//,
  /^docs\/engineering\/(ai-first-capability-expansion-guideline|capability-family-inventory|adapter-maestro-index-decomposition-implementation-playbook\.zh-CN)\.md$/
];

const GUARDED_FILES = new Set([
  'README.md',
  'README.zh-CN.md',
  'docs/README.md'
]);

const PLACEHOLDER_VALUES = new Map([
  ['Capability category', 'state / action / evidence / diagnosis / recovery / infra-only'],
  ['Platforms/frameworks affected', 'Android / iOS / React Native / Flutter / docs-only'],
  ['Support boundary change', 'none / contract-ready / experimental / reproducible-demo / ci-verified'],
  ['AI-first capability guideline consulted', 'yes / no (if no, why not applicable)'],
  ['Public docs / canonical guide update', 'yes / no / not-needed (why)']
]);

function isGuardedPath(filePath) {
  return GUARDED_PREFIXES.some((prefix) => filePath.startsWith(prefix))
    || GUARDED_PATTERNS.some((pattern) => pattern.test(filePath))
    || GUARDED_FILES.has(filePath);
}

function normalizeBody(body) {
  return (body ?? '').replace(/\r\n/g, '\n');
}

function extractField(body, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^- ${escapedLabel}:\\s*(.*)$`, 'mi');
  const match = body.match(regex);
  return match ? match[1].trim() : null;
}

function isMeaningfulValue(label, value) {
  if (!value) {
    return false;
  }

  const placeholder = PLACEHOLDER_VALUES.get(label);
  if (placeholder && value === placeholder) {
    return false;
  }

  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue !== 'tbd'
    && normalizedValue !== 'todo'
    && normalizedValue !== 'n/a'
    && normalizedValue !== 'na';
}

export function validatePullRequestGate({ body, changedFiles }) {
  const guardedFiles = changedFiles.filter(isGuardedPath);
  if (guardedFiles.length === 0) {
    return {
      guardedFiles,
      errors: [],
      skipped: true,
      summary: 'No guarded capability paths changed; PR body gate skipped.'
    };
  }

  const normalizedBody = normalizeBody(body);
  const requiredLabels = [
    'Capability category',
    'User-visible or AI-facing behavior change',
    'Platforms/frameworks affected',
    'Support boundary change',
    'AI-first capability guideline consulted',
    'Capability truth source checked',
    'Public docs / canonical guide update'
  ];

  const errors = [];

  if (!normalizedBody.includes('## Capability impact')) {
    errors.push('Missing `## Capability impact` section in the PR description.');
  }

  for (const label of requiredLabels) {
    const value = extractField(normalizedBody, label);
    if (!isMeaningfulValue(label, value)) {
      errors.push(`Fill in PR field: \`${label}: ...\` with a non-placeholder value.`);
    }
  }

  return {
    guardedFiles,
    errors,
    skipped: false,
    summary: errors.length === 0
      ? 'Capability gate passed for guarded paths.'
      : 'Capability gate failed: guarded paths changed but required PR metadata is incomplete.'
  };
}

async function fetchChangedFiles({ owner, repo, pullNumber, token }) {
  const files = [];
  let page = 1;

  while (true) {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100&page=${page}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch changed files for PR #${pullNumber}: ${response.status} ${response.statusText}`);
    }

    const pageFiles = await response.json();
    files.push(...pageFiles.map((file) => file.filename));

    if (pageFiles.length < 100) {
      return files;
    }

    page += 1;
  }
}

async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;

  if (!eventPath || !repository || !token) {
    throw new Error('GITHUB_EVENT_PATH, GITHUB_REPOSITORY, and GITHUB_TOKEN are required.');
  }

  const event = JSON.parse(await readFile(eventPath, 'utf8'));
  const pullRequest = event.pull_request;
  if (!pullRequest) {
    throw new Error('This script only supports pull_request events.');
  }

  const [owner, repo] = repository.split('/');
  const changedFiles = await fetchChangedFiles({
    owner,
    repo,
    pullNumber: pullRequest.number,
    token
  });

  const result = validatePullRequestGate({
    body: pullRequest.body ?? '',
    changedFiles
  });

  process.stdout.write(`${result.summary}\n`);
  if (result.guardedFiles.length > 0) {
    process.stdout.write(`Guarded files:\n- ${result.guardedFiles.join('\n- ')}\n`);
  }

  if (result.errors.length > 0) {
    process.stdout.write(`\nRequired PR updates:\n- ${result.errors.join('\n- ')}\n`);
    process.exitCode = 1;
  }
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectExecution) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
