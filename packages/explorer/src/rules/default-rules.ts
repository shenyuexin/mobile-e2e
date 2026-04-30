import type { SamplingRule, SkipElementRule, SkipPageRule } from "../types.js";
import type { ExplorerRule } from "./rule-types.js";

export const DEFAULT_EXPLORER_RULES: ExplorerRule[] = [
  {
    id: "default.ios.fonts.system-fonts.smoke-sampling",
    category: "sampling",
    action: "sample-children",
    reason: "System font lists are high-fanout collections; smoke runs validate one representative child.",
    source: "default",
    supportLevel: "reproducible-demo",
    match: {
      pathPrefix: ["General", "Fonts", "System Fonts"],
      mode: "smoke",
      platform: ["ios-simulator", "ios-device"],
    },
    sampling: {
      strategy: "representative-child",
      maxChildrenToValidate: 1,
      stopAfterFirstSuccessfulNavigation: true,
      excludeActions: ["Download"],
    },
  },
  {
    id: "default.android.bluetooth.other-devices.page-skip",
    category: "page-skip",
    action: "skip-page",
    reason: "Bluetooth device search triggers system pairing dialogs",
    source: "default",
    supportLevel: "reproducible-demo",
    match: { pathPrefix: ["Bluetooth", "Other devices"], platform: ["android-emulator", "android-device"] },
  },
  {
    id: "default.android.network.sims-mobile-network.page-skip",
    category: "page-skip",
    action: "skip-page",
    reason: "Stateful mobile network settings",
    source: "default",
    supportLevel: "reproducible-demo",
    match: { screenTitle: "SIMs & mobile network", platform: ["android-emulator", "android-device"] },
  },
  {
    id: "default.element.bluetooth.other-devices.skip",
    category: "element-skip",
    action: "skip-element",
    reason: "Bluetooth device search triggers system pairing dialogs",
    source: "default",
    supportLevel: "reproducible-demo",
    match: { pathPrefix: ["Bluetooth"], elementLabel: "Other devices" },
  },
  {
    id: "default.element.sims-mobile-network.skip",
    category: "element-skip",
    action: "skip-element",
    reason: "Stateful mobile network settings",
    source: "default",
    supportLevel: "reproducible-demo",
    match: { screenTitle: "SIMs & mobile network" },
  },
  {
    id: "default.element.more-connections.flaky-skip",
    category: "element-skip",
    action: "skip-element",
    reason: "Temporarily skip due to flakiness,",
    source: "default",
    supportLevel: "experimental",
    match: { screenTitle: "More connections" },
  },
  {
    id: "default.element.help.low-value-skip",
    category: "low-value-content",
    action: "skip-element",
    reason: "Help/FAQ pages typically contain low-value leaf content",
    source: "default",
    supportLevel: "reproducible-demo",
    match: { elementLabel: "Help" },
  },
  {
    id: "default.element.faq.low-value-skip",
    category: "low-value-content",
    action: "skip-element",
    reason: "FAQ items are typically leaf nodes with no navigation value",
    source: "default",
    supportLevel: "reproducible-demo",
    match: { elementLabelPattern: "^(How do I|What do I|Why do|Cannot|Car kit)" },
  },
  {
    id: "default.owner-package.bbk-account.external-app-gate",
    category: "external-app",
    action: "gate-page",
    reason: "External account owner package is outside the target app traversal boundary",
    source: "default",
    supportLevel: "reproducible-demo",
    recoveryMethod: "navigate-back",
    match: { ownerPackage: "com.bbk.account" },
  },
  {
    id: "default.low-value.help-faq-about-legal.android",
    category: "low-value-content",
    action: "gate-page",
    reason: "Help, FAQ, about, and legal pages are low-value leaves for Android Settings exploration",
    source: "default",
    supportLevel: "reproducible-demo",
    match: { screenTitlePattern: "Help|FAQ|About|Legal", platform: ["android-emulator", "android-device"] },
  },
  {
    id: "default.auth.protected-surface.android",
    category: "auth-boundary",
    action: "gate-page",
    reason: "Protected auth surfaces require explicit handoff instead of unattended traversal",
    source: "default",
    supportLevel: "reproducible-demo",
    recoveryMethod: "manual-handoff",
    match: { screenTitlePattern: "Password|Passcode|Sign in|Login", platform: ["android-emulator", "android-device"] },
  },
  {
    id: "default.dialog.system-alert",
    category: "system-dialog",
    action: "gate-page",
    reason: "System alert surfaces need interruption handling before continuing traversal",
    source: "default",
    supportLevel: "reproducible-demo",
    recoveryMethod: "resolve-interruption",
    match: { pageContextType: "system_alert_surface" },
  },
  {
    id: "default.dialog.dismissible-nickname",
    category: "system-dialog",
    action: "gate-page",
    reason: "Dismissible nickname dialogs should be resolved before DFS expansion",
    source: "default",
    supportLevel: "reproducible-demo",
    recoveryMethod: "dismiss-dialog",
    match: { screenTitlePattern: "Nickname|Name" },
  },
  {
    id: "default.risk.destructive-actions",
    category: "risk-pattern",
    action: "defer-action",
    reason: "Destructive actions are skipped unless destructiveActionPolicy explicitly allows them",
    source: "default",
    supportLevel: "ci-verified",
    match: { elementLabelPattern: "Delete|Remove|Reset|Erase|Sign Out|Log Out|Logout" },
  },
  {
    id: "default.risk.side-effect-actions",
    category: "side-effect",
    action: "defer-action",
    reason: "Side-effect actions are deferred to preserve deterministic and safe exploration",
    source: "default",
    supportLevel: "ci-verified",
    match: { elementLabelPattern: "Share|Call|Message|Email|Open in|Download|Install|Buy|Purchase" },
  },
  {
    id: "default.navigation.controls",
    category: "navigation-control",
    action: "defer-action",
    reason: "Navigation controls should not be treated as content children during DFS expansion",
    source: "default",
    supportLevel: "ci-verified",
    match: { elementLabelPattern: "^(Back|Cancel|Done|Close|System Fonts)$" },
  },
  {
    id: "default.stateful-form.account-payment-address",
    category: "stateful-form",
    action: "gate-page",
    reason: "Account, payment, address, and location form branches mutate app or device state",
    source: "default",
    supportLevel: "reproducible-demo",
    recoveryMethod: "backtrack-cancel-first",
    match: { screenTitlePattern: "Account|Payment|Address|Location|Profile" },
  },
];

