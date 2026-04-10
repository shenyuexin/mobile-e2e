#!/usr/bin/env node
/**
 * Local PR body validator — runs the same checks as the CI capability gate.
 * Usage: node scripts/validate-local-pr-body.mjs [path-to-pr-body-file]
 *
 * If no file is provided, reads from stdin.
 */

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { validatePullRequestGate } from './validate-pr-capability-gate.mjs';

const GUARDED_FILES = [
  'packages/contracts/src/types.ts',
  'packages/mcp-server/src/server.ts',
  'README.md'
];

async function main() {
  let body;
  const filePath = process.argv[2];
  if (filePath) {
    body = await readFile(filePath, 'utf8');
  } else {
    // Read from stdin
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks).toString('utf8');
  }

  if (!body.trim()) {
    console.error('Error: PR body is empty.');
    console.error('Usage: node scripts/validate-local-pr-body.mjs [path]');
    console.error('   or: echo "PR body..." | node scripts/validate-local-pr-body.mjs');
    process.exitCode = 1;
    return;
  }

  const result = validatePullRequestGate({
    body,
    changedFiles: GUARDED_FILES
  });

  if (result.skipped) {
    console.log('✓ No guarded paths in change set; gate skipped.');
    return;
  }

  if (result.errors.length === 0) {
    console.log('✓ Capability gate passed.');
    return;
  }

  console.error('✗ Capability gate failed:');
  for (const err of result.errors) {
    console.error(`  - ${err}`);
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
