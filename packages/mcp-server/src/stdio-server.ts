import process from "node:process";
import readline from "node:readline";
import { createServer } from "./index.js";

interface StdioRequest {
  id?: string | number | null;
  method: string;
  params?: unknown;
}

interface StdioSuccessResponse {
  id: string | number | null;
  result: unknown;
}

interface StdioErrorResponse {
  id: string | number | null;
  error: {
    code: string;
    message: string;
  };
}

function writeResponse(response: StdioSuccessResponse | StdioErrorResponse): void {
  process.stdout.write(`${JSON.stringify(response)}
`);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function buildToolList() {
  return [
    { name: "doctor", description: "Check command availability and device readiness." },
    { name: "inspect_ui", description: "Capture an Android UI hierarchy dump or return partial support for iOS." },
    { name: "install_app", description: "Install a native or flutter artifact onto a target device/simulator." },
    { name: "launch_app", description: "Launch the selected app or Expo URL on a target device/simulator." },
    { name: "list_devices", description: "List Android devices and iOS simulators." },
    { name: "take_screenshot", description: "Capture a screenshot from a target device or simulator." },
    { name: "terminate_app", description: "Terminate the selected app on a target device or simulator." },
    { name: "start_session", description: "Create a typed mobile execution session." },
    { name: "run_flow", description: "Run the selected flow through the Maestro adapter." },
    { name: "end_session", description: "Close a session and return final metadata." },
  ];
}

async function handleRequest(request: StdioRequest): Promise<unknown> {
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
    return server.invoke(toolName as never, (input ?? {}) as never);
  }
  throw new Error(`Unsupported stdio method: ${request.method}`);
}

async function main(): Promise<void> {
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

main().catch((error: unknown) => {
  process.stderr.write(`${toErrorMessage(error)}
`);
  process.exitCode = 1;
});
