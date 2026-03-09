import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface ValidationCase {
  name: string;
  cliArgs: string[];
  validate: (result: unknown) => void;
}

function repoRootFromScript(): string {
  const scriptPath = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(scriptPath), "..");
}

async function runCli(cliArgs: string[]): Promise<unknown> {
  const repoRoot = repoRootFromScript();
  const commandArgs = [
    "--filter",
    "@mobile-e2e-mcp/mcp-server",
    "exec",
    "tsx",
    "src/dev-cli.ts",
    ...cliArgs,
  ];

  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn("pnpm", commandArgs, {
      cwd: repoRoot,
      env: process.env,
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
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`CLI command failed (${String(code)}): ${stderr || stdout}`));
    });
  });

  return JSON.parse(output);
}

const validationCases: ValidationCase[] = [
  {
    name: "default run_flow dry-run",
    cliArgs: ["--platform", "android", "--dry-run", "--run-count", "1"],
    validate: (result) => {
      const typed = result as { startResult: { status: string; data: { capabilities?: { platform: string } } }; runResult: { status: string; data: { dryRun: boolean } }; endResult: { status: string } };
      assert.equal(typed.startResult.status, "success");
      assert.equal(typed.startResult.data.capabilities?.platform, "android");
      assert.equal(typed.runResult.status, "success");
      assert.equal(typed.runResult.data.dryRun, true);
      assert.equal(typed.endResult.status, "success");
    },
  },
  {
    name: "describe_capabilities ios profile",
    cliArgs: ["--describe-capabilities", "--platform", "ios", "--runner-profile", "phase1"],
    validate: (result) => {
      const typed = result as { describeCapabilitiesResult: { status: string; reasonCode: string; data: { capabilities: { platform: string; toolCapabilities: Array<{ toolName: string; supportLevel: string }> } } } };
      assert.equal(typed.describeCapabilitiesResult.status, "success");
      assert.equal(typed.describeCapabilitiesResult.reasonCode, "OK");
      assert.equal(typed.describeCapabilitiesResult.data.capabilities.platform, "ios");
      assert.equal(typed.describeCapabilitiesResult.data.capabilities.toolCapabilities.find((tool) => tool.toolName === "wait_for_ui")?.supportLevel, "partial");
    },
  },
  {
    name: "query_ui Android dry-run",
    cliArgs: ["--query-ui", "--platform", "android", "--content-desc", "View products", "--dry-run"],
    validate: (result) => {
      const typed = result as { queryUiResult: { status: string; reasonCode: string; data: { supportLevel: string } } };
      assert.equal(typed.queryUiResult.status, "success");
      assert.equal(typed.queryUiResult.reasonCode, "OK");
      assert.equal(typed.queryUiResult.data.supportLevel, "full");
    },
  },
  {
    name: "resolve_ui_target Android dry-run",
    cliArgs: ["--resolve-ui-target", "--platform", "android", "--content-desc", "View products", "--dry-run"],
    validate: (result) => {
      const typed = result as { resolveUiTargetResult: { status: string; reasonCode: string; data: { supportLevel: string; resolution: { status: string } } } };
      assert.equal(typed.resolveUiTargetResult.status, "partial");
      assert.equal(typed.resolveUiTargetResult.reasonCode, "UNSUPPORTED_OPERATION");
      assert.equal(typed.resolveUiTargetResult.data.supportLevel, "full");
      assert.equal(typed.resolveUiTargetResult.data.resolution.status, "not_executed");
    },
  },
  {
    name: "wait_for_ui iOS dry-run",
    cliArgs: ["--wait-for-ui", "--platform", "ios", "--content-desc", "View products", "--dry-run"],
    validate: (result) => {
      const typed = result as { waitForUiResult: { status: string; reasonCode: string; data: { supportLevel: string; polls: number } } };
      assert.equal(typed.waitForUiResult.status, "partial");
      assert.equal(typed.waitForUiResult.reasonCode, "UNSUPPORTED_OPERATION");
      assert.equal(typed.waitForUiResult.data.supportLevel, "partial");
      assert.equal(typed.waitForUiResult.data.polls, 0);
    },
  },
  {
    name: "scroll_and_resolve_ui_target Android dry-run",
    cliArgs: ["--scroll-and-resolve-ui-target", "--platform", "android", "--content-desc", "View products", "--max-swipes", "2", "--dry-run"],
    validate: (result) => {
      const typed = result as { scrollAndResolveUiTargetResult: { status: string; reasonCode: string; data: { supportLevel: string; resolution: { status: string }; maxSwipes: number } } };
      assert.equal(typed.scrollAndResolveUiTargetResult.status, "partial");
      assert.equal(typed.scrollAndResolveUiTargetResult.reasonCode, "UNSUPPORTED_OPERATION");
      assert.equal(typed.scrollAndResolveUiTargetResult.data.supportLevel, "full");
      assert.equal(typed.scrollAndResolveUiTargetResult.data.resolution.status, "not_executed");
      assert.equal(typed.scrollAndResolveUiTargetResult.data.maxSwipes, 2);
    },
  },
  {
    name: "type_into_element iOS dry-run",
    cliArgs: ["--type-into-element", "--platform", "ios", "--content-desc", "View products", "--value", "hello", "--dry-run"],
    validate: (result) => {
      const typed = result as { typeIntoElementResult: { status: string; reasonCode: string; data: { supportLevel: string; resolution: { status: string }; value: string } } };
      assert.equal(typed.typeIntoElementResult.status, "partial");
      assert.equal(typed.typeIntoElementResult.reasonCode, "UNSUPPORTED_OPERATION");
      assert.equal(typed.typeIntoElementResult.data.supportLevel, "partial");
      assert.equal(typed.typeIntoElementResult.data.resolution.status, "unsupported");
      assert.equal(typed.typeIntoElementResult.data.value, "hello");
    },
  },
  {
    name: "tap_element iOS dry-run",
    cliArgs: ["--tap-element", "--platform", "ios", "--content-desc", "View products", "--dry-run"],
    validate: (result) => {
      const typed = result as { tapElementResult: { status: string; reasonCode: string; data: { supportLevel: string; resolution?: { status: string } } } };
      assert.equal(typed.tapElementResult.status, "partial");
      assert.equal(typed.tapElementResult.reasonCode, "UNSUPPORTED_OPERATION");
      assert.equal(typed.tapElementResult.data.supportLevel, "partial");
      assert.equal(typed.tapElementResult.data.resolution?.status, "unsupported");
    },
  },
];

async function main(): Promise<void> {
  for (const validationCase of validationCases) {
    const result = await runCli(validationCase.cliArgs);
    validationCase.validate(result);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
