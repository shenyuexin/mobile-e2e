import assert from "node:assert/strict";
import test from "node:test";
import { createPageContextDetectorService } from "../src/page-context-service.ts";

const baseParams = {
  sessionId: "session-1",
  platform: "android" as const,
  stateSummary: {
    appPhase: "ready" as const,
    readiness: "interrupted" as const,
    blockingSignals: ["permission_prompt"],
    topVisibleTexts: ["Allow", "Don't Allow"],
  },
  uiSummary: {
    totalNodes: 4,
    clickableNodes: 2,
    scrollableNodes: 0,
    nodesWithText: 2,
    nodesWithContentDesc: 0,
    sampleNodes: [
      { clickable: false, enabled: true, scrollable: false, text: "Allow", className: "Dialog", packageName: "com.example.app" },
    ],
  },
  appId: "com.example.app",
  appIdentitySource: "session" as const,
  deviceId: "android-emulator-1",
};

test("page context service returns cached detector result within ttl", async () => {
  let calls = 0;
  const service = createPageContextDetectorService({
    ttlMs: 1000,
    detectPageContext: async (params) => {
      calls += 1;
      return {
        pageContext: {
          type: "permission_surface",
          platform: params.platform,
          detectionSource: "deterministic",
          confidence: 0.9,
        },
      };
    },
    now: () => 100,
  });

  const first = await service.detect(baseParams);
  const second = await service.detect(baseParams);

  assert.equal(calls, 1);
  assert.equal(first.pageContext.type, second.pageContext.type);
});

test("page context service recomputes after ttl expiration", async () => {
  let calls = 0;
  let now = 100;
  const service = createPageContextDetectorService({
    ttlMs: 50,
    detectPageContext: async (params) => {
      calls += 1;
      return {
        pageContext: {
          type: calls === 1 ? "permission_surface" : "system_overlay",
          platform: params.platform,
          detectionSource: "deterministic",
          confidence: 0.9,
        },
      };
    },
    now: () => now,
  });

  const first = await service.detect(baseParams);
  now = 200;
  const second = await service.detect(baseParams);

  assert.equal(calls, 2);
  assert.equal(first.pageContext.type, "permission_surface");
  assert.equal(second.pageContext.type, "system_overlay");
});

test("page context service clears cached entries for a specific session", async () => {
  let calls = 0;
  const service = createPageContextDetectorService({
    ttlMs: 1000,
    detectPageContext: async (params) => {
      calls += 1;
      return {
        pageContext: {
          type: calls === 1 ? "permission_surface" : "system_overlay",
          platform: params.platform,
          detectionSource: "deterministic",
          confidence: 0.9,
        },
      };
    },
    now: () => 100,
  });

  const first = await service.detect(baseParams);
  service.clearSession(baseParams.sessionId);
  const second = await service.detect(baseParams);

  assert.equal(calls, 2);
  assert.equal(first.pageContext.type, "permission_surface");
  assert.equal(second.pageContext.type, "system_overlay");
});
