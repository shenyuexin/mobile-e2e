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

When updating a fixture, regenerate or replace the matching `.png` and keep the paired `.observations.json` in sync with the visual content.
