import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const toolDataSchemasDir = path.join(repoRoot, "packages/contracts/tool-data-schemas");

const ajv = new Ajv2020({ allErrors: true, strict: false });

// Cache compiled validators by schema $id to avoid duplicate registration
const validatorCache = new Map<string, ReturnType<typeof ajv.compile>>();

function validateAgainstSchema(data: unknown, schema: Record<string, unknown>): string[] {
  const schemaId = (schema["$id"] as string) || "__anonymous__";
  let validate = validatorCache.get(schemaId);
  if (!validate) {
    validate = ajv.compile(schema);
    validatorCache.set(schemaId, validate);
  }
  const valid = validate(data);
  if (valid) return [];
  return (validate.errors || []).map(
    (e) => `${e.instancePath || "$"}: ${e.message || "unknown error"}`,
  );
}

function buildValidPayload(toolName: string): Record<string, unknown> {
  switch (toolName) {
    case "perform_action_with_evidence":
      return {
        sessionRecordFound: true,
        outcome: {
          actionId: "test-1",
          actionType: "tap_element",
          outcome: "success",
          stateChanged: true,
        },
        evidenceDelta: {},
        lowLevelStatus: "success",
        lowLevelReasonCode: "none",
      };
    case "get_action_outcome":
      return {
        found: true,
        actionId: "test-1",
        outcome: {
          actionId: "test-1",
          actionType: "tap_element",
          outcome: "success",
          stateChanged: true,
        },
      };
    case "explain_last_failure":
      return {
        found: true,
        outcome: {
          actionId: "test-1",
          actionType: "tap_element",
          outcome: "failed",
        },
        diagnosisPacket: {
          strongestSuspectLayer: "ui_locator",
          strongestCausalSignal: "no match",
          confidence: "strong",
          recommendedNextProbe: "inspect_ui",
          recommendedRecovery: "refine",
          escalationThreshold: "none",
        },
      };
    case "rank_failure_candidates":
      return {
        found: true,
        candidates: [
          {
            affectedLayer: "ui_locator",
            mostLikelyCause: "bad selector",
          },
        ],
      };
    case "describe_capabilities":
      return {
        platform: "android",
        capabilities: {
          platform: "android",
          toolCapabilities: [{
            toolName: "tap_element",
            supportLevel: "full",
            note: "works",
          }],
          groups: [{
            groupName: "UI",
            supportLevel: "full",
            toolNames: ["tap_element"],
          }],
        },
      };
    case "get_session_state":
      return {
        platform: "android",
        runnerProfile: "phase1",
        sessionRecordFound: true,
        state: {
          appPhase: "ready",
          readiness: "ready",
        },
        capabilities: {
          platform: "android",
          toolCapabilities: [],
        },
        screenSummary: {
          appPhase: "ready",
          readiness: "ready",
        },
      };
    case "navigate_back":
      return {
        dryRun: true,
        target: "app",
        executedStrategy: "android_keyevent",
        supportLevel: "full",
        fallbackUsed: false,
        preBackTreeHash: "abc123",
        postBackTreeHash: "def456",
        pageTreeHashUnchanged: false,
      };
    default:
      return {};
  }
}

