import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	createPageContextDecisionLog,
	serializeDecisionLog,
} from "../src/page-context-decision-log.js";
import type { PageContextDecisionRecord } from "../src/page-context-decision-log.js";

describe("createPageContextDecisionLog", () => {
	it("starts empty", () => {
		const log = createPageContextDecisionLog();
		assert.deepEqual(log.getEntries(), []);
	});

	it("records and returns entries", () => {
		const log = createPageContextDecisionLog();
		const entry: PageContextDecisionRecord = {
			screenId: "screen-1",
			screenTitle: "Home",
			timestamp: "2024-01-01T00:00:00Z",
			finalOutcome: "expanded",
			outcomeReason: "normal page",
		};
		log.record(entry);
		assert.equal(log.getEntries().length, 1);
		assert.equal(log.getEntries()[0].screenId, "screen-1");
	});

	it("returns a copy of entries", () => {
		const log = createPageContextDecisionLog();
		log.record({
			screenId: "s1",
			timestamp: "2024-01-01T00:00:00Z",
			finalOutcome: "expanded",
			outcomeReason: "r1",
		});
		const entries = log.getEntries();
		entries.pop();
		assert.equal(log.getEntries().length, 1);
	});
});

describe("serializeDecisionLog", () => {
	it("serializes empty array to empty string", () => {
		assert.equal(serializeDecisionLog([]), "");
	});

	it("serializes entries as jsonl", () => {
		const entries: PageContextDecisionRecord[] = [
			{
				screenId: "s1",
				timestamp: "2024-01-01T00:00:00Z",
				finalOutcome: "expanded",
				outcomeReason: "normal",
			},
			{
				screenId: "s2",
				timestamp: "2024-01-01T00:00:01Z",
				finalOutcome: "gated",
				outcomeReason: "blocked",
			},
		];
		const jsonl = serializeDecisionLog(entries);
		const lines = jsonl.split("\n");
		assert.equal(lines.length, 2);
		assert.equal(JSON.parse(lines[0]).screenId, "s1");
		assert.equal(JSON.parse(lines[1]).screenId, "s2");
	});
});
