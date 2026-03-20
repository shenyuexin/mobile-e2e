import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { createServer } from "../../packages/mcp-server/src/index.ts";

const execFileAsync = promisify(execFile);

interface SelectorMap {
  id?: string;
  text?: string;
}

type FlowCommand =
  | { kind: "launchApp" }
  | { kind: "assertVisible"; selector: SelectorMap }
  | { kind: "tapOn"; selector: SelectorMap }
  | { kind: "inputText"; text: string }
  | { kind: "setClipboard"; text: string }
  | { kind: "pasteText" };

interface QueryUiResult {
  status: string;
  reasonCode?: string;
  nextSuggestions?: string[];
  data?: {
    result?: {
      matches?: Array<{
        node?: {
          bounds?: string;
        };
      }>;
    };
    screenSummary?: {
      appPhase?: string;
      topVisibleTexts?: string[];
    };
  };
}

function ensureSuccess(step: string, result: QueryUiResult): void {
  if (result.status !== "success") {
    throw new Error(`${step} failed: ${result.status}${result.reasonCode ? ` (${result.reasonCode})` : ""}${result.nextSuggestions?.length ? `; ${result.nextSuggestions.join(" | ")}` : ""}`);
  }
}

function parseBoundsCenter(bounds: string): { x: number; y: number } {
  const match = bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!match) {
    throw new Error(`Unable to parse bounds: ${bounds}`);
  }
  const left = Number.parseInt(match[1], 10);
  const top = Number.parseInt(match[2], 10);
  const right = Number.parseInt(match[3], 10);
  const bottom = Number.parseInt(match[4], 10);
  return { x: Math.round((left + right) / 2), y: Math.round((top + bottom) / 2) };
}

