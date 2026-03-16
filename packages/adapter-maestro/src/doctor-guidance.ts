import type { DoctorCheck } from "@mobile-e2e-mcp/contracts";

export interface DoctorGuidanceItem {
  dependency: string;
  status: "pass" | "warn" | "fail";
  platformScope: "android" | "ios" | "cross";
  installCommands: string[];
  verifyCommands: string[];
  envHints: string[];
}

interface DoctorGuidanceRule {
  dependency: string;
  platformScope: DoctorGuidanceItem["platformScope"];
  matches: (check: DoctorCheck) => boolean;
  installCommands: string[];
  verifyCommands: string[];
  envHints: string[];
}

function buildResolveSuggestion(check: DoctorCheck): string {
  return `Resolve ${check.name}: ${check.detail}`;
}

const GUIDANCE_RULES: DoctorGuidanceRule[] = [
  {
    dependency: "idb",
    platformScope: "ios",
    matches: (check) => check.name.toLowerCase() === "idb",
    installCommands: ["pipx install fb-idb", "pip3 install --user fb-idb"],
    verifyCommands: ["which idb", "idb list-targets"],
    envHints: ["Set IDB_CLI_PATH when idb is installed in a non-standard location."],
  },
  {
    dependency: "idb_companion",
    platformScope: "ios",
    matches: (check) => check.name.toLowerCase() === "idb companion",
    installCommands: ["brew install idb-companion"],
    verifyCommands: ["which idb_companion", "idb list-targets"],
    envHints: ["Set IDB_COMPANION_PATH when idb_companion is installed in a non-standard location."],
  },
  {
    dependency: "adb",
    platformScope: "android",
    matches: (check) => check.name.toLowerCase() === "adb",
    installCommands: ["brew install android-platform-tools"],
    verifyCommands: ["which adb", "adb version", "adb devices"],
    envHints: ["Ensure Android SDK platform-tools are on PATH."],
  },
  {
    dependency: "xcrun-simctl",
    platformScope: "ios",
    matches: (check) => check.name.toLowerCase() === "xcrun simctl",
    installCommands: ["xcode-select --install", "sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"],
    verifyCommands: ["xcrun simctl help", "xcrun simctl list devices"],
    envHints: ["Accept Xcode license: sudo xcodebuild -license accept."],
  },
  {
    dependency: "xcrun-xctrace",
    platformScope: "ios",
    matches: (check) => check.name.toLowerCase() === "xcrun xctrace",
    installCommands: ["xcode-select --install", "sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"],
    verifyCommands: ["xcrun xctrace version"],
    envHints: ["Ensure full Xcode command line tools are available for performance capture."],
  },
  {
    dependency: "maestro",
    platformScope: "cross",
    matches: (check) => check.name.toLowerCase() === "maestro",
    installCommands: ["curl -Ls 'https://get.maestro.mobile.dev' | bash"],
    verifyCommands: ["maestro --version"],
    envHints: ["Ensure Maestro binary path is exported in your shell profile."],
  },
  {
    dependency: "trace_processor",
    platformScope: "android",
    matches: (check) => check.name.toLowerCase() === "trace_processor",
    installCommands: ["brew install perfetto"],
    verifyCommands: ["which trace_processor", "trace_processor --help"],
    envHints: ["Set TRACE_PROCESSOR_PATH if trace_processor is not discoverable on PATH."],
  },
];

function toGuidanceItem(check: DoctorCheck, rule: DoctorGuidanceRule): DoctorGuidanceItem {
  return {
    dependency: rule.dependency,
    status: check.status,
    platformScope: rule.platformScope,
    installCommands: rule.installCommands,
    verifyCommands: rule.verifyCommands,
    envHints: rule.envHints,
  };
}

export function buildDoctorGuidance(checks: DoctorCheck[]): { guidance: DoctorGuidanceItem[]; nextSuggestions: string[] } {
  const guidance: DoctorGuidanceItem[] = [];
  const nextSuggestions = checks
    .filter((check) => check.status !== "pass")
    .map((check) => buildResolveSuggestion(check));

  for (const check of checks) {
    if (check.status === "pass") {
      continue;
    }
    for (const rule of GUIDANCE_RULES) {
      if (!rule.matches(check)) {
        continue;
      }
      const item = toGuidanceItem(check, rule);
      guidance.push(item);
      for (const installCommand of item.installCommands) {
        nextSuggestions.push(`Install ${item.dependency}: ${installCommand}`);
      }
      for (const verifyCommand of item.verifyCommands) {
        nextSuggestions.push(`Verify ${item.dependency}: ${verifyCommand}`);
      }
      for (const hint of item.envHints) {
        nextSuggestions.push(hint);
      }
    }
  }

  return {
    guidance,
    nextSuggestions: [...new Set(nextSuggestions)],
  };
}

export function buildDoctorNextSuggestions(checks: DoctorCheck[]): string[] {
  return buildDoctorGuidance(checks).nextSuggestions;
}
