/**
 * Generate coverage report from V8 coverage data.
 * Works around c8 CLI yargs/ESM incompatibility on Node.js v25.
 *
 * Usage: node scripts/coverage-report.cjs [coverage-data-dir] [src-dir]
 */
'use strict';

const { Report } = require('c8');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const dataDir = process.argv[2] || path.join(rootDir, 'coverage', 'data');
const srcDir = process.argv[3] || 'src';

// Load .c8rc.json
const c8rcPath = path.join(rootDir, '.c8rc.json');
const c8rc = fs.existsSync(c8rcPath) ? JSON.parse(fs.readFileSync(c8rcPath, 'utf-8')) : {};

if (!fs.existsSync(dataDir)) {
  console.error('Coverage data not found: ' + dataDir);
  console.error('Run tests with NODE_V8_COVERAGE=' + dataDir + ' first.');
  process.exit(1);
}

const report = Report({
  reporter: c8rc.reporter || ['text', 'html'],
  reportsDirectory: path.join(path.dirname(dataDir), 'html'),
  tempDirectory: dataDir,
  watermarks: {
    lines: [50, 80],
    functions: [50, 80],
    branches: [50, 80],
    statements: [50, 80],
  },
  exclude: c8rc.exclude || [],
  all: c8rc.all !== false,
  include: ['**/*.ts'],
  src: [path.resolve(path.dirname(dataDir), srcDir)],
});

report.run().catch((err) => {
  console.error('Report generation failed:', err.message);
  process.exit(1);
});
