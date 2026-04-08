import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildActionRecordRelativePath, buildDeviceLeaseRecordRelativePath, buildRecordEventsRelativePath, buildRecordedStepsRelativePath, buildRecordSessionRelativePath, buildSessionAuditRelativePath, buildSessionRecordRelativePath, persistActionRecord } from "@mobile-e2e-mcp/core";
import { buildToolList, handleRequest } from "../src/stdio-server.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function buildTestDeviceId(sessionId: string): string {
  return `${sessionId}-device`;
}

async function cleanupSessionArtifact(sessionId: string): Promise<void> {
  await rm(path.resolve(repoRoot, buildSessionRecordRelativePath(sessionId)), { force: true });
  await rm(path.resolve(repoRoot, buildSessionAuditRelativePath(sessionId)), { force: true });
  await rm(path.resolve(repoRoot, buildDeviceLeaseRecordRelativePath("android", buildTestDeviceId(sessionId))), { force: true });
}

async function cleanupActionArtifact(actionId: string): Promise<void> {
  await rm(path.resolve(repoRoot, buildActionRecordRelativePath(actionId)), { force: true });
}

async function cleanupRecordSessionArtifacts(recordSessionId: string): Promise<void> {
  await rm(path.resolve(repoRoot, buildRecordSessionRelativePath(recordSessionId)), { force: true });
  await rm(path.resolve(repoRoot, buildRecordEventsRelativePath(recordSessionId)), { force: true });
  await rm(path.resolve(repoRoot, buildRecordedStepsRelativePath(recordSessionId)), { force: true });
}

test("buildToolList includes the new UI tools", () => {
  const tools = buildToolList();
  const toolNames = tools.map((tool) => tool.name);

  assert.ok(toolNames.includes("query_ui"));
  assert.ok(toolNames.includes("capture_js_console_logs"));
  assert.ok(toolNames.includes("capture_js_network_events"));
  assert.ok(toolNames.includes("collect_debug_evidence"));
  assert.ok(toolNames.includes("detect_interruption"));
  assert.ok(toolNames.includes("classify_interruption"));
  assert.ok(toolNames.includes("list_js_debug_targets"));
  assert.ok(toolNames.includes("describe_capabilities"));
  assert.ok(toolNames.includes("execute_intent"));
  assert.ok(toolNames.includes("complete_task"));
  assert.ok(toolNames.includes("start_record_session"));
  assert.ok(toolNames.includes("get_record_session_status"));
  assert.ok(toolNames.includes("end_record_session"));
  assert.ok(toolNames.includes("cancel_record_session"));
  assert.ok(toolNames.includes("export_session_flow"));
  assert.ok(toolNames.includes("record_task_flow"));
  assert.ok(toolNames.includes("compare_against_baseline"));
  assert.ok(toolNames.includes("explain_last_failure"));
  assert.ok(toolNames.includes("find_similar_failures"));
  assert.ok(toolNames.includes("get_action_outcome"));
  assert.ok(toolNames.includes("get_screen_summary"));
  assert.ok(toolNames.includes("get_session_state"));
  assert.ok(toolNames.includes("measure_android_performance"));
  assert.ok(toolNames.includes("measure_ios_performance"));
  assert.ok(toolNames.includes("resolve_ui_target"));
  assert.ok(toolNames.includes("wait_for_ui"));
  assert.ok(toolNames.includes("scroll_and_resolve_ui_target"));
  assert.ok(toolNames.includes("scroll_and_tap_element"));
  assert.ok(toolNames.includes("tap_element"));
  assert.ok(toolNames.includes("tap"));
  assert.ok(toolNames.includes("type_text"));
  assert.ok(toolNames.includes("type_into_element"));
  assert.ok(toolNames.includes("run_flow"));
  assert.ok(toolNames.includes("install_app"));
  assert.ok(toolNames.includes("launch_app"));
  assert.ok(toolNames.includes("terminate_app"));
  assert.ok(toolNames.includes("perform_action_with_evidence"));
  assert.ok(toolNames.includes("rank_failure_candidates"));
  assert.ok(toolNames.includes("record_screen"));
  assert.ok(toolNames.includes("recover_to_known_state"));
  assert.ok(toolNames.includes("resolve_interruption"));
  assert.ok(toolNames.includes("resume_interrupted_action"));
  assert.ok(toolNames.includes("replay_last_stable_path"));
  assert.ok(toolNames.includes("reset_app_state"));
  assert.ok(toolNames.includes("suggest_known_remediation"));
});

test("handleRequest returns stdio initialize payload", async () => {
  const result = await handleRequest({ id: 1, method: "initialize" });
  const typedResult = result as { name: string; protocol: string; tools: Array<{ name: string }> };

  assert.equal(typedResult.name, "mobile-e2e-mcp");
  assert.equal(typedResult.protocol, "minimal-stdio-v1");
  assert.ok(typedResult.tools.some((tool) => tool.name === "capture_js_console_logs"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "capture_js_network_events"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "collect_debug_evidence"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "list_js_debug_targets"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "get_crash_signals"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "describe_capabilities"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "execute_intent"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "complete_task"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "start_record_session"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "get_record_session_status"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "end_record_session"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "cancel_record_session"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "export_session_flow"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "record_task_flow"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "compare_against_baseline"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "explain_last_failure"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "find_similar_failures"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "get_action_outcome"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "get_screen_summary"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "get_session_state"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "measure_android_performance"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "measure_ios_performance"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "perform_action_with_evidence"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "rank_failure_candidates"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "record_screen"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "recover_to_known_state"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "replay_last_stable_path"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "reset_app_state"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "suggest_known_remediation"));
  assert.ok(typedResult.tools.some((tool) => tool.name === "wait_for_ui"));
});