async function adb(deviceId: string, args: string[]): Promise<void> {
  await execFileAsync("adb", ["-s", deviceId, ...args]);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeResourceId(appId: string, rawId: string | undefined): string | undefined {
  if (!rawId) {
    return undefined;
  }
  if (rawId.includes(":id/")) {
    return rawId;
  }
  if (rawId.includes("/")) {
    return `${appId}:${rawId}`;
  }
  return `${appId}:id/${rawId}`;
}

async function resolveBounds(server: ReturnType<typeof createServer>, sessionId: string, deviceId: string, appId: string, selector: SelectorMap, stepLabel: string): Promise<string> {
  const queryResult = await server.invoke("query_ui", {
    sessionId,
    platform: "android",
    deviceId,
    ...(selector.id ? { resourceId: normalizeResourceId(appId, selector.id) } : {}),
    ...(selector.text ? { text: selector.text } : {}),
  }) as QueryUiResult;
  ensureSuccess(stepLabel, queryResult);
  const bounds = queryResult.data?.result?.matches?.[0]?.node?.bounds;
  if (!bounds) {
    throw new Error(`${stepLabel} did not return a target bounds.`);
  }
  return bounds;
}

async function injectAndroidText(deviceId: string, value: string): Promise<void> {
  for (const char of value) {
    if (char === "@") {
      await adb(deviceId, ["shell", "input", "keyevent", "77"]);
      continue;
    }
    if (char === ".") {
      await adb(deviceId, ["shell", "input", "keyevent", "56"]);
      continue;
    }
    if (char === "_") {
      await adb(deviceId, ["shell", "input", "text", "_"]);
      continue;
    }
    if (char === " ") {
      await adb(deviceId, ["shell", "input", "keyevent", "62"]);
      continue;
    }
    await adb(deviceId, ["shell", "input", "text", char]);
  }
}

function unquote(value: string): string {
  return value.replace(/^"|"$/g, "").replace(/\\"/g, '"');
}

function parseCommands(flowText: string): FlowCommand[] {
  const commands: FlowCommand[] = [];
  const lines = flowText.replace(/\r/g, "").split(String.fromCharCode(10));
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    const line = rawLine.trim();
    if (line.length === 0 || line === "---" || /^appId:/.test(line)) {
      continue;
    }
    if (line === "- launchApp" || line.startsWith("- launchApp:")) {
      commands.push({ kind: "launchApp" });
      while ((lines[index + 1] ?? "").startsWith("    ") || (lines[index + 1] ?? "").startsWith("  ")) {
        index += 1;
      }
      continue;
    }
    if (line.startsWith("- assertVisible:")) {
      const next = lines[index + 1]?.trim() ?? "";
      if (next.startsWith("id:")) {
        commands.push({ kind: "assertVisible", selector: { id: unquote(next.slice(3).trim()) } });
        index += 1;
      } else if (next.startsWith("text:")) {
        commands.push({ kind: "assertVisible", selector: { text: unquote(next.slice(5).trim()) } });
        index += 1;
      } else {
        throw new Error(`Unsupported assertVisible selector near line: ${line}`);
      }
      continue;
    }
    if (line.startsWith("- tapOn:")) {
      const next = lines[index + 1]?.trim() ?? "";
      if (next.startsWith("id:")) {
        commands.push({ kind: "tapOn", selector: { id: unquote(next.slice(3).trim()) } });
        index += 1;
      } else if (next.startsWith("text:")) {
        commands.push({ kind: "tapOn", selector: { text: unquote(next.slice(5).trim()) } });
        index += 1;
      } else {
        throw new Error(`Unsupported tapOn selector near line: ${line}`);
      }
      continue;
    }
    if (line.startsWith("- inputText:")) {
      commands.push({ kind: "inputText", text: unquote(line.slice("- inputText:".length).trim()) });
      continue;
    }
    if (line.startsWith("- setClipboard:")) {
      commands.push({ kind: "setClipboard", text: unquote(line.slice("- setClipboard:".length).trim()) });
      continue;
    }
    if (line === "- pasteText") {
      commands.push({ kind: "pasteText" });
      continue;
    }
    throw new Error(`Unsupported command in OEM fallback flow: ${line}`);
  }
  return commands;
}

async function main(): Promise<void> {
  const deviceId = process.env.DEVICE_ID;
  const appId = process.env.APP_ID;
  const flowPath = process.env.FLOW;
  const androidUserId = process.env.ANDROID_USER_ID ?? "0";
  const expectedAppPhase = process.env.EXPECTED_APP_PHASE;

  if (!deviceId || !appId || !flowPath) {
    throw new Error("DEVICE_ID, APP_ID, and FLOW must be set.");
  }

  const flowText = await readFile(flowPath, "utf8");
  const commands = parseCommands(flowText);

  const sessionId = `android-oem-text-fallback-${Date.now()}`;
  const server = createServer();
  let clipboardValue = "";
  let sessionStarted = false;
  try {
    await adb(deviceId, ["shell", "am", "switch-user", androidUserId]);
    const session = await server.invoke("start_session", {
      sessionId,
      platform: "android",
      deviceId,
      profile: "native_android",
      policyProfile: "sample-harness-default",
    }) as QueryUiResult;
    ensureSuccess("start_session", session);
    sessionStarted = true;

    for (let index = 0; index < commands.length; index += 1) {
      const command = commands[index]!;
      if (command.kind === "launchApp") {
        await adb(deviceId, ["shell", "am", "force-stop", appId]);
        await adb(deviceId, ["shell", "monkey", "-p", appId, "-c", "android.intent.category.LAUNCHER", "1"]);
        await sleep(3000);
        continue;
      }

      if (command.kind === "assertVisible") {
        await resolveBounds(server, sessionId, deviceId, appId, command.selector, `assertVisible[${index}]`);
        continue;
      }

      if (command.kind === "tapOn") {
        const bounds = await resolveBounds(server, sessionId, deviceId, appId, command.selector, `tapOn[${index}]`);
        const center = parseBoundsCenter(bounds);
        await adb(deviceId, ["shell", "input", "tap", String(center.x), String(center.y)]);
        await sleep(700);
        continue;
      }

      if (command.kind === "setClipboard") {
        clipboardValue = command.text;
        continue;
      }

      if (command.kind === "inputText") {
        await injectAndroidText(deviceId, command.text);
        await sleep(800);
        continue;
      }

      if (command.kind === "pasteText") {
        await injectAndroidText(deviceId, clipboardValue);
        await sleep(800);
      }
    }

    const summary = await server.invoke("get_screen_summary", {
      sessionId,
      platform: "android",
      deviceId,
    }) as QueryUiResult;
    ensureSuccess("get_screen_summary", summary);

    if (expectedAppPhase && summary.data?.screenSummary?.appPhase !== expectedAppPhase) {
      throw new Error(`Expected appPhase=${expectedAppPhase}, got ${summary.data?.screenSummary?.appPhase ?? "unknown"}`);
    }

    console.log(JSON.stringify({
      status: "success",
      sessionId,
      deviceId,
      appId,
      flowPath,
      appPhase: summary.data?.screenSummary?.appPhase,
      topVisibleTexts: summary.data?.screenSummary?.topVisibleTexts?.slice(0, 10) ?? [],
    }, null, 2));
  } finally {
    if (sessionStarted) {
      await server.invoke("end_session", { sessionId }).catch(() => undefined);
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[android-oem-text-fallback] ${message}`);
  process.exitCode = 1;
});
