import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Jimp } from "jimp";
import type { JimpInstance } from "jimp";
import type {
  ElementBounds,
  ElementScreenshotData,
  ElementScreenshotInput,
  InspectUiNode,
  ToolResult,
  UiBounds,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { resolveRepoPath } from "./harness-config.js";
import {
  buildDefaultDeviceId,
  DEFAULT_HARNESS_CONFIG_PATH,
  DEFAULT_RUNNER_PROFILE,
  loadHarnessSelection,
} from "./harness-config.js";
import {
  captureAndroidUiSnapshot,
  captureIosUiSnapshot,
  isAndroidUiSnapshotFailure,
  isIosUiSnapshotFailure,
} from "./ui-runtime.js";
import { resolveUiRuntimePlatformHooks } from "./ui-runtime-platform.js";
import { parseUiBounds } from "./ui-model.js";
import { takeScreenshotWithRuntime } from "./device-runtime.js";

const DEFAULT_CROP_PADDING = 8;

function findElementBounds(
  nodes: InspectUiNode[],
  selector: ElementScreenshotInput["selector"],
): { bounds: UiBounds; confidence: number } | undefined {
  const candidates: { node: InspectUiNode; score: number; bounds: UiBounds }[] = [];

  for (const node of nodes) {
    const nodeBounds = parseUiBounds(node.bounds);
    if (!nodeBounds) continue;

    let score = 0;
    let matched = false;

    if (selector.resourceId && node.resourceId === selector.resourceId) {
      score += 100;
      matched = true;
    }
    if (selector.contentDesc && node.contentDesc === selector.contentDesc) {
      score += 100;
      matched = true;
    }
    if (selector.text && node.text === selector.text) {
      score += 100;
      matched = true;
    }
    if (selector.role && node.className?.toLowerCase().includes(selector.role.toLowerCase())) {
      score += 50;
      matched = true;
    }

    if (matched) {
      candidates.push({ node, score, bounds: nodeBounds });
    }
  }

  if (candidates.length === 0) return undefined;

  // Sort by score descending, then by area (prefer larger elements for ties)
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const areaA = a.bounds.width * a.bounds.height;
    const areaB = b.bounds.width * b.bounds.height;
    return areaB - areaA;
  });

  const best = candidates[0];
  const confidence = best.score >= 100 ? 1.0 : best.score >= 50 ? 0.7 : 0.4;

  return { bounds: best.bounds, confidence };
}

function clampCrop(
  x: number,
  y: number,
  width: number,
  height: number,
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number; width: number; height: number } {
  const clampedX = Math.max(0, x);
  const clampedY = Math.max(0, y);
  const clampedWidth = Math.min(width, imageWidth - clampedX);
  const clampedHeight = Math.min(height, imageHeight - clampedY);
  return { x: clampedX, y: clampedY, width: clampedWidth, height: clampedHeight };
}

