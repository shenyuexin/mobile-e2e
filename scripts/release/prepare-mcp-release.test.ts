import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPrepareReleaseArgv,
  bumpSemver,
  parsePrepareReleaseArgs,
  resolveTargetVersion,
} from "./prepare-mcp-release-lib.ts";

test("bumpSemver increments patch releases", () => {
  assert.equal(bumpSemver("0.1.9", "patch"), "0.1.10");
});

test("parsePrepareReleaseArgs accepts explicit version mode", () => {
  assert.deepEqual(parsePrepareReleaseArgs(["--version", "0.1.10"]), {
    mode: "explicit",
    version: "0.1.10",
  });
});

test("parsePrepareReleaseArgs rejects missing explicit version", () => {
  assert.throws(() => parsePrepareReleaseArgs(["--version"]), /requires an exact x\.y\.z version/);
});

test("parsePrepareReleaseArgs rejects invalid release selector", () => {
  assert.throws(() => parsePrepareReleaseArgs(["banana"]), /Invalid release selector/);
});

test("resolveTargetVersion keeps explicit versions above the current one", () => {
  assert.equal(resolveTargetVersion("0.1.9", { mode: "explicit", version: "0.1.10" }), "0.1.10");
});

test("resolveTargetVersion rejects equal or lower explicit versions", () => {
  assert.throws(
    () => resolveTargetVersion("0.1.10", { mode: "explicit", version: "0.1.10" }),
    /must be greater than current version 0\.1\.10/
  );
  assert.throws(
    () => resolveTargetVersion("0.1.10", { mode: "explicit", version: "0.1.9" }),
    /must be greater than current version 0\.1\.10/
  );
});

test("buildPrepareReleaseArgv maps exact versions onto --version CLI form", () => {
  assert.deepEqual(buildPrepareReleaseArgv("0.1.10"), ["--version", "0.1.10"]);
});
