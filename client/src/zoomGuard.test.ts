import { test } from "node:test";
import assert from "node:assert/strict";
import { zoomOutFactor } from "./zoomGuard.ts";

test("zoom-out factor: 1 at normal zoom, bigger when Safari's Page Zoom is reduced", () => {
  assert.equal(zoomOutFactor(390, 390, 844, true), 1); // iPhone at 100%
  assert.equal(zoomOutFactor(459, 390, 844, true).toFixed(2), "1.18"); // Page Zoom 85%
  assert.equal(zoomOutFactor(780, 390, 844, true), 2); // 50%
  assert.equal(zoomOutFactor(844, 390, 844, false), 1); // landscape at 100%: not "zoomed out"
  assert.equal(zoomOutFactor(320, 390, 844, true), 1); // narrower frame never shrinks fields
  assert.equal(zoomOutFactor(5000, 390, 844, true), 4); // capped
});
