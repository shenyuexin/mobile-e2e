/**
 * Action type constants for recording-mapper and replay-step-planner.
 *
 * Two types are defined here:
 * - SupportedActionType: the original 6-value subset (backward-compatible)
 * - ActionType: the full 12-value union (used by recording/replay internals)
 *
 * The old inline `type SupportedActionType` in types.ts is replaced by
 * re-exporting the 6-value type from here, keeping the same export path.
 */
export const ACTION_TYPES = {
  // Primary actions — match the original SupportedActionType (6 values)
  tapElement: "tap_element",
  typeIntoElement: "type_into_element",
  waitForUi: "wait_for_ui",
  launchApp: "launch_app",
  terminateApp: "terminate_app",
  swipe: "swipe",

  // Extended actions — used by recording-mapper / replay-step-planner (6 more)
  tap: "tap",
  assertNotVisible: "assert_not_visible",
  runSubFlow: "run_sub_flow",
  back: "back",
  home: "home",
  hideKeyboard: "hide_keyboard",
  stopApp: "stop_app",
  clearState: "clear_state",
} as const;

/** The full 14-value union — used internally by recording/replay layer. */
export type ActionType = typeof ACTION_TYPES[keyof typeof ACTION_TYPES];

/**
 * The original 6-value subset — kept for backward compatibility.
 * Consumers using this type will see no behavior change.
 */
export type SupportedActionType =
  | typeof ACTION_TYPES.tapElement
  | typeof ACTION_TYPES.typeIntoElement
  | typeof ACTION_TYPES.waitForUi
  | typeof ACTION_TYPES.launchApp
  | typeof ACTION_TYPES.terminateApp
  | typeof ACTION_TYPES.swipe;
