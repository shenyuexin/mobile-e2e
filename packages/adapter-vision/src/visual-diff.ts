import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Jimp } from "jimp";
import type {
  VisualDiffData,
  VisualDiffInput,
  VisualStructuralDiff,
} from "@mobile-e2e-mcp/contracts";

const DEFAULT_THRESHOLD = 5.0;

interface PixelDiffResult {
  pixelDiffPercent: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  diffImage: any;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computePixelDiff(baseline: any, current: any): PixelDiffResult {
  const width = Math.min(baseline.bitmap.width, current.bitmap.width);
  const height = Math.min(baseline.bitmap.height, current.bitmap.height);
  let diffPixels = 0;
  const totalPixels = width * height;

  const diffImage = new Jimp({ width, height, color: 0x000000ff });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const baseColor = baseline.getPixelColor(x, y);
      const currentColor = current.getPixelColor(x, y);

      if (baseColor !== currentColor) {
        diffPixels++;
        diffImage.setPixelColor(0xff0000ff, x, y); // Red for diff
      }
    }
  }

  return {
    pixelDiffPercent: totalPixels > 0 ? (diffPixels / totalPixels) * 100 : 0,
    diffImage,
  };
}

async function computeStructuralDiff(
  baselineTree?: string,
  currentTree?: string,
): Promise<VisualStructuralDiff | undefined> {
  if (!baselineTree || !currentTree) return undefined;

  // Simple text-based structural diff on UI tree content
  const baselineLines = baselineTree.split("\n").filter(Boolean);
  const currentLines = currentTree.split("\n").filter(Boolean);

  const baselineSet = new Set(baselineLines);
  const currentSet = new Set(currentLines);

  const addedElements: string[] = [];
  const removedElements: string[] = [];
  const changedText: string[] = [];

  for (const line of currentLines) {
    if (!baselineSet.has(line)) {
      addedElements.push(line);
      // Heuristic: lines containing text attribute changes
      if (line.includes("text=")) {
        changedText.push(line);
      }
    }
  }

  for (const line of baselineLines) {
    if (!currentSet.has(line)) {
      removedElements.push(line);
    }
  }

  return { addedElements, removedElements, changedText };
}

export async function compareVisualBaseline(
  input: VisualDiffInput,
): Promise<{ result: VisualDiffData; durationMs: number }> {
  const startTime = Date.now();
  const threshold = input.threshold ?? DEFAULT_THRESHOLD;

  // Validate input: need either (baselinePath + currentPath) or sessionId + selector
  if (!input.baselinePath && !input.currentPath) {
    if (!input.sessionId || !input.selector) {
      return {
        result: {
          baselinePath: "",
          currentPath: "",
          pixelDiffPercent: 0,
          threshold,
          passed: false,
        },
        durationMs: Date.now() - startTime,
      };
    }
    // When sessionId + selector is provided, the caller is expected to have
    // already captured the element screenshot. This function only does direct
    // image-to-image comparison. The MCP tool wrapper handles the orchestration.
  }

  const baselinePath = input.baselinePath ?? "";
  const currentPath = input.currentPath ?? "";

  if (!baselinePath || !currentPath) {
    return {
      result: {
        baselinePath,
        currentPath,
        pixelDiffPercent: 0,
        threshold,
        passed: false,
      },
      durationMs: Date.now() - startTime,
    };
  }

  // Load images
  const baseline = await Jimp.read(baselinePath);
  const current = await Jimp.read(currentPath);

  // Compute pixel diff
  const { pixelDiffPercent, diffImage } = computePixelDiff(baseline, current);

  const passed = pixelDiffPercent <= threshold;

  let diffPath: string | undefined;
  if (!passed && diffImage) {
    diffPath = input.baselinePath
      ? path.join(path.dirname(input.baselinePath), `diff-${Date.now()}.png`)
      : undefined;

    if (diffPath) {
      await mkdir(path.dirname(diffPath), { recursive: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await diffImage.write(diffPath as any);
    }
  }

  return {
    result: {
      baselinePath,
      currentPath,
      diffPath,
      pixelDiffPercent: Math.round(pixelDiffPercent * 100) / 100,
      threshold,
      passed,
    },
    durationMs: Date.now() - startTime,
  };
}
