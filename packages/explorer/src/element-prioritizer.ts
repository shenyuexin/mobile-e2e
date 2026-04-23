/**
 * Element filtering and prioritization for the explorer engine.
 *
 * Incorporates spike findings from docs/spike/toggle-detection.md:
 * - iOS 26.0 uses `Button` (not `Cell`) for all navigable rows
 * - Toggle switches use `CheckBox` className with `clickable: false`
 * - Section headings are `Heading` type with UPPERCASE text
 * - Home-screen sections have stable `AXUniqueId` in format `com.apple.settings.{name}`
 *
 * SPEC §4.4 — Toggle detection and destructive element filtering.
 */

import type {
  UiHierarchy,
  ClickableTarget,
  ElementSelector,
  ExplorerConfig,
  DestructiveActionPolicy,
} from "./types.js";

// ---------------------------------------------------------------------------
// Type classification sets (iOS 26.0 spike data)
// ---------------------------------------------------------------------------

/**
 * Element types considered interactive/navigable.
 *
 * iOS 26.0 spike finding: `Button` is the primary navigable type
 * (not `Cell` as older specs assumed). `Cell` is included for backward
 * compatibility with older iOS versions and Android.
 *
 * Cross-platform note: Android className values are fully-qualified
 * (e.g., `android.widget.Button`). Use `shortClassName()` to normalize.
 */
const INTERACTIVE_TYPES = new Set([
  "Button",
  "Cell",
  "ListItem",
  "Link",
  "Image",
  // Android fully-qualified class names
  "android.widget.Button",
  "android.widget.ListView",
  "android.widget.AdapterView",
  "android.widget.ImageButton",
]);

/**
 * Element types that are toggle switches.
 *
 * iOS 26.0 spike finding: toggles use `CheckBox` className with
 * `clickable: false`, NOT `Switch` as the spec originally assumed.
 *
 * Cross-platform note: Android className values are fully-qualified.
 */
const TOGGLE_TYPES = new Set([
  "Switch",
  "Toggle",
  "CheckBox",
  // Android fully-qualified class names
  "android.widget.Switch",
  "android.widget.CheckBox",
  "android.widget.CompoundButton",
  "android.widget.ToggleButton",
]);

/** Element types that accept text input. */
const TEXT_INPUT_TYPES = new Set([
  "TextField",
  "SecureTextField",
  "TextView",
  "SearchField",
  // Android fully-qualified class names
  "android.widget.EditText",
  "android.widget.AutoCompleteTextView",
  "android.widget.MultiAutoCompleteTextView",
]);

/** Element types that are never interactive. */
const NON_INTERACTIVE_TYPES = new Set([
  "StaticText",
  "Separator",
  "ActivityIndicator",
  "ProgressBar",
  "ScrollView",
  "Group",
  "GenericElement",
  "Heading",
  "Application",
  // Android fully-qualified class names
  "android.widget.TextView",
  "android.widget.ImageView",
  "android.view.View",
  "android.view.ViewGroup",
  "android.widget.FrameLayout",
  "android.widget.LinearLayout",
  "android.widget.RelativeLayout",
  "android.widget.ScrollView",
  "androidx.recyclerview.widget.RecyclerView",
  "android.widget.Space",
]);

/** Patterns for destructive operation labels (SPEC §4.4, R1-#1).
 * 
 * These patterns are GENERIC — they apply to ANY app, not just Settings.
 * Covers: delete, remove, reset, clear, sign out, logout, erase, factory reset,
 * uninstall, offload, transfer/restore, restart, clear data.
 */
