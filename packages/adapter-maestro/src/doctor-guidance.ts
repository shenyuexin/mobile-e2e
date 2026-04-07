import type { DoctorCheck } from "@mobile-e2e-mcp/contracts";
import { isDarwinHost } from "./host-runtime.js";

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
    dependency: "idb (deprecated)",
    platformScope: "ios",
    matches: (check) => check.name.toLowerCase() === "idb",
    installCommands: ["pipx install fb-idb"],
    verifyCommands: ["which idb"],
    envHints: [
      "WARNING: idb is deprecated. Migrate to xcrun simctl for simulators or devicectl for physical devices.",
      "Set IOS_EXECUTION_BACKEND=idb to continue using idb temporarily.",
    ],
  },
  {
    dependency: "idb_companion (deprecated)",
    platformScope: "ios",
    matches: (check) => check.name.toLowerCase() === "idb companion",
    installCommands: [],
    verifyCommands: [],
    envHints: ["idb_companion is deprecated and no longer needed with xcrun simctl/devicectl backends."],
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
    envHints: [
      "Accept Xcode license: sudo xcodebuild -license accept.",
      "Used for simulator screenshot and lifecycle commands.",
      "Set IOS_EXECUTION_BACKEND=simctl to force simctl backend.",
    ],
  },
  {
    dependency: "axe",
    platformScope: "ios",
    matches: (check) => check.name.toLowerCase() === "axe",
    installCommands: ["brew install cameroncooke/axe/axe"],
    verifyCommands: ["axe --version", "axe describe-ui --help"],
    envHints: [
      "Primary backend for iOS simulator UI actions (hierarchy, tap, type, swipe).",
      "Single binary, no daemon required.",
      "Set IOS_EXECUTION_BACKEND=axe to force axe backend.",
    ],
  },
  {
    dependency: "wda",
    platformScope: "ios",
    matches: (check) => check.name.toLowerCase() === "wda",
    installCommands: [
      "brew install libusbmuxd",
      "git clone https://github.com/appium/WebDriverAgent",
      "Open WebDriverAgent.xcodeproj in Xcode and build to device",
    ],
    verifyCommands: ["iproxy --version", "curl http://localhost:8100/status"],
    envHints: [
      "Run 'iproxy 8100 8100 --udid <deviceId> &' before using WDA backend.",
      "WDA requires code signing. Free Apple ID works (7-day expiry).",
      "Set IOS_EXECUTION_BACKEND=wda to force WDA backend for physical devices.",
    ],
  },
  {
    dependency: "iproxy",
    platformScope: "ios",
    matches: (check) => check.name.toLowerCase() === "iproxy",
    installCommands: ["brew install libusbmuxd"],
    verifyCommands: ["iproxy --version"],
    envHints: [
      "iproxy is required for WDA port forwarding (device localhost:8100 → Mac localhost:8100).",
      "Install: brew install libusbmuxd",
    ],
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
    dependency: "xcrun-devicectl",
    platformScope: "ios",
    matches: (check) => check.name.toLowerCase() === "xcrun devicectl",
    installCommands: ["xcode-select --install", "sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"],
    verifyCommands: ["xcrun devicectl help"],
    envHints: [
      "Requires Xcode 14+ (devicectl introduced in Xcode 14).",
      "Used for physical device lifecycle (install, launch, terminate, logs, crashes).",
      "UI interactions on physical devices use Maestro flow YAML as execution backend.",
      "Set IOS_EXECUTION_BACKEND=devicectl to force devicectl backend.",
    ],
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
  const darwinHost = isDarwinHost();

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
      if (!darwinHost && item.platformScope === "ios") {
        nextSuggestions.push("Current host is not darwin; iOS simulator and idb-based capabilities require a macOS host runtime.");
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
