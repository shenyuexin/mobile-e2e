# Toggle Detection — iOS 26.0 Settings

**Date:** 2026-04-13
**Device:** iPhone 16 Plus (iOS 26.0 Simulator)
**Session:** session-1776061377689

---

## Key Finding: Toggle Elements Use `CheckBox` className

On iOS 26.0 Settings, toggle switches are NOT represented as `Switch` or `Image` elements. They use:

| Property | Value |
|----------|-------|
| `className` | `"CheckBox"` |
| `clickable` | `false` (important — NOT directly tappable via element tap) |
| `enabled` | `true` |
| `scrollable` | `false` |
| `role` | Not present in axe output (raw AX: `AXStaticText`-like) |
| `text` (AXValue) | `"0"` (off) or `"1"` (on) |
| `contentDesc` (AXLabel) | Human-readable label (e.g., "Grid", "Level", "Mirror Front Camera") |

### Toggle Layout Pattern

Each toggle renders as **two separate elements** in the hierarchy:

1. **Full-width row element** — spans most of the width (bounds: `[20, Y][410, Y+51]`)
   - Contains the label in `contentDesc`
   - Has `className: "CheckBox"`
   - Has `text: "0"` or `text: "1"`

2. **Right-aligned switch element** — smaller box on the right (bounds: `[339, Y+10][390, Y+41]`)
   - Same `className: "CheckBox"`
   - Same `contentDesc` and `text` values
   - This is the visual switch indicator

### Example Toggle Elements (from Camera settings)

```json
{
  "className": "CheckBox",
  "text": "0",
  "contentDesc": "Grid",
  "clickable": false,
  "enabled": true,
  "bounds": "[20,587.33][410,638.33]"
}
```

```json
{
  "className": "CheckBox",
  "text": "1",
  "contentDesc": "View Outside the Frame",
  "clickable": false,
  "enabled": true,
  "bounds": "[20,740.33][410,791.33]"
}
```

## Toggle Detection Heuristic (Updated for iOS 26.0)

```typescript
function isToggle(node: AUNode): boolean {
  // Primary check: CheckBox className with non-clickable
  if (node.className === "CheckBox" && !node.clickable) {
    return true;
  }
  
  // Fallback: Button with AXValue of "On"/"Off" (like "Live Speech" in Accessibility)
  if (node.className === "Button" && 
      (node.text === "On" || node.text === "Off")) {
    return true;
  }
  
  return false;
}
```

## Element Types Found in iOS 26.0 Settings

| elementType (className) | Count (home screen) | Role | Navigable? |
|------------------------|---------------------|------|------------|
| `Application` | 1 | Root container | No |
| `Heading` | 1 | "Settings" title | No |
| `TextField` | 1 | Search field | No |
| `Button` | 14 | All navigable rows + back button | **Yes** (except back) |
| `CheckBox` | 0 (home), 10 (Camera) | Toggle switches | **No** |
| `StaticText` | 1+ | Description text | No |
| `GenericElement` | 0 (home), 2+ (Camera) | Description blocks | No |
| `Group` | 1 | Layout container | No |

## Spec Rule Validation (§4.4 Heuristics)

| Rule | Validates? | Notes |
|------|-----------|-------|
| `elementType === 'Cell'` for list items | **NO** — iOS 26.0 uses `Button` for all navigable rows | Older iOS versions may use `Cell`, but iOS 26.0 uses `Button` exclusively |
| `elementType === 'Switch'` for toggles | **NO** — iOS 26.0 uses `CheckBox` with `clickable: false` | No `Switch` elements found anywhere |
| Toggle: `text === 'On' \| 'Off'` | **PARTIAL** — works for Button-style toggles (Live Speech), but CheckBox toggles use `text: '0'` / `text: '1'` | Need dual detection |
| Navigation hint text regex | N/A | iOS 26.0 Settings rows do not show detail text like "On" or "Off" on the home screen |
| Section header detection | **YES** — `Heading` type with uppercase text (VISION, COMPOSITION, etc.) | Reliable |

## Action Items from Validation

1. **UPDATE** toggle detection: Add `className === "CheckBox"` check as primary heuristic
2. **UPDATE** navigable element detection: `Button` is the primary navigable type (not `Cell`)
3. **ADD** dedup exclusion: CheckBox elements should be excluded from navigation candidates
4. **ADD** dedup exclusion: Heading elements should be excluded from navigation candidates
5. **ADD** dedup exclusion: GenericElement should be excluded from navigation candidates
6. **CONFIRM** the `accessibilityId` pattern `com.apple.settings.*` is reliable for targeting

## Decision Gate 2: Are element type rules viable?

**PASS with updates** — Toggle cells ARE distinguishable from navigable cells:
- Toggles: `className: "CheckBox"`, `clickable: false`
- Navigable: `className: "Button"`, `clickable: true`

However, the spec's assumed element types (`Cell`, `Switch`) do NOT match iOS 26.0 reality. The detection logic must be updated to use `Button` and `CheckBox` respectively.

---

## Raw Toggle Element Data (Camera page)

Full list of all 5 toggle pairs (10 CheckBox elements total — 2 per toggle):

| # | Label | Value (0=Off, 1=On) | Row Bounds | Switch Bounds |
|---|-------|---------------------|------------|---------------|
| 1 | Grid | 0 | [20,587.33][410,638.33] | [339,597.33][390,628.33] |
| 2 | Level | 0 | [20,638.33][410,689.33] | [339,648.33][390,679.33] |
| 3 | Mirror Front Camera | 0 | [20,689.33][410,740.33] | [339,699.33][390,730.33] |
| 4 | View Outside the Frame | 1 | [20,740.33][410,791.33] | [339,750.33][390,781.33] |
| 5 | Portraits in Photo Mode | 1 | [20,854.00][410,905.00] | [339,864.00][390,895.00] |
