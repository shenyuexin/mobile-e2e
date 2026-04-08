import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const toolDataSchemasDir = path.join(repoRoot, "packages/contracts/tool-data-schemas");

// Minimal JSON Schema validator (subset sufficient for our tool schemas)
function validateAgainstSchema(data: unknown, schema: Record<string, unknown>, pathStr: string = "$"): string[] {
  const errors: string[] = [];

  if ("type" in schema) {
    const expectedType = schema.type as string;
    const actualType = data === null ? "null" : typeof data;

    if (expectedType === "object" && (typeof data !== "object" || data === null || Array.isArray(data))) {
      errors.push(`${pathStr}: expected object, got ${actualType}`);
      return errors;
    }
    if (expectedType === "array" && !Array.isArray(data)) {
      errors.push(`${pathStr}: expected array, got ${actualType}`);
      return errors;
    }
    if (expectedType === "string" && typeof data !== "string") {
      errors.push(`${pathStr}: expected string, got ${actualType}`);
    }
    if (expectedType === "number" && typeof data !== "number") {
      errors.push(`${pathStr}: expected number, got ${actualType}`);
    }
    if (expectedType === "integer" && (typeof data !== "number" || !Number.isInteger(data))) {
      errors.push(`${pathStr}: expected integer, got ${actualType}`);
    }
    if (expectedType === "boolean" && typeof data !== "boolean") {
      errors.push(`${pathStr}: expected boolean, got ${actualType}`);
    }
  }

  if ("enum" in schema && Array.isArray(schema.enum)) {
    if (!(schema.enum as unknown[]).includes(data)) {
      errors.push(`${pathStr}: value ${JSON.stringify(data)} not in enum`);
    }
  }

  if (typeof data === "number") {
    if ("minimum" in schema && data < (schema.minimum as number)) {
      errors.push(`${pathStr}: value ${data} is less than minimum ${schema.minimum}`);
    }
    if ("maximum" in schema && data > (schema.maximum as number)) {
      errors.push(`${pathStr}: value ${data} exceeds maximum ${schema.maximum}`);
    }
  }

  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;

    if ("required" in schema && Array.isArray(schema.required)) {
      for (const field of schema.required as string[]) {
        if (!(field in obj)) {
          errors.push(`${pathStr}: missing required field "${field}"`);
        }
      }
    }

    if ("properties" in schema && typeof schema.properties === "object") {
      const properties = schema.properties as Record<string, Record<string, unknown>>;
      for (const [key, propSchema] of Object.entries(properties)) {
        if (key in obj) {
          errors.push(...validateAgainstSchema(obj[key], propSchema, `${pathStr}.${key}`));
        }
      }
    }
  }

  if (Array.isArray(data) && "items" in schema && typeof schema.items === "object") {
    for (let i = 0; i < Math.min(data.length, 3); i++) {
      errors.push(...validateAgainstSchema(data[i], schema.items as Record<string, unknown>, `${pathStr}[${i}]`));
    }
  }

  return errors;
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
        errors.some((e) => e.includes("missing required field")),
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
