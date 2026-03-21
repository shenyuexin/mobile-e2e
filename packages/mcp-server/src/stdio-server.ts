import process from "node:process";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { buildToolListMetadata, createServer } from "./index.js";

export interface StdioRequest {
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface StdioSuccessResponse {
  id: string | number | null;
  result: unknown;
}

export interface StdioErrorResponse {
  id: string | number | null;
  error: {
    code: string;
    message: string;
  };
}

export function writeResponse(response: StdioSuccessResponse | StdioErrorResponse): void {
  process.stdout.write(`${JSON.stringify(response)}
`);
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function buildToolList() {
  return buildToolListMetadata();
}

function normalizeInvokedToolName(rawToolName: string): string {
  if (rawToolName.startsWith("mobile-e2e-mcp_")) {
    return rawToolName.slice("mobile-e2e-mcp_".length);
  }
  if (rawToolName.startsWith("m2e_")) {
    return rawToolName.slice("m2e_".length);
  }
  return rawToolName;
}

export async function handleRequest(request: StdioRequest): Promise<unknown> {
  const server = createServer();

  if (request.method === "ping") {
    return { ok: true };
  }
  if (request.method === "initialize") {
    return { name: "mobile-e2e-mcp", protocol: "minimal-stdio-v1", tools: buildToolList() };
  }
  if (request.method === "list_tools" || request.method === "tools/list") {
    return buildToolList();
  }
  if (request.method === "invoke" || request.method === "tools/call") {
    const params = request.params;
    if (typeof params !== "object" || params === null) {
      throw new Error("invoke requires an object params payload.");
    }
    const toolName = "tool" in params ? (params as { tool?: unknown }).tool : (params as { name?: unknown }).name;
    const input = "input" in params ? (params as { input?: unknown }).input : (params as { arguments?: unknown }).arguments;
    if (typeof toolName !== "string") {
      throw new Error("invoke requires a string tool/name field.");
    }
    const normalizedToolName = normalizeInvokedToolName(toolName);
    const knownTools = new Set<string>(server.listTools());
    if (!knownTools.has(normalizedToolName)) {
      throw new Error(`Unknown tool: ${toolName}`);
    }
    return server.invoke(normalizedToolName as never, (input ?? {}) as never);
  }
  throw new Error(`Unsupported stdio method: ${request.method}`);
}

export async function main(): Promise<void> {
  const lineReader = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lineReader) {
    if (!line.trim()) {
      continue;
    }
    let request: StdioRequest;
    try {
      request = JSON.parse(line) as StdioRequest;
    } catch (error) {
      writeResponse({ id: null, error: { code: "INVALID_JSON", message: toErrorMessage(error) } });
      continue;
    }
    try {
      const result = await handleRequest(request);
      writeResponse({ id: request.id ?? null, result });
    } catch (error) {
      writeResponse({ id: request.id ?? null, error: { code: "REQUEST_FAILED", message: toErrorMessage(error) } });
    }
  }
}

const currentScriptPath = process.argv[1] ?? "";
const isDirectStdioScript = ["stdio-server.js", "stdio-server.ts", "stdio-server.cjs"].includes(path.basename(currentScriptPath));
const isEntrypoint = currentScriptPath ? fileURLToPath(import.meta.url) === currentScriptPath && isDirectStdioScript : false;

if (isEntrypoint) {
  main().catch((error: unknown) => {
    process.stderr.write(`${toErrorMessage(error)}
`);
    process.exitCode = 1;
  });
}
