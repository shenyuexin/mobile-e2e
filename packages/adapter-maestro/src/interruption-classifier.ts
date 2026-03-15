import type {
  InterruptionClassification,
  InterruptionSignal,
  InterruptionType,
} from "@mobile-e2e-mcp/contracts";

function countSignals(signals: InterruptionSignal[], key: string): number {
  return signals.filter((signal) => signal.key === key).length;
}

function maxConfidence(signals: InterruptionSignal[], keys: string[]): number {
  return signals
    .filter((signal) => keys.includes(signal.key))
    .reduce((max, signal) => Math.max(max, signal.confidence), 0);
}

export function classifyInterruptionFromSignals(signals: InterruptionSignal[]): InterruptionClassification {
  if (signals.length === 0) {
    return {
      type: "unknown",
      confidence: 0,
      rationale: ["No interruption signals were provided."],
    };
  }

  const permissionScore = countSignals(signals, "permission_prompt") * 2 + countSignals(signals, "owner_package") + countSignals(signals, "owner_bundle");
  const sheetScore = countSignals(signals, "container_role") + signals.filter((signal) => signal.value?.toLowerCase().includes("sheet")).length;
  const alertScore = signals.filter((signal) => signal.value?.toLowerCase().includes("alert") || signal.value?.toLowerCase().includes("dialog")).length;
  const keyboardScore = signals.filter((signal) => signal.value?.toLowerCase().includes("keyboard")).length;
  const overlayScore = countSignals(signals, "dialog_actions") + countSignals(signals, "interrupted") + countSignals(signals, "owner_package") + countSignals(signals, "owner_bundle");

  const candidates: Array<{ type: InterruptionType; score: number; confidence: number; rationale: string }> = [
    {
      type: "permission_prompt",
      score: permissionScore,
      confidence: maxConfidence(signals, ["permission_prompt", "owner_package", "owner_bundle"]),
      rationale: "Permission signal and owner identity indicate a permission prompt.",
    },
    {
      type: "action_sheet",
      score: sheetScore,
      confidence: maxConfidence(signals, ["container_role"]),
      rationale: "Container role resembles a sheet/bottom-sheet.",
    },
    {
      type: "system_alert",
      score: alertScore,
      confidence: maxConfidence(signals, ["container_role", "visible_text"]),
      rationale: "Alert/dialog markers are present in container role or visible text.",
    },
    {
      type: "keyboard_blocking",
      score: keyboardScore,
      confidence: maxConfidence(signals, ["container_role", "visible_text"]),
      rationale: "Keyboard indicators are present in interruption signals.",
    },
    {
      type: "overlay",
      score: overlayScore,
      confidence: maxConfidence(signals, ["dialog_actions", "interrupted", "owner_package", "owner_bundle"]),
      rationale: "Generic interruption and owner markers indicate an overlay/modal blocker.",
    },
  ];

  const sorted = candidates.sort((left, right) => right.score - left.score);
  const winner = sorted[0];
  if (!winner || winner.score <= 0) {
    return {
      type: "unknown",
      confidence: 0.2,
      rationale: ["Signals did not meet any interruption classifier threshold."],
    };
  }

  const ownerPackage = signals.find((signal) => signal.key === "owner_package")?.value;
  const ownerBundle = signals.find((signal) => signal.key === "owner_bundle")?.value;
  const containerRole = signals.find((signal) => signal.key === "container_role")?.value;

  return {
    type: winner.type,
    confidence: Math.max(0.35, Number((winner.confidence || 0.55).toFixed(2))),
    rationale: [winner.rationale, ...signals.map((signal) => `${signal.key}:${signal.value ?? "n/a"}`).slice(0, 4)],
    ownerPackage,
    ownerBundle,
    containerRole,
    buttonSlots: winner.type === "permission_prompt"
      ? ["primary", "secondary"]
      : winner.type === "action_sheet"
        ? ["primary", "cancel", "destructive"]
        : undefined,
  };
}