function requireRule(id: string): ExplorerRule {
  const rule = DEFAULT_EXPLORER_RULES.find((candidate) => candidate.id === id);
  if (!rule) {
    throw new Error(`Missing default explorer rule: ${id}`);
  }
  return rule;
}

export function projectDefaultSamplingRules(): SamplingRule[] {
  const fontsRule = requireRule("default.ios.fonts.system-fonts.smoke-sampling");
  return [
    {
      match: {
        pathPrefix: fontsRule.match.pathPrefix,
      },
      mode: fontsRule.match.mode === "smoke" ? "smoke" : undefined,
      strategy: fontsRule.sampling?.strategy ?? "representative-child",
      maxChildrenToValidate: fontsRule.sampling?.maxChildrenToValidate,
      stopAfterFirstSuccessfulNavigation: fontsRule.sampling?.stopAfterFirstSuccessfulNavigation,
      excludeActions: fontsRule.sampling?.excludeActions,
    },
  ];
}

export function projectDefaultSkipPages(): SkipPageRule[] {
  return [
    {
      match: { pathPrefix: requireRule("default.android.bluetooth.other-devices.page-skip").match.pathPrefix },
      reason: requireRule("default.android.bluetooth.other-devices.page-skip").reason,
    },
    {
      match: { screenTitle: requireRule("default.android.network.sims-mobile-network.page-skip").match.screenTitle },
      reason: requireRule("default.android.network.sims-mobile-network.page-skip").reason,
    },
  ];
}

export function projectDefaultSkipElements(): SkipElementRule[] {
  return [
    {
      match: { pathPrefix: ["Bluetooth"], elementLabel: "Other devices" },
      reason: requireRule("default.element.bluetooth.other-devices.skip").reason,
    },
    {
      match: { screenTitle: requireRule("default.element.sims-mobile-network.skip").match.screenTitle },
      reason: requireRule("default.element.sims-mobile-network.skip").reason,
    },
    {
      match: { screenTitle: requireRule("default.element.more-connections.flaky-skip").match.screenTitle },
      reason: requireRule("default.element.more-connections.flaky-skip").reason,
    },
    {
      match: { elementLabel: "Help" },
      reason: requireRule("default.element.help.low-value-skip").reason,
    },
    {
      match: { elementLabelPattern: requireRule("default.element.faq.low-value-skip").match.elementLabelPattern },
      reason: requireRule("default.element.faq.low-value-skip").reason,
    },
  ];
}
