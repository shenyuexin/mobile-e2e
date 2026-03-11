import { spawn } from "node:child_process";
import {
  buildOcrBounds,
  clampOcrConfidence,
  intersectsOcrBounds,
  OcrProviderError,
} from "../types.js";
import type { OcrCropBounds, OcrInput, OcrOutput, OcrProvider, OcrTextBlock } from "../types.js";

export interface MacVisionRawObservation {
  text?: string;
  confidence?: number;
  bounds?: Partial<OcrCropBounds>;
}

export interface MacVisionExecutionResult {
  observations?: MacVisionRawObservation[];
  durationMs?: number;
  model?: string;
}

export type MacVisionExecutor = (input: OcrInput) => Promise<MacVisionExecutionResult>;

export interface MacVisionOcrProviderOptions {
  execute?: MacVisionExecutor;
  providerName?: string;
  engineName?: string;
  model?: string;
}

function normalizeBlockText(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function toFiniteNumber(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? value : 0;
}

function hasUsableBounds(value: Partial<OcrCropBounds> | undefined): value is OcrCropBounds {
  const left = value?.left;
  const top = value?.top;
  const right = value?.right;
  const bottom = value?.bottom;

  return value !== undefined
    && typeof left === "number"
    && typeof top === "number"
    && typeof right === "number"
    && typeof bottom === "number"
    && right > left
    && bottom > top;
}

function applyCrop(blocks: OcrTextBlock[], crop: OcrCropBounds | undefined): OcrTextBlock[] {
  if (!crop) {
    return blocks;
  }
  return blocks.filter((block) => intersectsOcrBounds(block.bounds, crop));
}

export function normalizeMacVisionOutput(
  input: OcrInput,
  result: MacVisionExecutionResult,
  options?: { providerName?: string; engineName?: string; model?: string },
): OcrOutput {
  const blocks = (result.observations ?? [])
    .flatMap((observation) => {
      const text = normalizeBlockText(observation.text);
      if (!text || !hasUsableBounds(observation.bounds)) {
        return [];
      }

      return [{
        text,
        confidence: clampOcrConfidence(observation.confidence),
        bounds: buildOcrBounds({
          left: toFiniteNumber(observation.bounds.left),
          top: toFiniteNumber(observation.bounds.top),
          right: toFiniteNumber(observation.bounds.right),
          bottom: toFiniteNumber(observation.bounds.bottom),
        }),
      } satisfies OcrTextBlock];
    })
    .sort((left, right) => left.bounds.top - right.bounds.top || left.bounds.left - right.bounds.left);

  return {
    provider: options?.providerName ?? "mac-vision",
    engine: options?.engineName ?? "apple-vision",
    model: options?.model ?? result.model,
    durationMs: Math.max(0, Math.round(result.durationMs ?? 0)),
    screenshotPath: input.screenshotPath,
    blocks: applyCrop(blocks, input.crop),
  };
}

function buildSwiftScript(): string {
  return [
    "import AppKit",
    "import Foundation",
    "import Vision",
    "",
    "struct Config: Decodable {",
    "  let languageHints: [String]?",
    "}",
    "",
    "struct Observation: Encodable {",
    "  let text: String",
    "  let confidence: Double",
    "  let bounds: Bounds",
    "}",
    "",
    "struct Bounds: Encodable {",
    "  let left: Double",
    "  let top: Double",
    "  let right: Double",
    "  let bottom: Double",
    "}",
    "",
    "struct Output: Encodable {",
    "  let durationMs: Double",
    "  let model: String",
    "  let observations: [Observation]",
    "}",
    "",
    "let screenshotPath = CommandLine.arguments[1]",
    "let configJson = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : \"{}\"",
    "let configData = Data(configJson.utf8)",
    "let config = try JSONDecoder().decode(Config.self, from: configData)",
    "guard let image = NSImage(contentsOf: URL(fileURLWithPath: screenshotPath)),",
    "      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {",
    "  throw NSError(domain: \"MacVisionOcrProvider\", code: 1, userInfo: [NSLocalizedDescriptionKey: \"Unable to load screenshot at \\(screenshotPath)\"])",
    "}",
    "let start = Date()",
    "let width = Double(cgImage.width)",
    "let height = Double(cgImage.height)",
    "let request = VNRecognizeTextRequest()",
    "request.recognitionLevel = .accurate",
    "request.usesLanguageCorrection = true",
    "if let hints = config.languageHints, !hints.isEmpty { request.recognitionLanguages = hints }",
    "let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])",
    "try handler.perform([request])",
    "let observations = (request.results ?? []).compactMap { observation -> Observation? in",
    "  guard let candidate = observation.topCandidates(1).first else { return nil }",
    "  let rect = observation.boundingBox",
    "  let left = rect.origin.x * width",
    "  let right = (rect.origin.x + rect.size.width) * width",
    "  let top = (1 - rect.origin.y - rect.size.height) * height",
    "  let bottom = (1 - rect.origin.y) * height",
    "  return Observation(text: candidate.string, confidence: Double(candidate.confidence), bounds: Bounds(left: left, top: top, right: right, bottom: bottom))",
    "}",
    "let output = Output(durationMs: Date().timeIntervalSince(start) * 1000, model: \"VNRecognizeTextRequest.accurate\", observations: observations)",
    "let data = try JSONEncoder().encode(output)",
    "guard let text = String(data: data, encoding: .utf8) else {",
    "  throw NSError(domain: \"MacVisionOcrProvider\", code: 2, userInfo: [NSLocalizedDescriptionKey: \"Unable to encode OCR output\"])",
    "}",
    "print(text)",
  ].join("\n");
}

export async function executeMacVisionOcr(input: OcrInput): Promise<MacVisionExecutionResult> {
  if (process.platform !== "darwin") {
    throw new OcrProviderError("unsupported_platform", "MacVisionOcrProvider requires macOS.");
  }

  const script = buildSwiftScript();
  const configJson = JSON.stringify({ languageHints: input.languageHints });

  return await new Promise<MacVisionExecutionResult>((resolve, reject) => {
    const child = spawn("xcrun", ["swift", "-e", script, input.screenshotPath, configJson], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(new OcrProviderError("execution_failed", `Failed to start xcrun swift: ${error.message}`, error));
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new OcrProviderError("execution_failed", stderr.trim() || `Mac Vision OCR exited with code ${String(code)}.`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as MacVisionExecutionResult;
        resolve(parsed);
      } catch (error) {
        reject(new OcrProviderError("invalid_response", "Mac Vision OCR returned invalid JSON.", error));
      }
    });
  });
}

export class MacVisionOcrProvider implements OcrProvider {
  readonly providerName: string;
  readonly engineName: string;
  readonly model?: string;
  private readonly execute: MacVisionExecutor;

  constructor(options: MacVisionOcrProviderOptions = {}) {
    this.providerName = options.providerName ?? "mac-vision";
    this.engineName = options.engineName ?? "apple-vision";
    this.model = options.model;
    this.execute = options.execute ?? executeMacVisionOcr;
  }

  async extractTextRegions(input: OcrInput): Promise<OcrOutput> {
    const result = await this.execute(input);
    return normalizeMacVisionOutput(input, result, {
      providerName: this.providerName,
      engineName: this.engineName,
      model: this.model,
    });
  }
}

export const createDefaultMacVisionExecutor = executeMacVisionOcr;
export { OcrProviderError as OcrProviderExecutionError };