export async function cropElementScreenshot(
  input: ElementScreenshotInput,
): Promise<ToolResult<ElementScreenshotData>> {
  const startTime = Date.now();
  const repoRoot = resolveRepoPath();
  const platform = input.platform;
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const cropPadding = input.cropPadding ?? DEFAULT_CROP_PADDING;

  if (!platform) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        fullScreenshotPath: "",
        croppedElementPath: "",
        elementBounds: { x: 0, y: 0, width: 0, height: 0 },
        cropPadding,
        confidence: 0,
      },
      nextSuggestions: ["Provide platform (android or ios) for capture_element_screenshot."],
    };
  }

  const selection = await loadHarnessSelection(
    repoRoot,
    platform,
    runnerProfile,
    input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH,
  );
  const deviceId = input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);

  // Directories
  const screenshotDir = path.join(
    repoRoot,
    "artifacts",
    "element-screenshots",
    input.sessionId,
  );
  await mkdir(screenshotDir, { recursive: true });

  const fullScreenshotPath = path.join(screenshotDir, `full-${platform}-${runnerProfile}.png`);
  const croppedOutputPath = input.outputPath
    ? path.isAbsolute(input.outputPath)
      ? input.outputPath
      : path.join(repoRoot, input.outputPath)
    : path.join(screenshotDir, `element-${Date.now()}.png`);

  // Step 1: Capture full screenshot
  const screenshotResult = await takeScreenshotWithRuntime({
    sessionId: input.sessionId,
    platform,
    runnerProfile,
    harnessConfigPath: input.harnessConfigPath,
    deviceId,
    outputPath: fullScreenshotPath,
    dryRun: input.dryRun,
  });

  if (screenshotResult.status === "failed" || screenshotResult.data.exitCode !== 0) {
    return {
      status: "failed",
      reasonCode: screenshotResult.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: screenshotResult.artifacts,
      data: {
        fullScreenshotPath: screenshotResult.data.outputPath,
        croppedElementPath: "",
        elementBounds: { x: 0, y: 0, width: 0, height: 0 },
        cropPadding,
        confidence: 0,
      },
      nextSuggestions: ["Ensure the device is booted and screenshot capture works before cropping."],
    };
  }

  const absoluteScreenshotPath = path.resolve(repoRoot, screenshotResult.data.outputPath);

  // Step 2: Capture UI hierarchy to find element bounds
  const runtimeHooks = resolveUiRuntimePlatformHooks(platform);

  if (platform === "ios") {
    const snapshot = await captureIosUiSnapshot(
      repoRoot,
      deviceId,
      input.sessionId,
      runnerProfile,
      undefined,
      {
        sessionId: input.sessionId,
        platform,
        runnerProfile,
        harnessConfigPath: input.harnessConfigPath,
        deviceId,
        outputPath: undefined,
        dryRun: false,
      },
    );

    if (isIosUiSnapshotFailure(snapshot)) {
      return {
        status: "failed",
        reasonCode: snapshot.reasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [absoluteScreenshotPath],
        data: {
          fullScreenshotPath: absoluteScreenshotPath,
          croppedElementPath: "",
          elementBounds: { x: 0, y: 0, width: 0, height: 0 },
          cropPadding,
          confidence: 0,
        },
        nextSuggestions: [snapshot.message],
      };
    }

    return cropFromNodes(
      snapshot.nodes,
      absoluteScreenshotPath,
      croppedOutputPath,
      input,
      cropPadding,
      input.sessionId,
      startTime,
    );
  }

  const snapshot = await captureAndroidUiSnapshot(
    repoRoot,
    deviceId,
    input.sessionId,
    runnerProfile,
    undefined,
    {
      sessionId: input.sessionId,
      platform,
      runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId,
      outputPath: undefined,
      dryRun: false,
    },
  );

  if (isAndroidUiSnapshotFailure(snapshot)) {
    return {
      status: "failed",
      reasonCode: snapshot.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [absoluteScreenshotPath],
      data: {
        fullScreenshotPath: absoluteScreenshotPath,
        croppedElementPath: "",
        elementBounds: { x: 0, y: 0, width: 0, height: 0 },
        cropPadding,
        confidence: 0,
      },
      nextSuggestions: [snapshot.message],
    };
  }

  return cropFromNodes(
    snapshot.nodes,
    absoluteScreenshotPath,
    croppedOutputPath,
    input,
    cropPadding,
    input.sessionId,
    startTime,
  );
}

async function cropFromNodes(
  nodes: InspectUiNode[],
  fullScreenshotPath: string,
  croppedOutputPath: string,
  input: ElementScreenshotInput,
  cropPadding: number,
  sessionId: string,
  startTime: number,
): Promise<ToolResult<ElementScreenshotData>> {
  const matchResult = findElementBounds(nodes, input.selector);

  if (!matchResult) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.noMatch,
      sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [fullScreenshotPath],
      data: {
        fullScreenshotPath,
        croppedElementPath: "",
        elementBounds: { x: 0, y: 0, width: 0, height: 0 },
        cropPadding,
        confidence: 0,
      },
      nextSuggestions: [
        "No element matched the provided selector. Check selector fields and retry.",
        "Run inspect_ui to verify the element exists on the current screen.",
      ],
    };
  }

  const { bounds, confidence } = matchResult;

  // Load image and crop using composite (Jimp v1.x doesn't have crop method)
  const fullImage = await Jimp.read(fullScreenshotPath);
  const imageWidth = fullImage.bitmap.width;
  const imageHeight = fullImage.bitmap.height;

  const cropX = bounds.left - cropPadding;
  const cropY = bounds.top - cropPadding;
  const cropW = bounds.width + cropPadding * 2;
  const cropH = bounds.height + cropPadding * 2;

  const clamped = clampCrop(cropX, cropY, cropW, cropH, imageWidth, imageHeight);

  // Create cropped image and composite the region from full image
  const croppedImage = new Jimp({ width: clamped.width, height: clamped.height });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (croppedImage as any).composite(fullImage, 0, 0, {
    sourceX: clamped.x,
    sourceY: clamped.y,
    sourceWidth: clamped.width,
    sourceHeight: clamped.height,
  });

  // Ensure output directory exists
  await mkdir(path.dirname(croppedOutputPath), { recursive: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (croppedImage as any).write(croppedOutputPath as any);

  const elementBoundsResult: ElementBounds = {
    x: bounds.left,
    y: bounds.top,
    width: bounds.width,
    height: bounds.height,
  };

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [fullScreenshotPath, croppedOutputPath],
    data: {
      fullScreenshotPath,
      croppedElementPath: croppedOutputPath,
      elementBounds: elementBoundsResult,
      cropPadding,
      confidence,
    },
    nextSuggestions: [],
  };
}
