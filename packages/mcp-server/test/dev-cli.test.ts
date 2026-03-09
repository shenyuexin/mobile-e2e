import assert from "node:assert/strict";
import test from "node:test";
import { parseCliArgs } from "../src/dev-cli.ts";

test("parseCliArgs captures wait_for_ui flags", () => {
  const options = parseCliArgs([
    "--wait-for-ui",
    "--platform", "android",
    "--content-desc", "View products",
    "--wait-until", "unique",
    "--timeout-ms", "3000",
    "--interval-ms", "250",
    "--dry-run",
  ]);

  assert.equal(options.waitForUi, true);
  assert.equal(options.platform, "android");
  assert.equal(options.queryContentDesc, "View products");
  assert.equal(options.waitUntil, "unique");
  assert.equal(options.timeoutMs, 3000);
  assert.equal(options.intervalMs, 250);
  assert.equal(options.dryRun, true);
});

test("parseCliArgs captures scroll_and_resolve_ui_target flags", () => {
  const options = parseCliArgs([
    "--scroll-and-resolve-ui-target",
    "--platform", "android",
    "--resource-id", "view_products_button",
    "--max-swipes", "2",
    "--swipe-direction", "down",
    "--swipe-duration-ms", "400",
    "--dry-run",
  ]);

  assert.equal(options.scrollAndResolveUiTarget, true);
  assert.equal(options.queryResourceId, "view_products_button");
  assert.equal(options.maxSwipes, 2);
  assert.equal(options.swipeDirection, "down");
  assert.equal(options.swipeDurationMs, 400);
  assert.equal(options.dryRun, true);
});

test("parseCliArgs keeps text value for query_ui paths", () => {
  const options = parseCliArgs([
    "--query-ui",
    "--platform", "android",
    "--text", "Cart is empty",
  ]);

  assert.equal(options.queryUi, true);
  assert.equal(options.text, "Cart is empty");
});