function buildInvalidPayload(toolName: string): Record<string, unknown> {
  // Remove required fields to trigger validation errors
  const valid = buildValidPayload(toolName);
  delete valid[Object.keys(valid)[0]]; // Remove first required field
  return valid;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test("tool-data-schemas directory exists and contains schemas", async () => {
  const files = await readdir(toolDataSchemasDir);
  const schemaFiles = files.filter((f) => f.endsWith(".schema.json") && f !== "index.json");

  assert.ok(schemaFiles.length > 0, "Expected at least one tool data schema file");

  // Verify expected Tier 1 schemas
  const expectedSchemas = [
    "perform_action_with_evidence.schema.json",
    "get_action_outcome.schema.json",
    "explain_last_failure.schema.json",
    "rank_failure_candidates.schema.json",
    "describe_capabilities.schema.json",
    "get_session_state.schema.json",
    "navigate_back.schema.json",
  ];

  for (const expected of expectedSchemas) {
    assert.ok(
      schemaFiles.includes(expected),
      `Expected schema file: ${expected}`,
    );
  }
});

test("each schema has required metadata fields", async () => {
  const files = await readdir(toolDataSchemasDir);
  const schemaFiles = files.filter((f) => f.endsWith(".schema.json") && f !== "index.json");

  for (const schemaFile of schemaFiles) {
    await test(schemaFile, async () => {
      const schemaPath = path.join(toolDataSchemasDir, schemaFile);
      const content = await readFile(schemaPath, "utf-8");
      const schema = JSON.parse(content);

      assert.ok(schema["$id"], `${schemaFile} should have $id`);
      assert.ok(schema["title"], `${schemaFile} should have title`);
      assert.ok(schema["type"], `${schemaFile} should have type`);
      assert.ok(schema["description"], `${schemaFile} should have description`);
    });
  }
});

test("valid payloads pass schema validation", async () => {
  const files = await readdir(toolDataSchemasDir);
  const schemaFiles = files.filter((f) => f.endsWith(".schema.json") && f !== "index.json");

  for (const schemaFile of schemaFiles) {
    await test(schemaFile.replace(".schema.json", ""), async () => {
      const schemaPath = path.join(toolDataSchemasDir, schemaFile);
      const content = await readFile(schemaPath, "utf-8");
      const schema = JSON.parse(content);
      const toolName = schemaFile.replace(".schema.json", "");

      const payload = buildValidPayload(toolName);
      const errors = validateAgainstSchema(payload, schema);

      assert.equal(
        errors.length,
        0,
        `Valid payload for ${toolName} should pass validation, got errors: ${errors.join("; ")}`,
      );
    });
  }
});

test("invalid payloads fail schema validation", async () => {
  const files = await readdir(toolDataSchemasDir);
  const schemaFiles = files.filter((f) => f.endsWith(".schema.json") && f !== "index.json");

  for (const schemaFile of schemaFiles) {
    await test(`${schemaFile.replace(".schema.json", "")} (invalid)`, async () => {
      const schemaPath = path.join(toolDataSchemasDir, schemaFile);
      const content = await readFile(schemaPath, "utf-8");
      const schema = JSON.parse(content);
      const toolName = schemaFile.replace(".schema.json", "");

      const payload = buildInvalidPayload(toolName);
      const errors = validateAgainstSchema(payload, schema);

      assert.ok(
        errors.length > 0,
        `Invalid payload for ${toolName} should fail validation`,
      );
      assert.ok(
        errors.some((e) => e.includes("required")),
        `Expected missing field error, got: ${errors.join("; ")}`,
      );
    });
  }
});

test("ToolResult envelope schema has required fields", async () => {
  const envelopePath = path.join(repoRoot, "packages/contracts/tool-result.schema.json");
  const content = await readFile(envelopePath, "utf-8");
  const schema = JSON.parse(content);

  const expectedRequired = [
    "status",
    "reasonCode",
    "sessionId",
    "durationMs",
    "attempts",
    "artifacts",
    "data",
    "nextSuggestions",
  ];

  for (const field of expectedRequired) {
    assert.ok(
      schema.required.includes(field),
      `ToolResult schema should require "${field}"`,
    );
  }
});

test("tool-data-schemas index.json references all schemas", async () => {
  const indexPath = path.join(toolDataSchemasDir, "index.json");
  const content = await readFile(indexPath, "utf-8");
  const index = JSON.parse(content);

  const files = await readdir(toolDataSchemasDir);
  const schemaFiles = files.filter((f) => f.endsWith(".schema.json") && f !== "index.json");

  for (const schemaFile of schemaFiles) {
    const toolName = schemaFile.replace(".schema.json", "");
    assert.ok(
      index.properties && index.properties[toolName],
      `index.json should reference ${toolName}`,
    );
  }
});
