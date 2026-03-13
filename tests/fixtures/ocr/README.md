# OCR Fixture Provenance

Each OCR fixture in this directory is a triad:

- `*.svg` - editable source for the screenshot-style fixture
- `*.png` - runtime-facing screenshot asset used by the semi-real tests
- `*.observations.json` - normalized MacVision-style OCR observations paired with the PNG

Current mappings:

- `signin-success.*` - deterministic miss -> OCR assert success
- `continue-success.*` - OCR tap success with post-verification success
- `continue-low-confidence.*` - OCR low-confidence safe fail
- `continue-ambiguous.*` - OCR ambiguity safe fail

When updating a fixture, use this maintenance loop:

1. Edit the source `.svg`
2. Run `pnpm fixtures:ocr:sync --dry-run [fixture-name...]` on macOS to preview whether the triad would change
3. Run `pnpm fixtures:ocr:sync [fixture-name...]` on macOS to regenerate `.png` and `.observations.json`
4. Run `pnpm validate:ocr-fixtures` on any platform, or `pnpm fixtures:ocr:check` on macOS, to verify the triad is in sync

Smoke coverage:

- `pnpm test:ocr-smoke` runs the real `MacVisionOcrProvider` against `signin-success.png`
- `.github/workflows/ocr-smoke.yml` is path-gated to OCR-related files and is intentionally separate from the default Ubuntu CI lane
