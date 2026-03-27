import { readFile } from "node:fs/promises";
import path from "node:path";

export interface SelectorMap {
  id?: string;
  text?: string;
}

export type FlowCommand =
  | { kind: "launchApp" }
  | { kind: "assertVisible"; selector: SelectorMap; optional?: boolean }
  | { kind: "tapOn"; selector: SelectorMap; optional?: boolean }
  | { kind: "inputText"; text: string }
  | { kind: "setClipboard"; text: string }
  | { kind: "pasteText" };

function unquote(value: string): string {
  return value.replace(/^"|"$/g, "").replace(/\\"/g, '"');
}

function parseBoolean(value: string): boolean {
  return value.trim() === "true";
}

async function readFlowFile(flowPath: string): Promise<string> {
  return readFile(flowPath, "utf8");
}

export async function parseCommandsFromFlowFile(flowPath: string): Promise<FlowCommand[]> {
  const flowText = await readFlowFile(flowPath);
  return parseCommands(flowText, path.dirname(flowPath));
}

export async function parseCommands(flowText: string, baseDir: string): Promise<FlowCommand[]> {
  const commands: FlowCommand[] = [];
  const lines = flowText.replace(/\r/g, "").split(String.fromCharCode(10));

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    const line = rawLine.trim();
    if (line.length === 0 || line === "---" || /^appId:/.test(line)) {
      continue;
    }

    if (line.startsWith("- runFlow:")) {
      const nestedPath = unquote(line.slice("- runFlow:".length).trim());
      const nestedCommands = await parseCommandsFromFlowFile(path.resolve(baseDir, nestedPath));
      commands.push(...nestedCommands);
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
      const inlineValue = line.slice("- assertVisible:".length).trim();
      if (inlineValue.startsWith('"')) {
        commands.push({ kind: "assertVisible", selector: { text: unquote(inlineValue) }, optional: false });
        continue;
      }
      const selectorLine = lines[index + 1]?.trim() ?? "";
      const optionalLine = lines[index + 2]?.trim() ?? "";
      const optional = optionalLine.startsWith("optional:") ? parseBoolean(optionalLine.slice("optional:".length)) : false;
      if (selectorLine.startsWith("id:")) {
        commands.push({ kind: "assertVisible", selector: { id: unquote(selectorLine.slice(3).trim()) }, optional });
        index += optionalLine.startsWith("optional:") ? 2 : 1;
      } else if (selectorLine.startsWith("text:")) {
        commands.push({ kind: "assertVisible", selector: { text: unquote(selectorLine.slice(5).trim()) }, optional });
        index += optionalLine.startsWith("optional:") ? 2 : 1;
      } else {
        throw new Error(`Unsupported assertVisible selector near line: ${line}`);
      }
      continue;
    }

    if (line.startsWith("- tapOn:")) {
      const inlineValue = line.slice("- tapOn:".length).trim();
      if (inlineValue.startsWith('"')) {
        commands.push({ kind: "tapOn", selector: { text: unquote(inlineValue) }, optional: false });
        continue;
      }
      const selectorLine = lines[index + 1]?.trim() ?? "";
      const optionalLine = lines[index + 2]?.trim() ?? "";
      const optional = optionalLine.startsWith("optional:") ? parseBoolean(optionalLine.slice("optional:".length)) : false;
      if (selectorLine.startsWith("id:")) {
        commands.push({ kind: "tapOn", selector: { id: unquote(selectorLine.slice(3).trim()) }, optional });
        index += optionalLine.startsWith("optional:") ? 2 : 1;
      } else if (selectorLine.startsWith("text:")) {
        commands.push({ kind: "tapOn", selector: { text: unquote(selectorLine.slice(5).trim()) }, optional });
        index += optionalLine.startsWith("optional:") ? 2 : 1;
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