test("handleRequest supports tools/call alias for describe_capabilities", async () => {
  const result = await handleRequest({
    id: 7,
    method: "tools/call",
    params: {
      name: "describe_capabilities",
      arguments: {
        sessionId: "stdio-capabilities",
        platform: "android",
        runnerProfile: "phase1",
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: {
      capabilities: {
        platform: string;
        toolCapabilities: Array<{ toolName: string; supportLevel: string; promotionGate?: { blocked: boolean; requiredProofLanes: string[]; blockingReasons: string[] } }>;
        ocrFallback?: {
          hostRequirement: string;
          configuredProviders: string[];
        };
      };
    };
  };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.capabilities.platform, "android");
  assert.equal(typedResult.data.capabilities.toolCapabilities.find((tool) => tool.toolName === "tap_element")?.supportLevel, "full");
  assert.equal(typedResult.data.capabilities.ocrFallback?.hostRequirement, "darwin");
  assert.equal(Array.isArray(typedResult.data.capabilities.ocrFallback?.configuredProviders), true);
});

test("handleRequest describe_capabilities carries iOS conditional tool info through stdio", async () => {
  const result = await handleRequest({
    id: 71,
    method: "tools/call",
    params: {
      name: "describe_capabilities",
      arguments: {
        sessionId: "stdio-capabilities-ios",
        platform: "ios",
        runnerProfile: "phase1",
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: {
      capabilities: {
        toolCapabilities: Array<{ toolName: string; supportLevel: string; promotionGate?: { blocked: boolean; requiredProofLanes: string[]; blockingReasons: string[] } }>;
      };
    };
  };

  const inspectTool = typedResult.data.capabilities.toolCapabilities.find((tool) => tool.toolName === "inspect_ui");
  // Conditional tools do not have promotion gates — they are platform-dependent, not blocked.
  assert.equal(inspectTool?.supportLevel, "conditional");
  assert.equal(inspectTool?.promotionGate, undefined);
});

test("handleRequest supports m2e_ prefixed tool alias", async () => {
  const result = await handleRequest({
    id: 701,
    method: "tools/call",
    params: {
      name: "m2e_describe_capabilities",
      arguments: {
        platform: "android",
        runnerProfile: "phase1",
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { capabilities: { platform: string } };
  };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.capabilities.platform, "android");
});

test("handleRequest supports mobile-e2e-mcp_ prefixed tool alias", async () => {
  const result = await handleRequest({
    id: 702,
    method: "tools/call",
    params: {
      name: "mobile-e2e-mcp_describe_capabilities",
      arguments: {
        platform: "ios",
        runnerProfile: "phase1",
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { capabilities: { platform: string } };
  };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.capabilities.platform, "ios");
});

test("handleRequest auto-resolves single active session when sessionId is omitted", async () => {
  const sessionId = `stdio-auto-session-single-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);

  try {
    const started = await handleRequest({
      id: 703,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId,
          platform: "android",
          deviceId: buildTestDeviceId(sessionId),
          profile: "phase1",
        },
      },
    }) as { status: string };
    assert.equal(started.status, "success");

    const result = await handleRequest({
      id: 704,
      method: "tools/call",
      params: {
        name: "get_screen_summary",
        arguments: {
          platform: "android",
          deviceId: buildTestDeviceId(sessionId),
          dryRun: true,
          includeDebugSignals: true,
        },
      },
    });
    const typedResult = result as {
      status: string;
      reasonCode: string;
    };

    assert.ok(["success", "partial"].includes(typedResult.status));
    assert.equal(typedResult.reasonCode === "OK" || typedResult.reasonCode === "UNSUPPORTED_OPERATION", true);
  } finally {
    await handleRequest({
      id: 705,
      method: "tools/call",
      params: {
        name: "end_session",
        arguments: { sessionId },
      },
    });
    await cleanupSessionArtifact(sessionId);
  }
});

test("handleRequest returns ambiguity error when multiple active sessions exist and sessionId is omitted", async () => {
  const sessionIdA = `stdio-auto-session-amb-a-${Date.now()}`;
  const sessionIdB = `stdio-auto-session-amb-b-${Date.now()}`;
  await cleanupSessionArtifact(sessionIdA);
  await cleanupSessionArtifact(sessionIdB);

  try {
    const startedA = await handleRequest({
      id: 706,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId: sessionIdA,
          platform: "android",
          deviceId: buildTestDeviceId(sessionIdA),
          profile: "phase1",
        },
      },
    }) as { status: string };
    assert.equal(startedA.status, "success");

    const startedB = await handleRequest({
      id: 707,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId: sessionIdB,
          platform: "ios",
          deviceId: buildTestDeviceId(sessionIdB),
          profile: "phase1",
        },
      },
    }) as { status: string };
    assert.equal(startedB.status, "success");

    const result = await handleRequest({
      id: 708,
      method: "tools/call",
      params: {
        name: "get_screen_summary",
        arguments: {
          dryRun: true,
          includeDebugSignals: true,
        },
      },
    });
    const typedResult = result as {
      status: string;
      reasonCode: string;
      nextSuggestions: string[];
    };

    assert.equal(typedResult.status, "failed");
    assert.equal(typedResult.reasonCode, "CONFIGURATION_ERROR");
    assert.equal(typedResult.nextSuggestions.some((item) => item.includes("Multiple active sessions")), true);
  } finally {
    await handleRequest({
      id: 709,
      method: "tools/call",
      params: {
        name: "end_session",
        arguments: { sessionId: sessionIdA },
      },
    });
    await handleRequest({
      id: 710,
      method: "tools/call",
      params: {
        name: "end_session",
        arguments: { sessionId: sessionIdB },
      },
    });
    await cleanupSessionArtifact(sessionIdA);
    await cleanupSessionArtifact(sessionIdB);
  }
});

test("handleRequest returns ambiguity error for same-platform active sessions when only platform is provided", async () => {
  const sessionIdA = `stdio-auto-session-plat-amb-a-${Date.now()}`;
  const sessionIdB = `stdio-auto-session-plat-amb-b-${Date.now()}`;
  await cleanupSessionArtifact(sessionIdA);
  await cleanupSessionArtifact(sessionIdB);

  try {
    const startedA = await handleRequest({
      id: 711,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId: sessionIdA,
          platform: "android",
          deviceId: buildTestDeviceId(sessionIdA),
          profile: "phase1",
        },
      },
    }) as { status: string };
    assert.equal(startedA.status, "success");

    const startedB = await handleRequest({
      id: 712,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId: sessionIdB,
          platform: "android",
          deviceId: buildTestDeviceId(sessionIdB),
          profile: "phase1",
        },
      },
    }) as { status: string };
    assert.equal(startedB.status, "success");

    const result = await handleRequest({
      id: 713,
      method: "tools/call",
      params: {
        name: "get_screen_summary",
        arguments: {
          platform: "android",
          dryRun: true,
        },
      },
    });
    const typedResult = result as {
      status: string;
      reasonCode: string;
      nextSuggestions: string[];
    };

    assert.equal(typedResult.status, "failed");
    assert.equal(typedResult.reasonCode, "CONFIGURATION_ERROR");
    assert.equal(typedResult.nextSuggestions.some((item) => item.includes("Multiple active sessions")), true);
  } finally {
    await handleRequest({
      id: 714,
      method: "tools/call",
      params: {
        name: "end_session",
        arguments: { sessionId: sessionIdA },
      },
    });
    await handleRequest({
      id: 715,
      method: "tools/call",
      params: {
        name: "end_session",
        arguments: { sessionId: sessionIdB },
      },
    });
    await cleanupSessionArtifact(sessionIdA);
    await cleanupSessionArtifact(sessionIdB);
  }
});

test("handleRequest narrows implicit session resolution by deviceId when multiple sessions are active", async () => {
  const sessionIdA = `stdio-auto-session-narrow-a-${Date.now()}`;
  const sessionIdB = `stdio-auto-session-narrow-b-${Date.now()}`;
  await cleanupSessionArtifact(sessionIdA);
  await cleanupSessionArtifact(sessionIdB);

  try {
    const startedA = await handleRequest({
      id: 716,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId: sessionIdA,
          platform: "android",
          deviceId: buildTestDeviceId(sessionIdA),
          profile: "phase1",
        },
      },
    }) as { status: string };
    assert.equal(startedA.status, "success");

    const startedB = await handleRequest({
      id: 717,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId: sessionIdB,
          platform: "android",
          deviceId: buildTestDeviceId(sessionIdB),
          profile: "phase1",
        },
      },
    }) as { status: string };
    assert.equal(startedB.status, "success");

    const result = await handleRequest({
      id: 718,
      method: "tools/call",
      params: {
        name: "get_screen_summary",
        arguments: {
          platform: "android",
          deviceId: buildTestDeviceId(sessionIdA),
          dryRun: true,
          includeDebugSignals: true,
        },
      },
    });
    const typedResult = result as {
      status: string;
      reasonCode: string;
    };

    assert.ok(["success", "partial"].includes(typedResult.status));
    assert.equal(typedResult.reasonCode === "OK" || typedResult.reasonCode === "UNSUPPORTED_OPERATION", true);
  } finally {
    await handleRequest({
      id: 719,
      method: "tools/call",
      params: {
        name: "end_session",
        arguments: { sessionId: sessionIdA },
      },
    });
    await handleRequest({
      id: 720,
      method: "tools/call",
      params: {
        name: "end_session",
        arguments: { sessionId: sessionIdB },
      },
    });
    await cleanupSessionArtifact(sessionIdA);
    await cleanupSessionArtifact(sessionIdB);
  }
});

test("handleRequest supports tools/call alias for resolve_ui_target", async () => {
  const result = await handleRequest({
    id: 2,
    method: "tools/call",
    params: {
      name: "resolve_ui_target",
      arguments: {
        sessionId: "stdio-resolve-dry-run",
        platform: "android",
        contentDesc: "View products",
        dryRun: true,
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { supportLevel: string; resolution: { status: string } };
  };

  assert.equal(typedResult.status, "partial");
  assert.equal(typedResult.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(typedResult.data.supportLevel, "full");
  assert.equal(typedResult.data.resolution.status, "not_executed");
});

test("handleRequest supports tools/call alias for get_screen_summary", async () => {
  const result = await handleRequest({
    id: 30,
    method: "tools/call",
    params: {
      name: "get_screen_summary",
      arguments: {
        sessionId: "stdio-screen-summary-dry-run",
        platform: "android",
        includeDebugSignals: true,
        dryRun: true,
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { summarySource: string; supportLevel: string; screenSummary: { appPhase: string } };
  };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.summarySource, "ui_and_debug_signals");
  assert.equal(typedResult.data.supportLevel, "full");
  assert.equal(typedResult.data.screenSummary.appPhase, "unknown");
});

test("handleRequest supports tools/call alias for get_session_state", async () => {
  const result = await handleRequest({
    id: 31,
    method: "tools/call",
    params: {
      name: "get_session_state",
      arguments: {
        sessionId: "stdio-session-state-dry-run",
        platform: "android",
        dryRun: true,
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { sessionRecordFound: boolean; platform: string; state: { appPhase: string } };
  };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.sessionRecordFound, false);
  assert.equal(typedResult.data.platform, "android");
  assert.equal(typedResult.data.state.appPhase, "unknown");
});

test("handleRequest supports tools/call alias for perform_action_with_evidence", async () => {
  const result = await handleRequest({
    id: 32,
    method: "tools/call",
    params: {
      name: "perform_action_with_evidence",
      arguments: {
        sessionId: "stdio-action-evidence-dry-run",
        platform: "android",
        dryRun: true,
        autoRemediate: true,
        action: {
          actionType: "tap_element",
          contentDesc: "View products",
        },
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: {
      outcome: {
        actionType: string;
        actionId: string;
        failureCategory?: string;
        progressMarker?: string;
        postconditionStatus?: string;
        stateChangeCategory?: string;
        stateChangeConfidence?: string;
      };
      retryRecommendationTier?: string;
      actionabilityReview?: string[];
      autoRemediation?: { stopReason: string };
    };
  };

  assert.equal(typedResult.status, "partial");
  assert.equal(typedResult.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(typedResult.data.outcome.actionType, "tap_element");
  assert.equal(typeof typedResult.data.outcome.actionId, "string");
  assert.equal(typedResult.data.outcome.failureCategory, "unsupported");
  assert.equal(typedResult.data.outcome.progressMarker, "none");
  assert.equal(typedResult.data.outcome.postconditionStatus, "not_met");
  assert.equal(typedResult.data.outcome.stateChangeCategory, "no_material_change");
  assert.equal(typedResult.data.outcome.stateChangeConfidence, "weak");
  assert.equal(typedResult.data.retryRecommendationTier, "inspect_only");
  assert.equal(Array.isArray(typedResult.data.actionabilityReview), true);
  assert.equal(typeof typedResult.data.autoRemediation?.stopReason, "string");
});

test("handleRequest supports tools/call alias for execute_intent", async () => {
  const result = await handleRequest({
    id: 321,
    method: "tools/call",
    params: {
      name: "execute_intent",
      arguments: {
        sessionId: "stdio-execute-intent-dry-run",
        platform: "android",
        dryRun: true,
        intent: "tap view products",
        actionType: "tap_element",
        contentDesc: "View products",
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { selectedAction: { actionType: string }; decision: string };
  };

  assert.equal(typedResult.status, "partial");
  assert.equal(typedResult.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(typedResult.data.selectedAction.actionType, "tap_element");
  assert.equal(typeof typedResult.data.decision, "string");
});

test("handleRequest supports tools/call alias for complete_task", async () => {
  const result = await handleRequest({
    id: 322,
    method: "tools/call",
    params: {
      name: "complete_task",
      arguments: {
        sessionId: "stdio-complete-task-dry-run",
        platform: "android",
        dryRun: true,
        goal: "wait login input",
        steps: [
          {
            intent: "wait for login input",
            actionType: "wait_for_ui",
            resourceId: "login_email",
          },
        ],
      },
    },
  });
  const typedResult = result as {
    status: string;
    data: { totalSteps: number; outcomes: Array<{ status: string }> };
  };

  assert.equal(typedResult.data.totalSteps, 1);
  assert.equal(typedResult.data.outcomes.length, 1);
});

test("handleRequest supports tools/call aliases for record session lifecycle", async () => {
  const start = await handleRequest({
    id: 325,
    method: "tools/call",
    params: {
      name: "start_record_session",
      arguments: {
        sessionId: "stdio-record-session",
        platform: "android",
        dryRun: true,
        deviceId: "emulator-5554",
        appId: "com.example.app",
      },
    },
  }) as { status: string; data: { recordSessionId: string } };

  const recordSessionId = start.data.recordSessionId;
  let flowPath: string | undefined;
  try {
    const status = await handleRequest({
      id: 326,
      method: "tools/call",
      params: {
        name: "get_record_session_status",
        arguments: { recordSessionId },
      },
    }) as { status: string; data: { recordSessionId: string } };
    assert.equal(status.status, "success");
    assert.equal(status.data.recordSessionId, recordSessionId);

    const ended = await handleRequest({
      id: 327,
      method: "tools/call",
      params: {
        name: "end_record_session",
        arguments: {
          recordSessionId,
          autoExport: true,
          runReplayDryRun: true,
          dryRun: true,
        },
      },
    }) as { status: string; data: { status: string; report: { flowPath?: string; replayDryRun?: { status: string; reasonCode: string } } } };
    assert.equal(ended.status, "success");
    assert.equal(ended.data.status, "ended");
    assert.equal(typeof ended.data.report.flowPath, "string");
    assert.equal(ended.data.report.flowPath?.endsWith(".yaml"), true);
    assert.equal(typeof ended.data.report.replayDryRun?.status, "string");
    assert.equal(typeof ended.data.report.replayDryRun?.reasonCode, "string");
    flowPath = ended.data.report.flowPath;
    if (flowPath) {
      const exportedFlow = await readFile(path.resolve(repoRoot, flowPath), "utf8");
      assert.equal(exportedFlow.includes("artifacts/record-snapshots/"), false);
    }

    const cancelled = await handleRequest({
      id: 328,
      method: "tools/call",
      params: {
        name: "cancel_record_session",
        arguments: { recordSessionId },
      },
    }) as { status: string; data: { cancelled: boolean } };
    assert.equal(cancelled.status, "success");
    assert.equal(cancelled.data.cancelled, true);
  } finally {
    await cleanupRecordSessionArtifacts(recordSessionId);
    if (flowPath) {
      await rm(path.resolve(repoRoot, flowPath), { force: true });
    }
  }
});

test("handleRequest supports tools/call alias for get_action_outcome", async () => {
  const actionResult = await handleRequest({
    id: 33,
    method: "tools/call",
    params: {
      name: "perform_action_with_evidence",
      arguments: {
        sessionId: "stdio-action-outcome-dry-run",
        platform: "android",
        dryRun: true,
        action: {
          actionType: "wait_for_ui",
          contentDesc: "View products",
        },
      },
    },
  }) as { data: { outcome: { actionId: string } } };

  const result = await handleRequest({
    id: 34,
    method: "tools/call",
    params: {
      name: "get_action_outcome",
      arguments: {
        actionId: actionResult.data.outcome.actionId,
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { found: boolean; outcome?: { actionType: string } };
  };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.found, true);
  assert.equal(typedResult.data.outcome?.actionType, "wait_for_ui");
});

test("handleRequest supports tools/call alias for explain_last_failure", async () => {
  await handleRequest({
    id: 35,
    method: "tools/call",
    params: {
      name: "start_session",
      arguments: {
        sessionId: "stdio-explain-failure-dry-run",
        platform: "android",
        profile: "phase1",
      },
    },
  });
  await handleRequest({
    id: 36,
    method: "tools/call",
    params: {
      name: "perform_action_with_evidence",
      arguments: {
        sessionId: "stdio-explain-failure-dry-run",
        platform: "android",
        dryRun: true,
        action: { actionType: "tap_element", contentDesc: "View products" },
      },
    },
  });
  const result = await handleRequest({
    id: 37,
    method: "tools/call",
    params: {
      name: "explain_last_failure",
      arguments: { sessionId: "stdio-explain-failure-dry-run" },
    },
  });
  const typedResult = result as { reasonCode: string; data: { found: boolean; attribution?: { affectedLayer: string }; diagnosisPacket?: { strongestSuspectLayer?: string; confidence?: string; strongestCausalSignal?: string } } };

  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.found, true);
  assert.equal(typeof typedResult.data.attribution?.affectedLayer, "string");
  assert.equal(typedResult.data.diagnosisPacket?.strongestSuspectLayer, "ui_locator");
  assert.equal(typedResult.data.diagnosisPacket?.confidence, "moderate");
  assert.equal(typeof typedResult.data.diagnosisPacket?.strongestCausalSignal, "string");
});

test("handleRequest supports tools/call alias for rank_failure_candidates", async () => {
  await handleRequest({
    id: 38,
    method: "tools/call",
    params: {
      name: "start_session",
      arguments: {
        sessionId: "stdio-rank-failure-dry-run",
        platform: "android",
        profile: "phase1",
      },
    },
  });
  await handleRequest({
    id: 39,
    method: "tools/call",
    params: {
      name: "perform_action_with_evidence",
      arguments: {
        sessionId: "stdio-rank-failure-dry-run",
        platform: "android",
        dryRun: true,
        action: { actionType: "tap_element", contentDesc: "View products" },
      },
    },
  });
  const result = await handleRequest({
    id: 40,
    method: "tools/call",
    params: {
      name: "rank_failure_candidates",
      arguments: { sessionId: "stdio-rank-failure-dry-run" },
    },
  });
  const typedResult = result as { reasonCode: string; data: { found: boolean; candidates: Array<{ affectedLayer: string }> } };

  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.found, true);
  assert.equal(typedResult.data.candidates.length >= 1, true);
});

test("handleRequest supports tools/call alias for recover_to_known_state", async () => {
  const result = await handleRequest({
    id: 41,
    method: "tools/call",
    params: {
      name: "recover_to_known_state",
      arguments: {
        sessionId: "stdio-recover-state-dry-run",
        platform: "android",
        dryRun: true,
      },
    },
  });
  const typedResult = result as { reasonCode: string; data: { summary: { strategy: string } } };

  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typeof typedResult.data.summary.strategy, "string");
});

test("handleRequest supports tools/call alias for record_screen", async () => {
  const result = await handleRequest({
    id: 52,
    method: "tools/call",
    params: {
      name: "record_screen",
      arguments: {
        sessionId: "stdio-record-screen-dry-run",
        platform: "android",
        durationMs: 4000,
        dryRun: true,
      },
    },
  });
  const typedResult = result as { status: string; reasonCode: string; data: { dryRun: boolean; commands: string[][]; outputPath: string } };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.dryRun, true);
  assert.equal(typedResult.data.commands[0]?.includes("screenrecord"), true);
  assert.equal(typedResult.data.outputPath.endsWith(".mp4"), true);
});

test("handleRequest supports tools/call alias for reset_app_state", async () => {
  const result = await handleRequest({
    id: 53,
    method: "tools/call",
    params: {
      name: "reset_app_state",
      arguments: {
        sessionId: "stdio-reset-app-state-dry-run",
        platform: "android",
        appId: "com.example.demo",
        strategy: "clear_data",
        dryRun: true,
      },
    },
  });
  const typedResult = result as { status: string; reasonCode: string; data: { strategy: string; commands: string[][] } };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.strategy, "clear_data");
  assert.equal(typedResult.data.commands[0]?.includes("pm"), true);
  assert.equal(typedResult.data.commands[0]?.includes("clear"), true);
});

test("handleRequest supports tools/call alias for replay_last_stable_path", async () => {
  await handleRequest({
    id: 42,
    method: "tools/call",
    params: {
      name: "perform_action_with_evidence",
      arguments: {
        sessionId: "stdio-replay-stable-dry-run",
        platform: "android",
        dryRun: true,
        action: { actionType: "launch_app", appId: "host.exp.exponent" },
      },
    },
  });
  const result = await handleRequest({
    id: 43,
    method: "tools/call",
    params: {
      name: "replay_last_stable_path",
      arguments: {
        sessionId: "stdio-replay-stable-dry-run",
        platform: "android",
        dryRun: true,
      },
    },
  });
  const typedResult = result as { reasonCode: string; data: { summary: { strategy: string } } };

  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.summary.strategy, "replay_last_successful_action");
});

test("handleRequest supports Phase F lookup aliases", async () => {
  await handleRequest({
    id: 44,
    method: "tools/call",
    params: {
      name: "perform_action_with_evidence",
      arguments: {
        sessionId: "stdio-phase-f-dry-run",
        platform: "android",
        dryRun: true,
        action: { actionType: "launch_app", appId: "host.exp.exponent" },
      },
    },
  });
  await handleRequest({
    id: 45,
    method: "tools/call",
    params: {
      name: "perform_action_with_evidence",
      arguments: {
        sessionId: "stdio-phase-f-dry-run",
        platform: "android",
        dryRun: true,
        action: { actionType: "tap_element", contentDesc: "View products" },
      },
    },
  });
  const similar = await handleRequest({ id: 46, method: "tools/call", params: { name: "find_similar_failures", arguments: { sessionId: "stdio-phase-f-dry-run" } } });
  const baseline = await handleRequest({ id: 47, method: "tools/call", params: { name: "compare_against_baseline", arguments: { sessionId: "stdio-phase-f-dry-run" } } });
  const remediation = await handleRequest({ id: 48, method: "tools/call", params: { name: "suggest_known_remediation", arguments: { sessionId: "stdio-phase-f-dry-run", platform: "android" } } });

  assert.equal((similar as { reasonCode: string }).reasonCode, "OK");
  assert.equal((baseline as { reasonCode: string }).reasonCode, "OK");
  assert.equal((remediation as { reasonCode: string }).reasonCode, "OK");
  const typedRemediation = remediation as {
    data: {
      skillGuidance?: {
        route: string[];
        mostLikelyGap: string;
        askForNext: string[];
        handoffSkill?: string;
      };
    };
  };
  assert.deepEqual(typedRemediation.data.skillGuidance?.route, [
    "mobile-e2e-readiness-baseline",
    "android-e2e-readiness",
  ]);
  assert.equal(typeof typedRemediation.data.skillGuidance?.mostLikelyGap, "string");
  assert.equal(Array.isArray(typedRemediation.data.skillGuidance?.askForNext), true);
  assert.equal(typedRemediation.data.skillGuidance?.handoffSkill, "android-development");
});

test("handleRequest supports Phase F lookup aliases for iOS skill-guided remediation", async () => {
  await handleRequest({
    id: 145,
    method: "tools/call",
    params: {
      name: "perform_action_with_evidence",
      arguments: {
        sessionId: "stdio-phase-f-ios-dry-run",
        platform: "ios",
        dryRun: true,
        action: { actionType: "tap_element", contentDesc: "View products" },
      },
    },
  });

  const remediation = await handleRequest({
    id: 146,
    method: "tools/call",
    params: {
      name: "suggest_known_remediation",
      arguments: { sessionId: "stdio-phase-f-ios-dry-run", platform: "ios" },
    },
  });

  const typedRemediation = remediation as {
    reasonCode: string;
    data: {
      skillGuidance?: {
        route: string[];
        mostLikelyGap: string;
        askForNext: string[];
        handoffSkill?: string;
      };
    };
  };

  assert.equal(typedRemediation.reasonCode, "OK");
  assert.deepEqual(typedRemediation.data.skillGuidance?.route, [
    "mobile-e2e-readiness-baseline",
    "ios-e2e-readiness",
  ]);
  assert.equal(typeof typedRemediation.data.skillGuidance?.mostLikelyGap, "string");
  assert.equal(Array.isArray(typedRemediation.data.skillGuidance?.askForNext), true);
  assert.equal(typedRemediation.data.skillGuidance?.handoffSkill, "ios-development");
});

test("handleRequest supports tools/call alias for wait_for_ui", async () => {
  const result = await handleRequest({
    id: 6,
    method: "tools/call",
    params: {
      name: "wait_for_ui",
      arguments: {
        sessionId: "stdio-wait-ios",
        platform: "ios",
        contentDesc: "View products",
        dryRun: true,
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { supportLevel: string; polls: number };
  };

  assert.equal(typedResult.status, "partial");
  assert.equal(typedResult.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(typedResult.data.supportLevel, "full");
  assert.equal(typedResult.data.polls, 0);
});

test("handleRequest supports tools/call alias for run_flow dry-run", async () => {
  const result = await handleRequest({
    id: 8,
    method: "tools/call",
    params: {
      name: "run_flow",
      arguments: {
        sessionId: "stdio-run-flow-dry-run",
        platform: "android",
        dryRun: true,
        runCount: 1,
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { dryRun: boolean; runnerProfile: string };
  };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.dryRun, true);
  assert.equal(typedResult.data.runnerProfile, "phase1");
});

test("handleRequest supports tools/call alias for export_session_flow", async () => {
  const sessionId = `stdio-export-flow-${Date.now()}`;
  const actionId = `stdio-export-action-${Date.now()}`;
  try {
    await persistActionRecord(repoRoot, {
      actionId,
      sessionId,
      intent: {
        actionType: "tap_element",
        contentDesc: "View products",
      },
      outcome: {
        actionId,
        actionType: "tap_element",
        resolutionStrategy: "deterministic",
        stateChanged: true,
        fallbackUsed: false,
        retryCount: 0,
        outcome: "success",
      },
      evidenceDelta: {},
      evidence: [],
      lowLevelStatus: "success",
      lowLevelReasonCode: "OK",
      updatedAt: new Date().toISOString(),
    });

    const result = await handleRequest({
      id: 323,
      method: "tools/call",
      params: {
        name: "export_session_flow",
        arguments: {
          sessionId,
          outputPath: `flows/samples/generated/${sessionId}.yaml`,
        },
      },
    });
    const typedResult = result as {
      status: string;
      reasonCode: string;
      data: { outputPath: string; stepCount: number };
    };

    assert.equal(typedResult.status, "success");
    assert.equal(typedResult.reasonCode, "OK");
    assert.equal(typedResult.data.outputPath.endsWith(".yaml"), true);
    assert.equal(typedResult.data.stepCount >= 1, true);
  } finally {
    await cleanupActionArtifact(actionId);
    await rm(path.resolve(repoRoot, `flows/samples/generated/${sessionId}.yaml`), { force: true });
  }
});

test("handleRequest supports tools/call alias for record_task_flow", async () => {
  const sessionId = `stdio-record-flow-${Date.now()}`;
  const actionId = `stdio-record-action-${Date.now()}`;
  try {
    await persistActionRecord(repoRoot, {
      actionId,
      sessionId,
      intent: {
        actionType: "wait_for_ui",
        resourceId: "login_email",
      },
      outcome: {
        actionId,
        actionType: "wait_for_ui",
        resolutionStrategy: "deterministic",
        stateChanged: true,
        fallbackUsed: false,
        retryCount: 0,
        outcome: "success",
      },
      evidenceDelta: {},
      evidence: [],
      lowLevelStatus: "success",
      lowLevelReasonCode: "OK",
      updatedAt: new Date().toISOString(),
    });

    const result = await handleRequest({
      id: 324,
      method: "tools/call",
      params: {
        name: "record_task_flow",
        arguments: {
          sessionId,
          goal: "Login smoke",
          outputPath: `flows/samples/generated/${sessionId}.yaml`,
        },
      },
    });
    const typedResult = result as {
      status: string;
      reasonCode: string;
      data: { outputPath: string; goal?: string };
    };

    assert.equal(typedResult.status, "success");
    assert.equal(typedResult.reasonCode, "OK");
    assert.equal(typedResult.data.goal, "Login smoke");
    assert.equal(typedResult.data.outputPath.endsWith(".yaml"), true);
  } finally {
    await cleanupActionArtifact(actionId);
    await rm(path.resolve(repoRoot, `flows/samples/generated/${sessionId}.yaml`), { force: true });
  }
});

test("handleRequest supports tools/call alias for measure_android_performance dry-run", async () => {
  const result = await handleRequest({
    id: 20,
    method: "tools/call",
    params: {
      name: "measure_android_performance",
      arguments: {
        sessionId: "stdio-android-performance-dry-run",
        runnerProfile: "phase1",
        durationMs: 4000,
        preset: "interaction",
        dryRun: true,
      },
    },
  });
  const typedResult = result as { status: string; reasonCode: string; data: { supportLevel: string; captureMode: string; preset: string } };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.supportLevel, "full");
  assert.equal(typedResult.data.captureMode, "time_window");
  assert.equal(typedResult.data.preset, "interaction");
});

test("handleRequest supports tools/call alias for measure_ios_performance dry-run", async () => {
  const result = await handleRequest({
    id: 21,
    method: "tools/call",
    params: {
      name: "measure_ios_performance",
      arguments: {
        sessionId: "stdio-ios-performance-dry-run",
        runnerProfile: "phase1",
        durationMs: 4000,
        template: "time-profiler",
        dryRun: true,
      },
    },
  });
  const typedResult = result as { status: string; reasonCode: string; data: { supportLevel: string; captureMode: string; template: string } };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.supportLevel, "partial");
  assert.equal(typedResult.data.captureMode, "time_window");
  assert.equal(typedResult.data.template, "time-profiler");
});

test("handleRequest supports tools/call alias for measure_ios_performance memory dry-run", async () => {
  const result = await handleRequest({
    id: 22,
    method: "tools/call",
    params: {
      name: "measure_ios_performance",
      arguments: {
        sessionId: "stdio-ios-performance-memory-dry-run",
        runnerProfile: "phase1",
        durationMs: 4000,
        template: "memory",
        dryRun: true,
      },
    },
  });
  const typedResult = result as { status: string; reasonCode: string; data: { supportLevel: string; captureMode: string; template: string } };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.supportLevel, "partial");
  assert.equal(typedResult.data.captureMode, "time_window");
  assert.equal(typedResult.data.template, "memory");
});

test("handleRequest supports tools/call alias for install_app dry-run", async () => {
  const result = await handleRequest({
    id: 9,
    method: "tools/call",
    params: {
      name: "install_app",
      arguments: {
        sessionId: "stdio-install-app-dry-run",
        platform: "android",
        runnerProfile: "native_android",
        artifactPath: "package.json",
        dryRun: true,
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { dryRun: boolean; installCommand: string[] };
  };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.dryRun, true);
  assert.equal(typedResult.data.installCommand.some((item) => item.endsWith("package.json")), true);
});

test("handleRequest supports tools/call alias for launch_app dry-run", async () => {
  const result = await handleRequest({
    id: 10,
    method: "tools/call",
    params: {
      name: "launch_app",
      arguments: {
        sessionId: "stdio-launch-app-dry-run",
        platform: "android",
        runnerProfile: "native_android",
        appId: "com.example.demo",
        dryRun: true,
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { dryRun: boolean; launchCommand: string[] };
  };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.dryRun, true);
  assert.equal(typedResult.data.launchCommand.includes("monkey"), true);
});

test("handleRequest supports tools/call alias for terminate_app dry-run", async () => {
  const result = await handleRequest({
    id: 11,
    method: "tools/call",
    params: {
      name: "terminate_app",
      arguments: {
        sessionId: "stdio-terminate-app-dry-run",
        platform: "ios",
        appId: "host.exp.Exponent",
        dryRun: true,
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { dryRun: boolean; command: string[] };
  };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  assert.equal(typedResult.data.dryRun, true);
  assert.equal(typedResult.data.command[0], "xcrun");
});

test("handleRequest resolves launch_app context from active session with sessionId-only arguments", async () => {
  const sessionId = `stdio-launch-context-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);
  try {
    await handleRequest({
      id: 110,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId,
          platform: "android",
          deviceId: buildTestDeviceId(sessionId),
          appId: "com.example.demo",
          profile: "native_android",
        },
      },
    });

    const result = await handleRequest({
      id: 111,
      method: "tools/call",
      params: {
        name: "launch_app",
        arguments: {
          sessionId,
          dryRun: true,
        },
      },
    });
    const typedResult = result as {
      status: string;
      reasonCode: string;
      data: { dryRun: boolean; appId: string; launchCommand: string[]; queueWaitMs?: number };
    };

    assert.equal(typedResult.status, "success");
    assert.equal(typedResult.reasonCode, "OK");
    assert.equal(typedResult.data.dryRun, true);
    assert.equal(typedResult.data.appId, "com.example.demo");
    assert.equal(typedResult.data.launchCommand.includes("monkey"), true);
    assert.equal(typedResult.data.launchCommand.includes(buildTestDeviceId(sessionId)), true);
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("handleRequest resolves terminate_app context from active session with sessionId-only arguments", async () => {
  const sessionId = `stdio-terminate-context-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);
  try {
    await handleRequest({
      id: 112,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId,
          platform: "android",
          deviceId: buildTestDeviceId(sessionId),
          appId: "com.example.demo",
          profile: "native_android",
        },
      },
    });

    const result = await handleRequest({
      id: 113,
      method: "tools/call",
      params: {
        name: "terminate_app",
        arguments: {
          sessionId,
          dryRun: true,
        },
      },
    });
    const typedResult = result as {
      status: string;
      reasonCode: string;
      data: { dryRun: boolean; appId: string; command: string[] };
    };

    assert.equal(typedResult.status, "success");
    assert.equal(typedResult.reasonCode, "OK");
    assert.equal(typedResult.data.dryRun, true);
    assert.equal(typedResult.data.appId, "com.example.demo");
    assert.equal(typedResult.data.command[0], "adb");
    assert.equal(typedResult.data.command.includes(buildTestDeviceId(sessionId)), true);
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("handleRequest resolves install_app and reset_app_state context from active session", async () => {
  const sessionId = `stdio-lifecycle-context-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);
  try {
    await handleRequest({
      id: 114,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId,
          platform: "android",
          deviceId: buildTestDeviceId(sessionId),
          appId: "com.example.demo",
          profile: "native_android",
        },
      },
    });

    const install = await handleRequest({
      id: 115,
      method: "tools/call",
      params: {
        name: "install_app",
        arguments: {
          sessionId,
          artifactPath: "package.json",
          dryRun: true,
        },
      },
    });
    const typedInstall = install as {
      status: string;
      reasonCode: string;
      data: { dryRun: boolean; installCommand: string[] };
    };
    assert.equal(typedInstall.status, "success");
    assert.equal(typedInstall.reasonCode, "OK");
    assert.equal(typedInstall.data.installCommand.includes(buildTestDeviceId(sessionId)), true);

    const reset = await handleRequest({
      id: 116,
      method: "tools/call",
      params: {
        name: "reset_app_state",
        arguments: {
          sessionId,
          strategy: "clear_data",
          dryRun: true,
        },
      },
    });
    const typedReset = reset as {
      status: string;
      reasonCode: string;
      data: { dryRun: boolean; appId: string; commands: string[][] };
    };
    assert.equal(typedReset.status, "success");
    assert.equal(typedReset.reasonCode, "OK");
    assert.equal(typedReset.data.appId, "com.example.demo");
    assert.equal(typedReset.data.commands[0]?.includes(buildTestDeviceId(sessionId)), true);
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("handleRequest resolves inspect_ui/query_ui/resolve_ui_target/wait_for_ui context from active session", async () => {
  const sessionId = `stdio-wave1a-context-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);
  try {
    await handleRequest({
      id: 123,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId,
          platform: "android",
          deviceId: buildTestDeviceId(sessionId),
          profile: "phase1",
        },
      },
    });

    const inspectResult = await handleRequest({
      id: 124,
      method: "tools/call",
      params: {
        name: "inspect_ui",
        arguments: {
          sessionId,
          dryRun: true,
        },
      },
    });
    const typedInspect = inspectResult as { status: string; reasonCode: string; data: { dryRun: boolean; supportLevel: string; outputPath: string } };
    assert.equal(typedInspect.status, "success");
    assert.equal(typedInspect.reasonCode, "OK");
    assert.equal(typedInspect.data.dryRun, true);
    assert.equal(typedInspect.data.supportLevel, "full");
    assert.equal(typedInspect.data.outputPath.includes(`${sessionId}/android-phase1`), true);

    const queryResult = await handleRequest({
      id: 125,
      method: "tools/call",
      params: {
        name: "query_ui",
        arguments: {
          sessionId,
          contentDesc: "View products",
          dryRun: true,
        },
      },
    });
    const typedQuery = queryResult as { status: string; reasonCode: string; data: { dryRun: boolean; supportLevel: string } };
    assert.equal(typedQuery.status, "success");
    assert.equal(typedQuery.reasonCode, "OK");
    assert.equal(typedQuery.data.dryRun, true);
    assert.equal(typedQuery.data.supportLevel, "full");

    const resolveResult = await handleRequest({
      id: 126,
      method: "tools/call",
      params: {
        name: "resolve_ui_target",
        arguments: {
          sessionId,
          contentDesc: "View products",
          dryRun: true,
        },
      },
    });
    const typedResolve = resolveResult as { status: string; reasonCode: string; data: { supportLevel: string; resolution: { status: string } } };
    assert.equal(typedResolve.status, "partial");
    assert.equal(typedResolve.reasonCode, "UNSUPPORTED_OPERATION");
    assert.equal(typedResolve.data.supportLevel, "full");
    assert.equal(typedResolve.data.resolution.status, "not_executed");

    const waitResult = await handleRequest({
      id: 127,
      method: "tools/call",
      params: {
        name: "wait_for_ui",
        arguments: {
          sessionId,
          contentDesc: "View products",
          dryRun: true,
        },
      },
    });
    const typedWait = waitResult as { status: string; reasonCode: string; data: { supportLevel: string; polls: number } };
    assert.equal(typedWait.status, "partial");
    assert.equal(typedWait.reasonCode, "UNSUPPORTED_OPERATION");
    assert.equal(typedWait.data.supportLevel, "full");
    assert.equal(typedWait.data.polls, 0);
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("handleRequest returns configurationError for sessionId-only Wave 1A call when session is missing", async () => {
  const sessionId = `stdio-wave1a-missing-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);

  const result = await handleRequest({
    id: 128,
    method: "tools/call",
    params: {
      name: "query_ui",
      arguments: {
        sessionId,
        contentDesc: "View products",
        dryRun: true,
      },
    },
  });
  const typedResult = result as { status: string; reasonCode: string; data: { sessionFound: boolean; sessionClosed: boolean } };

  assert.equal(typedResult.status, "failed");
  assert.equal(typedResult.reasonCode, "CONFIGURATION_ERROR");
  assert.equal(typedResult.data.sessionFound, false);
  assert.equal(typedResult.data.sessionClosed, false);
});

test("handleRequest returns configurationError for sessionId-only Wave 1A call when session is closed", async () => {
  const sessionId = `stdio-wave1a-closed-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);
  try {
    await handleRequest({
      id: 129,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId,
          platform: "android",
          deviceId: buildTestDeviceId(sessionId),
          profile: "phase1",
        },
      },
    });
    await handleRequest({
      id: 130,
      method: "tools/call",
      params: {
        name: "end_session",
        arguments: {
          sessionId,
        },
      },
    });

    const result = await handleRequest({
      id: 131,
      method: "tools/call",
      params: {
        name: "inspect_ui",
        arguments: {
          sessionId,
          dryRun: true,
        },
      },
    });
    const typedResult = result as { status: string; reasonCode: string; data: { sessionFound: boolean; sessionClosed: boolean } };

    assert.equal(typedResult.status, "failed");
    assert.equal(typedResult.reasonCode, "CONFIGURATION_ERROR");
    assert.equal(typedResult.data.sessionFound, true);
    assert.equal(typedResult.data.sessionClosed, true);
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("handleRequest rejects Wave 1A call when explicit platform mismatches active session", async () => {
  const sessionId = `stdio-wave1a-platform-mismatch-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);
  try {
    await handleRequest({
      id: 132,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId,
          platform: "android",
          deviceId: buildTestDeviceId(sessionId),
          profile: "phase1",
        },
      },
    });

    const result = await handleRequest({
      id: 133,
      method: "tools/call",
      params: {
        name: "wait_for_ui",
        arguments: {
          sessionId,
          platform: "ios",
          contentDesc: "View products",
          dryRun: true,
        },
      },
    });
    const typedResult = result as { status: string; reasonCode: string; data: { expectedPlatform: string; receivedPlatform: string } };

    assert.equal(typedResult.status, "failed");
    assert.equal(typedResult.reasonCode, "CONFIGURATION_ERROR");
    assert.equal(typedResult.data.expectedPlatform, "android");
    assert.equal(typedResult.data.receivedPlatform, "ios");
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("handleRequest resolves Wave 1B context from active session", async () => {
  const sessionId = `stdio-wave1b-context-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);
  try {
    await handleRequest({
      id: 134,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId,
          platform: "android",
          deviceId: buildTestDeviceId(sessionId),
          profile: "phase1",
        },
      },
    });

    const tapElementResult = await handleRequest({
      id: 135,
      method: "tools/call",
      params: {
        name: "tap_element",
        arguments: {
          sessionId,
          contentDesc: "View products",
          dryRun: true,
        },
      },
    });
    const typedTap = tapElementResult as { status: string; reasonCode: string; data: { supportLevel: string; resolution?: { status: string } } };
    assert.equal(typedTap.status, "partial");
    assert.equal(typedTap.reasonCode, "UNSUPPORTED_OPERATION");
    assert.equal(typedTap.data.supportLevel, "full");

    const typeIntoResult = await handleRequest({
      id: 136,
      method: "tools/call",
      params: {
        name: "type_into_element",
        arguments: {
          sessionId,
          contentDesc: "View products",
          value: "hello",
          dryRun: true,
        },
      },
    });
    const typedTypeInto = typeIntoResult as { status: string; reasonCode: string; data: { supportLevel: string } };
    assert.equal(typedTypeInto.status, "partial");
    assert.equal(typedTypeInto.reasonCode, "UNSUPPORTED_OPERATION");
    assert.equal(typedTypeInto.data.supportLevel, "full");

    const scrollResolveResult = await handleRequest({
      id: 137,
      method: "tools/call",
      params: {
        name: "scroll_and_resolve_ui_target",
        arguments: {
          sessionId,
          contentDesc: "View products",
          maxSwipes: 2,
          dryRun: true,
        },
      },
    });
    const typedScrollResolve = scrollResolveResult as { status: string; reasonCode: string; data: { supportLevel: string; resolution: { status: string } } };
    assert.equal(typedScrollResolve.status, "partial");
    assert.equal(typedScrollResolve.reasonCode, "UNSUPPORTED_OPERATION");
    assert.equal(typedScrollResolve.data.supportLevel, "full");
    assert.equal(typedScrollResolve.data.resolution.status, "not_executed");

    const scrollTapResult = await handleRequest({
      id: 138,
      method: "tools/call",
      params: {
        name: "scroll_and_tap_element",
        arguments: {
          sessionId,
          contentDesc: "View products",
          maxSwipes: 2,
          dryRun: true,
        },
      },
    });
    const typedScrollTap = scrollTapResult as { status: string; reasonCode: string; data: { supportLevel: string } };
    assert.equal(typedScrollTap.status, "partial");
    assert.equal(typedScrollTap.reasonCode, "UNSUPPORTED_OPERATION");
    assert.equal(typedScrollTap.data.supportLevel, "full");
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("handleRequest returns configurationError for sessionId-only Wave 1B call when session is missing", async () => {
  const sessionId = `stdio-wave1b-missing-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);

  const result = await handleRequest({
    id: 139,
    method: "tools/call",
    params: {
      name: "tap_element",
      arguments: {
        sessionId,
        contentDesc: "View products",
        dryRun: true,
      },
    },
  });
  const typedResult = result as { status: string; reasonCode: string; data: { sessionFound: boolean; sessionClosed: boolean } };

  assert.equal(typedResult.status, "failed");
  assert.equal(typedResult.reasonCode, "CONFIGURATION_ERROR");
  assert.equal(typedResult.data.sessionFound, false);
  assert.equal(typedResult.data.sessionClosed, false);
});

test("handleRequest returns configurationError for sessionId-only Wave 1B call when session is closed", async () => {
  const sessionId = `stdio-wave1b-closed-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);
  try {
    await handleRequest({
      id: 140,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId,
          platform: "android",
          deviceId: buildTestDeviceId(sessionId),
          profile: "phase1",
        },
      },
    });
    await handleRequest({
      id: 141,
      method: "tools/call",
      params: {
        name: "end_session",
        arguments: {
          sessionId,
        },
      },
    });

    const result = await handleRequest({
      id: 142,
      method: "tools/call",
      params: {
        name: "scroll_and_resolve_ui_target",
        arguments: {
          sessionId,
          contentDesc: "View products",
          dryRun: true,
        },
      },
    });
    const typedResult = result as { status: string; reasonCode: string; data: { sessionFound: boolean; sessionClosed: boolean } };

    assert.equal(typedResult.status, "failed");
    assert.equal(typedResult.reasonCode, "CONFIGURATION_ERROR");
    assert.equal(typedResult.data.sessionFound, true);
    assert.equal(typedResult.data.sessionClosed, true);
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("handleRequest rejects Wave 1B call when explicit platform mismatches active session", async () => {
  const sessionId = `stdio-wave1b-platform-mismatch-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);
  try {
    await handleRequest({
      id: 143,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId,
          platform: "android",
          deviceId: buildTestDeviceId(sessionId),
          profile: "phase1",
        },
      },
    });

    const result = await handleRequest({
      id: 144,
      method: "tools/call",
      params: {
        name: "type_into_element",
        arguments: {
          sessionId,
          platform: "ios",
          contentDesc: "View products",
          value: "hello",
          dryRun: true,
        },
      },
    });
    const typedResult = result as { status: string; reasonCode: string; data: { expectedPlatform: string; receivedPlatform: string } };

    assert.equal(typedResult.status, "failed");
    assert.equal(typedResult.reasonCode, "CONFIGURATION_ERROR");
    assert.equal(typedResult.data.expectedPlatform, "android");
    assert.equal(typedResult.data.receivedPlatform, "ios");
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("handleRequest resolves Wave 2 session-bound context from active session", async () => {
  const sessionId = `stdio-wave2-context-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);
  try {
    await handleRequest({
      id: 145,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId,
          platform: "android",
          deviceId: buildTestDeviceId(sessionId),
          appId: "com.example.demo",
          profile: "phase1",
        },
      },
    });

    const tapResult = await handleRequest({ id: 146, method: "tools/call", params: { name: "tap", arguments: { sessionId, x: 120, y: 320, dryRun: true } } }) as { status: string; reasonCode: string; data: { command: string[] } };
    assert.equal(tapResult.status, "success");
    assert.equal(tapResult.reasonCode, "OK");
    assert.equal(tapResult.data.command.includes(buildTestDeviceId(sessionId)), true);

    const typeTextResult = await handleRequest({ id: 147, method: "tools/call", params: { name: "type_text", arguments: { sessionId, text: "hello", dryRun: true } } }) as { status: string; reasonCode: string };
    assert.equal(typeTextResult.status, "partial");
    assert.equal(typeTextResult.reasonCode, "UNSUPPORTED_OPERATION");

    const screenshotResult = await handleRequest({ id: 148, method: "tools/call", params: { name: "take_screenshot", arguments: { sessionId, dryRun: true } } }) as { status: string; reasonCode: string; data: { outputPath: string } };
    assert.equal(screenshotResult.status, "success");
    assert.equal(screenshotResult.reasonCode, "OK");
    assert.equal(screenshotResult.data.outputPath.includes(`${sessionId}/android-phase1`), true);

    const recordResult = await handleRequest({ id: 149, method: "tools/call", params: { name: "record_screen", arguments: { sessionId, durationMs: 3000, dryRun: true } } }) as { status: string; reasonCode: string };
    assert.equal(recordResult.status, "success");
    assert.equal(recordResult.reasonCode, "OK");

    const logsResult = await handleRequest({ id: 150, method: "tools/call", params: { name: "get_logs", arguments: { sessionId, dryRun: true } } }) as { status: string; reasonCode: string };
    assert.equal(logsResult.status, "success");
    assert.equal(logsResult.reasonCode, "OK");

    const crashResult = await handleRequest({ id: 151, method: "tools/call", params: { name: "get_crash_signals", arguments: { sessionId, dryRun: true } } }) as { status: string; reasonCode: string };
    assert.equal(crashResult.status, "success");
    assert.equal(crashResult.reasonCode, "OK");

    const diagnosticsResult = await handleRequest({ id: 152, method: "tools/call", params: { name: "collect_diagnostics", arguments: { sessionId, dryRun: true } } }) as { status: string; reasonCode: string };
    assert.equal(diagnosticsResult.status, "success");
    assert.equal(diagnosticsResult.reasonCode, "OK");
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("handleRequest resolves Wave 3/4 session-bound context from active session", async () => {
  const sessionId = `stdio-wave34-context-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);
  try {
    await handleRequest({
      id: 153,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId,
          platform: "android",
          deviceId: buildTestDeviceId(sessionId),
          appId: "com.example.demo",
          profile: "phase1",
        },
      },
    });

    const debugResult = await handleRequest({ id: 154, method: "tools/call", params: { name: "collect_debug_evidence", arguments: { sessionId, dryRun: true } } }) as { status: string; reasonCode: string; data: { diagnosisPacket?: { strongestSuspectLayer?: string; confidence?: string; escalationThreshold?: string } } };
    assert.equal(debugResult.reasonCode, "OK");
    assert.equal(debugResult.data.diagnosisPacket?.strongestSuspectLayer, "environment");
    assert.equal(debugResult.data.diagnosisPacket?.confidence, "moderate");
    assert.equal(debugResult.data.diagnosisPacket?.escalationThreshold, "if_summary_inconclusive");

    const screenSummary = await handleRequest({ id: 155, method: "tools/call", params: { name: "get_screen_summary", arguments: { sessionId, dryRun: true } } }) as { status: string; reasonCode: string };
    assert.equal(screenSummary.reasonCode === "OK" || screenSummary.reasonCode === "UNSUPPORTED_OPERATION", true);

    const perfAndroid = await handleRequest({ id: 156, method: "tools/call", params: { name: "measure_android_performance", arguments: { sessionId, dryRun: true } } }) as { status: string; reasonCode: string };
    assert.equal(perfAndroid.status, "success");
    assert.equal(perfAndroid.reasonCode, "OK");

    const runFlow = await handleRequest({ id: 157, method: "tools/call", params: { name: "run_flow", arguments: { sessionId, runCount: 1, dryRun: true } } }) as { status: string; reasonCode: string };
    assert.equal(runFlow.status, "success");
    assert.equal(runFlow.reasonCode, "OK");

    const action = await handleRequest({ id: 158, method: "tools/call", params: { name: "perform_action_with_evidence", arguments: { sessionId, dryRun: true, action: { actionType: "tap_element", contentDesc: "View products" } } } }) as { reasonCode: string };
    assert.equal(action.reasonCode, "UNSUPPORTED_OPERATION");

    const recover = await handleRequest({ id: 159, method: "tools/call", params: { name: "recover_to_known_state", arguments: { sessionId, dryRun: true } } }) as { reasonCode: string };
    assert.equal(recover.reasonCode, "OK");

    const replay = await handleRequest({ id: 163, method: "tools/call", params: { name: "replay_last_stable_path", arguments: { sessionId, dryRun: true } } }) as { reasonCode: string };
    assert.equal(typeof replay.reasonCode, "string");

    const resolveInterruption = await handleRequest({ id: 164, method: "tools/call", params: { name: "resolve_interruption", arguments: { sessionId, dryRun: true } } }) as { reasonCode: string };
    assert.equal(typeof resolveInterruption.reasonCode, "string");

    const resume = await handleRequest({ id: 165, method: "tools/call", params: { name: "resume_interrupted_action", arguments: { sessionId, dryRun: true } } }) as { reasonCode: string };
    assert.equal(typeof resume.reasonCode, "string");
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("handleRequest returns configurationError for sessionId-only downshifted calls when session is missing", async () => {
  const sessionId = `stdio-wave234-missing-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);

  const wave2 = await handleRequest({ id: 160, method: "tools/call", params: { name: "tap", arguments: { sessionId, x: 1, y: 1, dryRun: true } } }) as { status: string; reasonCode: string };
  assert.equal(wave2.status, "failed");
  assert.equal(wave2.reasonCode, "CONFIGURATION_ERROR");

  const wave3 = await handleRequest({ id: 161, method: "tools/call", params: { name: "get_screen_summary", arguments: { sessionId, dryRun: true } } }) as { status: string; reasonCode: string };
  assert.equal(wave3.status, "failed");
  assert.equal(wave3.reasonCode, "CONFIGURATION_ERROR");

  const wave4 = await handleRequest({ id: 162, method: "tools/call", params: { name: "run_flow", arguments: { sessionId, runCount: 1, dryRun: true } } }) as { status: string; reasonCode: string };
  assert.equal(wave4.status, "failed");
  assert.equal(wave4.reasonCode, "CONFIGURATION_ERROR");

  const wave4Resolve = await handleRequest({ id: 166, method: "tools/call", params: { name: "resolve_interruption", arguments: { sessionId, dryRun: true } } }) as { status: string; reasonCode: string };
  assert.equal(wave4Resolve.status, "failed");
  assert.equal(wave4Resolve.reasonCode, "CONFIGURATION_ERROR");

  const wave4Resume = await handleRequest({ id: 167, method: "tools/call", params: { name: "resume_interrupted_action", arguments: { sessionId, dryRun: true } } }) as { status: string; reasonCode: string };
  assert.equal(wave4Resume.status, "failed");
  assert.equal(wave4Resume.reasonCode, "CONFIGURATION_ERROR");

  const wave4Replay = await handleRequest({ id: 168, method: "tools/call", params: { name: "replay_last_stable_path", arguments: { sessionId, dryRun: true } } }) as { status: string; reasonCode: string };
  assert.equal(wave4Replay.status, "failed");
  assert.equal(wave4Replay.reasonCode, "CONFIGURATION_ERROR");
});

test("handleRequest classify_interruption supports sessionId-only with active session", async () => {
  const sessionId = `stdio-classify-active-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);
  try {
    await handleRequest({
      id: 169,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId,
          platform: "android",
          deviceId: buildTestDeviceId(sessionId),
          profile: "phase1",
        },
      },
    });

    const result = await handleRequest({ id: 170, method: "tools/call", params: { name: "classify_interruption", arguments: { sessionId, dryRun: true } } }) as { status: string; reasonCode: string };
    assert.equal(result.status === "success" || result.status === "partial", true);
    assert.equal(typeof result.reasonCode, "string");
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("handleRequest classify_interruption returns configurationError when session is missing and platform omitted", async () => {
  const sessionId = `stdio-classify-missing-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);
  const result = await handleRequest({ id: 171, method: "tools/call", params: { name: "classify_interruption", arguments: { sessionId, dryRun: true } } }) as { status: string; reasonCode: string };
  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, "CONFIGURATION_ERROR");
});

test("handleRequest returns configurationError for sessionId-only lifecycle call when session is missing", async () => {
  const sessionId = `stdio-missing-session-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);

  const result = await handleRequest({
    id: 117,
    method: "tools/call",
    params: {
      name: "launch_app",
      arguments: {
        sessionId,
        dryRun: true,
      },
    },
  });
  const typedResult = result as { status: string; reasonCode: string; data: { sessionFound: boolean; sessionClosed: boolean } };

  assert.equal(typedResult.status, "failed");
  assert.equal(typedResult.reasonCode, "CONFIGURATION_ERROR");
  assert.equal(typedResult.data.sessionFound, false);
  assert.equal(typedResult.data.sessionClosed, false);
});

test("handleRequest returns configurationError for sessionId-only lifecycle call when session is closed", async () => {
  const sessionId = `stdio-closed-session-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);
  try {
    await handleRequest({
      id: 118,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId,
          platform: "android",
          deviceId: buildTestDeviceId(sessionId),
          appId: "com.example.demo",
          profile: "native_android",
        },
      },
    });
    await handleRequest({
      id: 119,
      method: "tools/call",
      params: {
        name: "end_session",
        arguments: {
          sessionId,
        },
      },
    });

    const result = await handleRequest({
      id: 120,
      method: "tools/call",
      params: {
        name: "terminate_app",
        arguments: {
          sessionId,
          dryRun: true,
        },
      },
    });
    const typedResult = result as { status: string; reasonCode: string; data: { sessionFound: boolean; sessionClosed: boolean } };

    assert.equal(typedResult.status, "failed");
    assert.equal(typedResult.reasonCode, "CONFIGURATION_ERROR");
    assert.equal(typedResult.data.sessionFound, true);
    assert.equal(typedResult.data.sessionClosed, true);
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("handleRequest rejects lifecycle call when runnerProfile mismatches active session", async () => {
  const sessionId = `stdio-profile-mismatch-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);
  try {
    await handleRequest({
      id: 121,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId,
          platform: "android",
          deviceId: buildTestDeviceId(sessionId),
          appId: "com.example.demo",
          profile: "native_android",
        },
      },
    });

    const result = await handleRequest({
      id: 122,
      method: "tools/call",
      params: {
        name: "launch_app",
        arguments: {
          sessionId,
          runnerProfile: "phase1",
          dryRun: true,
        },
      },
    });
    const typedResult = result as {
      status: string;
      reasonCode: string;
      data: { expectedRunnerProfile: string; receivedRunnerProfile: string };
    };

    assert.equal(typedResult.status, "failed");
    assert.equal(typedResult.reasonCode, "CONFIGURATION_ERROR");
    assert.equal(typedResult.data.expectedRunnerProfile, "native_android");
    assert.equal(typedResult.data.receivedRunnerProfile, "phase1");
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("handleRequest supports tools/call alias for iOS tap dry-run", async () => {
  const result = await handleRequest({
    id: 12,
    method: "tools/call",
    params: {
      name: "tap",
      arguments: {
        sessionId: "stdio-ios-tap-dry-run",
        platform: "ios",
        x: 12,
        y: 34,
        dryRun: true,
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { command: string[] };
  };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  // AXe CLI format: ["axe", "tap", "-x", "12", "-y", "34", "--udid", "..."]
  assert.equal(typedResult.data.command[0], "axe");
  assert.equal(typedResult.data.command.includes("tap"), true);
  assert.equal(typedResult.data.command.includes("12"), true);
  assert.equal(typedResult.data.command.includes("34"), true);
  assert.equal(typedResult.data.command.includes("--udid"), true);
  assert.equal(typedResult.data.command.includes("ADA078B9-3C6B-4875-8B85-A7789F368816"), true);
});

test("handleRequest supports tools/call alias for iOS type_text dry-run", async () => {
  const result = await handleRequest({
    id: 13,
    method: "tools/call",
    params: {
      name: "type_text",
      arguments: {
        sessionId: "stdio-ios-type-text-dry-run",
        platform: "ios",
        text: "hello",
        dryRun: true,
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { command: string[] };
  };

  assert.equal(typedResult.status, "success");
  assert.equal(typedResult.reasonCode, "OK");
  // AXe CLI format: ["axe", "type", "hello", "--udid", "..."]
  assert.equal(typedResult.data.command[0], "axe");
  assert.equal(typedResult.data.command.includes("hello"), true);
  assert.equal(typedResult.data.command.includes("--udid"), true);
  assert.equal(typedResult.data.command.includes("ADA078B9-3C6B-4875-8B85-A7789F368816"), true);
});


test("handleRequest supports tools/call alias for iOS scroll_and_resolve_ui_target dry-run", async () => {
  const result = await handleRequest({
    id: 17,
    method: "tools/call",
    params: {
      name: "scroll_and_resolve_ui_target",
      arguments: {
        sessionId: "stdio-ios-scroll-dry-run",
        platform: "ios",
        contentDesc: "View products",
        maxSwipes: 2,
        dryRun: true,
      },
    },
  });
  const typedResult = result as {
    status: string;
    reasonCode: string;
    data: { supportLevel: string; resolution: { status: string }; commandHistory: string[][] };
  };

  assert.equal(typedResult.status, "partial");
  assert.equal(typedResult.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(typedResult.data.supportLevel, "full");
  assert.equal(typedResult.data.resolution.status, "not_executed");
  assert.equal(typedResult.data.commandHistory[1]?.includes("swipe"), true);
});

test("handleRequest supports tools/call alias for start_session", async () => {
  const sessionId = "stdio-start-session";
  await cleanupSessionArtifact(sessionId);
  try {
    const result = await handleRequest({
      id: 14,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId,
          platform: "android",
          deviceId: buildTestDeviceId(sessionId),
          profile: "phase1",
        },
      },
    });
    const typedResult = result as {
      status: string;
      reasonCode: string;
      artifacts: string[];
      data: { sessionId: string };
    };

    assert.equal(typedResult.status, "success");
    assert.equal(typedResult.reasonCode, "OK");
    assert.equal(typedResult.data.sessionId, sessionId);
    assert.equal(typedResult.artifacts.some((item) => item.endsWith(`${sessionId}.json`)), true);
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("handleRequest supports tools/call alias for end_session", async () => {
  const sessionId = "stdio-end-session";
  await cleanupSessionArtifact(sessionId);
  try {
    await handleRequest({
      id: 15,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId,
          platform: "android",
          deviceId: buildTestDeviceId(sessionId),
          profile: "phase1",
        },
      },
    });

    const result = await handleRequest({
      id: 16,
      method: "tools/call",
      params: {
        name: "end_session",
        arguments: {
          sessionId,
          artifacts: ["artifacts/demo/output.txt"],
        },
      },
    });
    const typedResult = result as {
      status: string;
      reasonCode: string;
      artifacts: string[];
      data: { closed: boolean; endedAt: string };
    };

    assert.equal(typedResult.status, "success");
    assert.equal(typedResult.reasonCode, "OK");
    assert.equal(typedResult.data.closed, true);
    assert.equal(typeof typedResult.data.endedAt, "string");
    assert.equal(typedResult.artifacts.some((item) => item.endsWith(`${sessionId}.json`)), true);
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("handleRequest denies tap under a read-only session policy", async () => {
  const sessionId = `stdio-read-only-${Date.now()}`;
  await cleanupSessionArtifact(sessionId);

  try {
    await handleRequest({
      id: 18,
      method: "tools/call",
      params: {
        name: "start_session",
        arguments: {
          sessionId,
          platform: "android",
          deviceId: buildTestDeviceId(sessionId),
          profile: "phase1",
          policyProfile: "read-only",
        },
      },
    });

    const result = await handleRequest({
      id: 19,
      method: "tools/call",
      params: {
        name: "tap",
        arguments: {
          sessionId,
          platform: "android",
          x: 10,
          y: 20,
          dryRun: true,
        },
      },
    });
    const typedResult = result as { status: string; reasonCode: string };

    assert.equal(typedResult.status, "failed");
    assert.equal(typedResult.reasonCode, "POLICY_DENIED");
  } finally {
    await cleanupSessionArtifact(sessionId);
  }
});

test("handleRequest supports tools/list alias", async () => {
  const result = await handleRequest({ id: 3, method: "tools/list" });
  const typedResult = result as Array<{ name: string }>;

  assert.ok(typedResult.some((tool) => tool.name === "query_ui"));
  assert.ok(typedResult.some((tool) => tool.name === "capture_js_console_logs"));
  assert.ok(typedResult.some((tool) => tool.name === "capture_js_network_events"));
  assert.ok(typedResult.some((tool) => tool.name === "collect_debug_evidence"));
  assert.ok(typedResult.some((tool) => tool.name === "list_js_debug_targets"));
  assert.ok(typedResult.some((tool) => tool.name === "measure_android_performance"));
  assert.ok(typedResult.some((tool) => tool.name === "measure_ios_performance"));
  assert.ok(typedResult.some((tool) => tool.name === "wait_for_ui"));
});

test("handleRequest rejects invoke calls without an object payload", async () => {
  await assert.rejects(
    () => handleRequest({ id: 4, method: "invoke", params: null }),
    /invoke requires an object params payload/,
  );
});

test("handleRequest rejects unsupported stdio methods", async () => {
  await assert.rejects(
    () => handleRequest({ id: 5, method: "bogus_method" }),
    /Unsupported stdio method: bogus_method/,
  );
});