const DESTRUCTIVE_PATTERNS = [
  // Delete/remove operations
  /delete\s*(account|data|all|history|messages?|photos?|videos?|files?|app)?/i,
  /remove\s*(account|data|all|history)?/i,
  /erase\s*(all\s*)?(content|data|everything|device)?/i,
  
  // Reset/restart operations
  /reset\s*(all\s*)?(settings?|network|keyboard|dictionary|location|privacy|warnings|advertising|home\s*layout)?/i,
  /reset\s*to\s*(default|original|factory)/i,
  /factory\s*reset/i,
  /restart\s*(device|app|phone)?/i,
  /reboot\s*(device)?/i,
  
  // Transfer/restore operations (iOS: Transfer or Reset iPhone)
  /transfer\s*(or\s*reset)?/i,
  /restore\s*(from\s*backup)?/i,
  
  // Clear operations
  /clear\s*(all\s*)?(data|cache|storage|history|cookies?|search)?/i,
  
  // Sign out/logout
  /sign\s*out/i,
  /log\s*out/i,
  /logoff/i,
  /sign\s*off/i,
  
  // Uninstall/offload
  /uninstall/i,
  /offload\s*(app|everything)?/i,
  /delete\s*app/i,
];

/** Patterns for external link labels (likely to open Safari or other external apps).
 * 
 * These patterns are GENERIC — they apply to ANY app, not just Settings.
 * Covers: learn more, more info, visit website, open in, documentation,
 * support page, terms of service, privacy policy.
 * 
 * Config note: External link depth is controlled by config.externalLinkMaxDepth (default: 1).
 */
const EXTERNAL_LINK_PATTERNS = [
  /learn\s*more/i,
  /more\s*info/i,
  /more\s*information/i,
  /visit\s*(website|page|link)?/i,
  /open\s*(in|with)/i,
  /documentation/i,
  /support\s*page/i,
  /terms\s*(of\s*service)?/i,
  /privacy\s*(policy)?/i,
  /help\s*page/i,
  /user\s*guide/i,
  /manual/i,
];

const NAVIGATION_CONTROL_PATTERNS = [
  /^back$/i,
  /^cancel$/i,
  /^done$/i,
  /^close$/i,
  /^xmark$/i,
];

/**
 * Check if an element is likely an external link (opens another app).
 * 
 * Uses two signals:
 * 1. Element type is "Link" or "AXLink"
 * 2. Label matches one of the EXTERNAL_LINK_PATTERNS
 * 
 * Returns true if both signals are present, or if label strongly matches.
 */
export function isExternalLinkCandidate(el: UiHierarchy): boolean {
  const label = el.text || el.accessibilityLabel || el.contentDesc || el.label || '';
  const elementType = el.elementType || el.className || '';
  const isLinkType = elementType.toLowerCase().includes('link');
  
  // Check if label matches external link patterns
  const labelMatch = EXTERNAL_LINK_PATTERNS.some(pattern => pattern.test(label));
  
  // Strong match: Link type + external label
  if (isLinkType && labelMatch) return true;
  
  // Moderate match: very explicit external label (e.g., "Open in Safari")
  if (/open\s*in|launch|external|browser/i.test(label)) return true;
  
  return false;
}

// ---------------------------------------------------------------------------
// Classification functions
// ---------------------------------------------------------------------------

/**
 * Check if an element is a toggle switch that should be excluded.
 *
 * iOS 26.0 spike data: CheckBox with clickable=false is the primary toggle pattern.
 * Also handles Button-style toggles with AXValue "On"/"Off".
 *
 * SPEC §4.4 — toggles must be excluded from clickable elements.
 */
