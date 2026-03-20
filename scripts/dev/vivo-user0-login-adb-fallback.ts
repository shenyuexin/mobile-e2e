import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "../../packages/mcp-server/src/index.ts";

const execFileAsync = promisify(execFile);

interface QueryMatchNode {
  bounds?: string;
}

interface QueryUiResult {
  status: string;
  data?: {
    result?: {
      matches?: Array<{
        node?: QueryMatchNode;
      }>;
    };
    screenSummary?: {
      appPhase?: string;
      topVisibleTexts?: string[];
    };
  };
  nextSuggestions?: string[];
  reasonCode?: string;
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
  return {
    x: Math.round((left + right) / 2),
    y: Math.round((top + bottom) / 2),
  };
}

async function adb(deviceId: string, args: string[]): Promise<void> {
  await execFileAsync("adb", ["-s", deviceId, ...args]);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const deviceId = process.env.DEVICE_ID ?? "10AEA40Z3Y000R5";
  const appId = process.env.APP_ID ?? "com.epam.mobitru";
  const username = process.env.LOGIN_EMAIL ?? "testuser@mobitru.com";
  const password = process.env.LOGIN_PASSWORD ?? "password1";
  const sessionId = process.env.SESSION_ID ?? `vivo-adb-fallback-${Date.now()}`;
  const server = createServer();

  await adb(deviceId, ["shell", "am", "switch-user", "0"]);
  await adb(deviceId, ["shell", "am", "force-stop", appId]);
  await adb(deviceId, ["shell", "monkey", "-p", appId, "-c", "android.intent.category.LAUNCHER", "1"]);
  await sleep(3000);

  const startSession = await server.invoke("start_session", {
    sessionId,
    platform: "android",
    deviceId,
    profile: "native_android",
    policyProfile: "sample-harness-default",
  }) as QueryUiResult;
  ensureSuccess("start_session", startSession);

  const queryEmail = await server.invoke("query_ui", {
    sessionId,
    platform: "android",
    deviceId,
    resourceId: "com.epam.mobitru:id/login_email",
  }) as QueryUiResult;
  ensureSuccess("query_ui(login_email)", queryEmail);

  const queryPassword = await server.invoke("query_ui", {
    sessionId,
    platform: "android",
    deviceId,
    resourceId: "com.epam.mobitru:id/login_password",
  }) as QueryUiResult;
  ensureSuccess("query_ui(login_password)", queryPassword);

  const querySignin = await server.invoke("query_ui", {
    sessionId,
    platform: "android",
    deviceId,
    resourceId: "com.epam.mobitru:id/login_signin",
  }) as QueryUiResult;
  ensureSuccess("query_ui(login_signin)", querySignin);

  const emailBounds = queryEmail.data?.result?.matches?.[0]?.node?.bounds;
  const passwordBounds = queryPassword.data?.result?.matches?.[0]?.node?.bounds;
  const signinBounds = querySignin.data?.result?.matches?.[0]?.node?.bounds;
  if (!emailBounds || !passwordBounds || !signinBounds) {
    throw new Error("Missing bounds for one or more login controls.");
  }

  const emailCenter = parseBoundsCenter(emailBounds);
  const passwordCenter = parseBoundsCenter(passwordBounds);
  const signinCenter = parseBoundsCenter(signinBounds);

  const [emailLocalPart, emailDomainPart] = username.split("@");
  if (!emailLocalPart || !emailDomainPart) {
    throw new Error(`LOGIN_EMAIL must contain @, got: ${username}`);
  }

  await adb(deviceId, ["shell", "input", "tap", String(emailCenter.x), String(emailCenter.y)]);
  await sleep(600);
  await adb(deviceId, ["shell", "input", "text", emailLocalPart]);
  await adb(deviceId, ["shell", "input", "keyevent", "77"]);
  await adb(deviceId, ["shell", "input", "text", emailDomainPart]);
  await sleep(800);
  await adb(deviceId, ["shell", "input", "tap", String(passwordCenter.x), String(passwordCenter.y)]);
  await sleep(600);
  await adb(deviceId, ["shell", "input", "text", password]);
  await sleep(800);
  await adb(deviceId, ["shell", "input", "tap", String(signinCenter.x), String(signinCenter.y)]);
  await sleep(3000);

  const summary = await server.invoke("get_screen_summary", {
    sessionId,
    platform: "android",
    deviceId,
  }) as QueryUiResult;
  ensureSuccess("get_screen_summary", summary);

  const endSession = await server.invoke("end_session", { sessionId }) as QueryUiResult;
  ensureSuccess("end_session", endSession);

  console.log(JSON.stringify({
    sessionId,
    deviceId,
    appId,
    username,
    appPhase: summary.data?.screenSummary?.appPhase,
    topVisibleTexts: summary.data?.screenSummary?.topVisibleTexts?.slice(0, 10) ?? [],
  }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[vivo-user0-login-adb-fallback] ${message}`);
  process.exitCode = 1;
});
