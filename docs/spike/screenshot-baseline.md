# Screenshot Baseline — iOS 26.0 Settings

**Date:** 2026-04-13
**Device:** iPhone 16 Plus (iOS 26.0 Simulator)
**Session:** session-1776061377689

---

## Screenshot Specifications

| Property | Value |
|----------|-------|
| Resolution | 1290 x 2796 pixels |
| Point size | 430 x 932 points (@3x) |
| Format | PNG |
| File size | ~271 KB |
| Capture method | `xcrun simctl io {udid} screenshot {path}` |
| Readability | Text legible at 50% zoom |

## Screenshots Captured

| # | Page | File Path | Notes |
|---|------|-----------|-------|
| 1 | Settings Home Screen | `artifacts/screenshots/session-1776061377689/ios-phase1.png` | Shows 13 top-level sections, Apple Account (not signed in), search bar |

## Visual Characteristics for Dedup

### Home Screen Layout

```
+------------------------------------------+
| [Status bar: time, signal, battery]      |
|                                          |
| Settings                    (Heading)    |
| [Search..................] [mic]         |
|                                          |
| +--------------------------------------+ |
| | [Avatar] Apple Account               | |
| |           Sign in to access...       | |
| +--------------------------------------+ |
|                                          |
| +--------------------------------------+ |
| | > General                            | |
| +--------------------------------------+ |
| | > Accessibility                      | |
| +--------------------------------------+ |
| | > Action Button                      | |
| +--------------------------------------+ |
| | > Apple Intelligence & Siri          | |
| +--------------------------------------+ |
| | > Camera                             | |
| +--------------------------------------+ |
| | > Home Screen & App Library          | |
| +--------------------------------------+ |
| | > Search                             | |
| +--------------------------------------+ |
| | > StandBy                            | |
| +--------------------------------------+ |
|                                          |
| +--------------------------------------+ |
| | > Screen Time                        | |
| +--------------------------------------+ |
| | > Privacy & Security                 | |
| +--------------------------------------+ |
| | > Game Center                        | |
| +--------------------------------------+ |
| | > iCloud                             | |
| +--------------------------------------+ |
+------------------------------------------+
```

### Sub-Page Layout Pattern

All Settings sub-pages follow a consistent pattern:
1. **Navigation bar**: Back button ("Settings" text + chevron) on left, page title centered
2. **Page title**: Large Heading element
3. **Description**: StaticText with page description (optional)
4. **Content rows**: List of Button elements (navigable) or CheckBox elements (toggles)
5. **Section headings**: Heading elements with UPPERCASE text group related items

### Dynamic Elements (Change Between Captures)

These elements change between screenshots of the same page and should be masked for pixelmatch:
1. **Status bar**: Time, battery level, signal strength
2. **Live Speech toggle value**: Changes based on toggle state
3. **Any time/date display**: In About page, Screen Time, etc.

### Static Elements (Consistent Across Captures)

These elements remain the same and are useful for dedup:
1. **Section labels**: "General", "Accessibility", etc.
2. **Row labels**: "About", "Camera", "Grid", etc.
3. **Section headings**: "VISION", "COMPOSITION", etc.
4. **Page titles**: Large heading text
5. **Layout structure**: Row heights, spacing, grouping

## Decision Gate 5: Is pixelmatch threshold empirically grounded?

**NOT FULLY TESTED** — Only 1 screenshot was captured per page during this spike. The plan requires 10+ screenshots of the same page at different times to measure pixelmatch mismatch distribution.

**Recommendation for Phase 25-01:**
1. Capture 10+ screenshots of the Settings home screen at 30-second intervals
2. Run pixelmatch on all pairs with normalization
3. Record mismatch ratio distribution
4. Set threshold at p95 of the distribution (expected < 0.05 for same-page captures)
5. Mask the status bar region (top ~50 pixels) to eliminate time/battery differences

## Decision Gate 7: Are system dialogs detectable?

**NOT TESTED** — No permission dialogs were triggered during this spike. The Settings app on a clean simulator does not prompt for permissions.

**Recommendation for Phase 25-01:**
1. Navigate to Privacy & Security → Location Services to potentially trigger a dialog
2. Run `inspect_ui` on any dialog that appears
3. Check for `accessibilityRole: 'alert'` or `role_description: 'alert'`
4. Record the structural marker for `isSystemDialog()` detection

## Decision Gate 6: Does sharp install cleanly?

**NOT TESTED** — This spike focused on MCP tool execution. The `sharp` npm package installation should be tested during Phase 25-01 engine setup.

---

## Visual Dedup Strategy Recommendations

Based on the observed page structures:

1. **Primary dedup key**: Page title (Heading text) + navigation depth
   - Example: "General" at depth 1 is unique; "About" at depth 2 under "General" is unique

2. **Secondary dedup key**: Ordered list of row labels (Button contentDesc values)
   - Two pages with the same title but different content will have different row lists
   - Two pages with different titles but same content are still unique (different user paths)

3. **Tertiary dedup key**: Screenshot structural hash (masking status bar)
   - For detecting truly duplicate pages that have the same visual appearance
   - Use pixelmatch or perceptual hash (pHash) on normalized screenshots

4. **Non-navigable exclusion list**:
   - `className === "CheckBox"` — toggle switches
   - `className === "Heading"` — section headers
   - `className === "StaticText"` — description text
   - `className === "GenericElement"` — description blocks
   - `role_description === "back button"` — navigation back
   - `className === "TextField"` — search fields
   - `className === "Application"` — root container
   - `className === "Group"` — layout containers