export function isToggle(el: UiHierarchy): boolean {
  // Primary: CheckBox className with non-clickable (iOS 26.0 pattern)
  if (el.className === "CheckBox" && !el.clickable) {
    return true;
  }

  // Type-based check
  if (TOGGLE_TYPES.has(el.elementType ?? "") || TOGGLE_TYPES.has(el.className ?? "")) {
    return true;
  }

  // Accessibility traits
  if (
    el.accessibilityTraits?.includes("toggleButton") ||
    el.accessibilityTraits?.includes("switch") ||
    el.accessibilityRole === "toggle" ||
    el.accessibilityRole === "switch"
  ) {
    return true;
  }

  // Button-style toggles with On/Off AXValue (e.g., "Live Speech" in Accessibility)
  if (
    el.className === "Button" &&
    (el.AXValue === "On" ||
      el.AXValue === "Off" ||
      el.AXValue === "on" ||
      el.AXValue === "off")
  ) {
    return true;
  }

  // CheckBox with text values "0" (off) or "1" (on) — iOS 26.0 toggle pattern
  if (
    el.className === "CheckBox" &&
    (el.text === "0" || el.text === "1")
  ) {
    return true;
  }

  // Android: Switch/CheckBox with `checked` property (from uiautomator dump)
  const cn = el.className ?? "";
  if (
    (cn.includes("Switch") || cn.includes("CheckBox") || cn.includes("ToggleButton") || cn.includes("CompoundButton")) &&
    el.checked !== undefined
  ) {
    return true;
  }

  return false;
}

/**
 * Check if an element is a text input field.
 */
export function isTextInput(el: UiHierarchy): boolean {
  if (TEXT_INPUT_TYPES.has(el.elementType ?? "") || TEXT_INPUT_TYPES.has(el.className ?? "")) {
    return true;
  }
  if (el.accessibilityTraits?.includes("allowsDirectInteraction")) {
    return true;
  }
  // Search fields are text inputs
  if (
    el.accessibilityRole === "searchField" ||
    el.className === "TextField" ||
    el.className === "SearchField"
  ) {
    return true;
  }
  return false;
}

/**
 * Check if an element is non-interactive (static text, images, separators, etc.).
 */
export function isNonInteractive(el: UiHierarchy): boolean {
  // StaticText without link trait
  if (
    (el.elementType === "StaticText" || el.className === "StaticText") &&
    !el.accessibilityTraits?.includes("link") &&
    el.accessibilityRole !== "link"
  ) {
    return true;
  }

  // Image without button trait
  if (
    (el.elementType === "Image" || el.className === "Image") &&
    !el.accessibilityTraits?.includes("button") &&
    el.accessibilityRole !== "button"
  ) {
    return true;
  }

  // Heading elements (section headers) — non-navigable
  if (
    el.elementType === "Heading" ||
    el.className === "Heading" ||
    el.accessibilityRole === "heading"
  ) {
    return true;
  }

  // Generic layout containers
  if (
    NON_INTERACTIVE_TYPES.has(el.elementType ?? "") ||
    NON_INTERACTIVE_TYPES.has(el.className ?? "")
  ) {
    // Android often marks navigable rows as clickable FrameLayout/ViewGroup containers.
    // Preserve those actionable wrappers instead of discarding them as purely structural.
    return !el.clickable;
  }

  return false;
}

/**
 * Check if an element is destructive (delete, reset, sign out, etc.).
 * SPEC §4.4, R1-#1.
 */
export function isDestructive(
  el: UiHierarchy,
  policy: DestructiveActionPolicy,
): boolean {
  if (policy === "allow") return false;

  const label = getElementLabel(el).toLowerCase();
  return DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(label));
}

/**
 * Check if an element is interactive (navigable/clickable).
 */
