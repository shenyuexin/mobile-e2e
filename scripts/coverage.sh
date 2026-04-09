#!/usr/bin/env bash
# Run tests with coverage and generate report.
# Works around c8 CLI yargs/ESM incompatibility on Node.js v25.
#
# Usage: scripts/coverage.sh [src-dir]
#   src-dir defaults to "src"
#
# Expects to be run from the package root directory.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="${1:-src}"
COVERAGE_DIR="coverage"
DATA_DIR="$COVERAGE_DIR/data"

# Clean previous coverage
rm -rf "$COVERAGE_DIR"
mkdir -p "$DATA_DIR"

# Run tests with V8 coverage collection
echo "Running tests with coverage..."
echo ""
NODE_V8_COVERAGE="$DATA_DIR" pnpm exec tsx --test test/*.test.ts || true

echo ""
echo "Generating coverage report..."
echo ""

# Generate report using c8's programmatic API
node "$SCRIPT_DIR/coverage-report.cjs" "$DATA_DIR" "$SRC_DIR"
