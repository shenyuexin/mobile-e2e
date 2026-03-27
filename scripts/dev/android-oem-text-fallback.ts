import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildStateSummaryFromSignals } from "../../packages/adapter-maestro/src/index.ts";
import { buildInspectUiSummary, parseAndroidUiHierarchyNodes, queryUiNodes } from "../../packages/adapter-maestro/src/ui-model.ts";
import { parseCommandsFromFlowFile, type FlowCommand, type SelectorMap } from "./android-oem-text-fallback-lib.ts";

const execFileAsync = promisify(execFile);

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

async function captureUiXml(deviceId: string): Promise<string> {
  await adb(deviceId, ["shell", "uiautomator", "dump", "/sdcard/view.xml"]);
  const { stdout } = await execFileAsync("adb", ["-s", deviceId, "shell", "cat", "/sdcard/view.xml"]);
  return stdout;
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

async function resolveBounds(deviceId: string, appId: string, selector: SelectorMap, stepLabel: string): Promise<string> {
  const xml = await captureUiXml(deviceId);
  const nodes = parseAndroidUiHierarchyNodes(xml);
  const normalizedResourceId = normalizeResourceId(appId, selector.id);
  let result = queryUiNodes(nodes, {
    ...(selector.id ? { resourceId: normalizeResourceId(appId, selector.id) } : {}),
    ...(selector.text ? { text: selector.text } : {}),
  });
  if (!result.matches.length && selector.id && normalizedResourceId !== selector.id) {
    result = queryUiNodes(nodes, {
      resourceId: selector.id,
      ...(selector.text ? { text: selector.text } : {}),
    });
  }
  const bounds = result.matches[0]?.node?.bounds;
  if (!bounds) {
    throw new Error(`${stepLabel} did not return a target bounds.`);
  }
  return bounds;
}

async function injectAndroidText(deviceId: string, value: string): Promise<void> {
  const normalized = value
    .replace(/%/g, "\\%")
    .replace(/ /g, "%s")
    .replace(/&/g, "\\&")
    .replace(/</g, "\\<")
    .replace(/>/g, "\\>")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/;/g, "\\;")
    .replace(/\|/g, "\\|");
  await adb(deviceId, ["shell", "input", "text", normalized]);
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

  const commands = await parseCommandsFromFlowFile(flowPath);
  let clipboardValue = "";
  await adb(deviceId, ["shell", "am", "switch-user", androidUserId]);

  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index]!;
    if (command.kind === "launchApp") {
      await adb(deviceId, ["shell", "am", "force-stop", appId]);
      await adb(deviceId, ["shell", "monkey", "-p", appId, "-c", "android.intent.category.LAUNCHER", "1"]);
      await sleep(3000);
      continue;
    }

    if (command.kind === "assertVisible") {
      try {
        await resolveBounds(deviceId, appId, command.selector, `assertVisible[${index}]`);
      } catch (error) {
        if (!command.optional) {
          throw error;
        }
      }
      continue;
    }

    if (command.kind === "tapOn") {
      try {
        const bounds = await resolveBounds(deviceId, appId, command.selector, `tapOn[${index}]`);
        const center = parseBoundsCenter(bounds);
        await adb(deviceId, ["shell", "input", "tap", String(center.x), String(center.y)]);
        await sleep(700);
      } catch (error) {
        if (!command.optional) {
          throw error;
        }
      }
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

  const finalXml = await captureUiXml(deviceId);
  const finalNodes = parseAndroidUiHierarchyNodes(finalXml);
  const finalUiSummary = buildInspectUiSummary(finalNodes);
  const visibleTexts = finalNodes.map((node) => node.text).filter((text): text is string => typeof text === "string" && text.length > 0).slice(0, 40);
  const screenSummary = buildStateSummaryFromSignals({
    uiSummary: finalUiSummary,
  });

  if (expectedAppPhase && screenSummary.appPhase !== expectedAppPhase) {
    throw new Error(`Expected appPhase=${expectedAppPhase}, got ${screenSummary.appPhase}`);
  }

  console.log(JSON.stringify({
    status: "success",
    deviceId,
    appId,
    flowPath,
    appPhase: screenSummary.appPhase,
    topVisibleTexts: screenSummary.topVisibleTexts?.slice(0, 10) ?? visibleTexts.slice(0, 10),
  }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[android-oem-text-fallback] ${message}`);
  process.exitCode = 1;
});