export function isInteractive(el: UiHierarchy): boolean {
  if (el.clickable) return true;
  if (el.elementType && INTERACTIVE_TYPES.has(el.elementType)) return true;
  if (el.className && INTERACTIVE_TYPES.has(el.className)) return true;
  if (
    el.accessibilityTraits?.some(
      (t) => t === "button" || t === "link" || t === "playsSound",
    )
  ) {
    return true;
  }
  if (el.accessibilityRole === "button" || el.accessibilityRole === "link") {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Tree traversal
// ---------------------------------------------------------------------------

/**
 * Flatten a UI hierarchy tree into a flat array of all nodes.
 */
export function flattenTree(node: UiHierarchy, result: UiHierarchy[] = []): UiHierarchy[] {
  result.push(node);
  if (node.children) {
    for (const child of node.children) {
      flattenTree(child, result);
    }
  }
  return result;
}

/**
 * Collect all visible text from a UI tree.
 */
export function collectVisibleTexts(
  node: UiHierarchy,
  result: string[] = [],
): string[] {
  if (node.visibleTexts) {
    result.push(...node.visibleTexts);
  }
  if (node.text && !isDecorative(node)) {
    result.push(node.text);
  }
  if (node.contentDesc && !isDecorative(node)) {
    result.push(node.contentDesc);
  }
  if (node.children) {
    for (const child of node.children) {
      collectVisibleTexts(child, result);
    }
  }
  return result;
}

/** Check if a node is decorative/structural rather than content. */
function isDecorative(node: UiHierarchy): boolean {
  // Exclude system bars, status indicators, separators
  if (node.elementType === "Separator" || node.className === "Separator") {
    return true;
  }
  if (node.accessibilityTraits?.includes("notEnabled")) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get a human-readable label for a UI element.
 * Uses fallback chain: contentDesc > accessibilityLabel > text > visibleTexts.
 * For container elements without direct text, recursively checks child nodes
 * to aggregate readable labels (common in Android list-item layouts where
 * the clickable wrapper has no text but children do).
 */
export function getElementLabel(el: UiHierarchy): string {
  return getSemanticLabel(el) || el.className || el.elementType || "unknown";
}

function getSemanticLabel(el: UiHierarchy): string | undefined {
  const direct =
    el.contentDesc ||
    el.accessibilityLabel ||
    el.label ||
    el.text ||
    el.visibleTexts?.[0];
  if (direct) return direct;

  if (el.children) {
    for (const child of el.children) {
      const childLabel = getSemanticLabel(child);
      if (childLabel) return childLabel;
    }
  }

  return undefined;
}

function getDirectSemanticLabel(el: UiHierarchy): string | undefined {
  return (
    el.contentDesc ||
    el.accessibilityLabel ||
    el.label ||
    el.text ||
    el.visibleTexts?.[0]
  );
}

function isNavigationControlLabel(label: string): boolean {
  return NAVIGATION_CONTROL_PATTERNS.some((pattern) => pattern.test(label.trim()));
}

function isAndroidElement(el: UiHierarchy): boolean {
  return (el.className || el.elementType || "").startsWith("android.");
}

function isAmbiguousAndroidResourceId(el: UiHierarchy): boolean {
  if (!isAndroidElement(el) || !el.resourceId) {
    return false;
  }

  return [
    /(^|:)id\/list$/i,
    /(^|:)id\/preference_access_point$/i,
  ].some((pattern) => pattern.test(el.resourceId ?? ""));
}

/**
 * Find all clickable elements in a UI tree, excluding toggles, text inputs,
 * non-interactive elements, and (optionally) destructive elements.
 *
 * SPEC §4.2 — requires config for destructive element filtering.
 */
export function findClickableElements(
  uiTree: UiHierarchy,
  config: ExplorerConfig,
): ClickableTarget[] {
  const allElements = flattenTree(uiTree);
  return allElements
    .filter((el) => {
      // Must be interactive
      if (!isInteractive(el)) return false;
      // Exclude toggles (SPEC §4.4)
      if (isToggle(el)) return false;
      // Exclude text inputs
      if (isTextInput(el)) return false;
      // Exclude non-interactive
      if (isNonInteractive(el)) return false;
      // Exclude destructive elements based on policy (SPEC §4.4, R1-#1)
      if (isDestructive(el, config.destructiveActionPolicy)) return false;
      // Exclude search trigger buttons (open search mode, not a navigable page)
      if (isSearchTrigger(el)) return false;
      const elLabel = getElementLabel(el);
      if ((el.resourceId || '').includes('primaryAppleAccount')) return false;
      if ((el.resourceId || '').includes('account_category')) return false;
      if ((el.resourceId || '').includes('historic_record')) return false;
      if (isAndroidElement(el) && /(^wi-fi([,\s]|$))|(scan to connect to wi-fi)/i.test(elLabel)) {
        return false;
      }
      if (isNavigationControlLabel(elLabel)) return false;
      const containerClassPattern = /^(android\.(view|widget)\.)?(FrameLayout|LinearLayout|RelativeLayout|ViewGroup|View)$/;
      const hasStableId = !!(
        el.resourceId ||
        el.contentDesc ||
        el.accessibilityLabel ||
        el.text ||
        getSemanticLabel(el)
      );
      if (containerClassPattern.test(el.className || '') && !hasStableId) {
        return false;
      }
      return true;
    })
    .map((el) => toClickableTarget(el));
}

/**
 * Detect search trigger buttons — elements that open search mode instead of navigating to a page.
 *
 * These open an in-place search overlay, not a new screen. Back navigation from search mode
 * requires tapping "Cancel", not the standard app-level back button.
 *
 * Detection: Button with "search" or "dictate" label (iOS Dictate button opens search overlay).
 */
function isSearchTrigger(el: UiHierarchy): boolean {
  const label = (getSemanticLabel(el) || "").toLowerCase();

  if ((label === "search" || label === "dictate") && (el.className === "Button" || el.accessibilityRole === "AXButton")) {
    return true;
  }

  const allText = [label, el.elementType]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (allText.includes("search") || allText.includes("dictate")) {
    return true;
  }

  const resId = (el.resourceId || "").toLowerCase();
  if (resId.includes("search") && el.clickable) {
    return true;
  }

  return false;
}

/**
 * Convert a UiHierarchy node to a ClickableTarget.
 */
export function toClickableTarget(el: UiHierarchy): ClickableTarget {
  return {
    label: getElementLabel(el),
    selector: buildSelector(el),
    elementType: el.elementType ?? el.className ?? "Unknown",
    isExternalLink: isExternalLinkCandidate(el),
  };
}

/**
 * Build an element selector with priority ordering:
 * resourceId (AXUniqueId) > accessibilityLabel > text > position.
 * 
 * iOS note: AXUniqueId is normalized to resourceId by the iOS backend,
 * NOT to contentDesc. Use resourceId for stable iOS element matching.
 */
export function buildSelector(el: UiHierarchy): ElementSelector {
  // Priority 1: AXUniqueId / resourceId (most stable, works on both iOS and Android)
  if (el.AXUniqueId) {
    return { resourceId: el.AXUniqueId };
  }
  if (el.resourceId && !isAmbiguousAndroidResourceId(el)) {
    return { resourceId: el.resourceId };
  }
  
  // Priority 2: accessibility label / content description
  if (el.accessibilityLabel) {
    return { contentDesc: el.accessibilityLabel };
  }
  if (el.contentDesc) {
    return { contentDesc: el.contentDesc };
  }

  const directText = getDirectSemanticLabel(el);
  if (directText) {
    return { text: directText, elementType: el.elementType ?? el.className };
  }

  // Priority 3b: container elements with descendant labels should tap by center point,
  // because the wrapper itself often has no direct text selector on Android.
  if (el.frame) {
    return {
      position: {
        x: Math.round(el.frame.x + el.frame.width / 2),
        y: Math.round(el.frame.y + el.frame.height / 2),
      },
      elementType: el.elementType ?? el.className,
    };
  }

  // Last resort: use className/elementType as text (will likely fail resolve)
  return { text: el.className ?? el.elementType ?? "unknown" };
}

/**
 * Prioritize elements for exploration order.
 * Higher priority score = explored first.
 *
 * Current implementation: flat priority (all elements score 10).
 * Future: could prioritize based on position, size, or semantic importance.
 */
export function prioritizeElements(
  elements: ClickableTarget[],
): ClickableTarget[] {
  return [...elements].map((el) => ({
    ...el,
    priority: el.priority ?? priorityScore(el),
  }));
}

/**
 * Calculate priority score for an element.
 * Default: 10 for all elements (flat priority).
 */
export function priorityScore(_el: ClickableTarget): number {
  return 10;
}
