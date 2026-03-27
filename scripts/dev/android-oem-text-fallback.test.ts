import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { parseCommandsFromFlowFile } from "./android-oem-text-fallback-lib.ts";

test("parseCommandsFromFlowFile supports nested runFlow and optional tap commands", async () => {
  const flowPath = path.resolve("flows/samples/react-native/android-login-smoke.yaml");
  const commands = await parseCommandsFromFlowFile(flowPath);

  assert.equal(commands[0]?.kind, "tapOn");
  assert.equal(commands[0]?.selector.text, "Not now");
  assert.equal(commands[0]?.optional, true);

  assert.equal(commands.some((command) => command.kind === "tapOn" && command.selector.id === "phone-input"), true);
  assert.equal(commands.some((command) => command.kind === "tapOn" && command.selector.id === "login-button"), true);
  assert.equal(commands.some((command) => command.kind === "assertVisible" && command.selector.text === "欢迎进入首页"), true);
});
