import { test } from "node:test";
import assert from "node:assert/strict";
import { keyboardInset } from "./keyboardInset.ts";

test("keyboard inset: what the keyboard covers, minus what Safari already scrolled into view", () => {
  assert.equal(keyboardInset(844, 844, 0), 0); // no keyboard
  assert.equal(keyboardInset(844, 508, 0), 336); // keyboard up, page not moved
  assert.equal(keyboardInset(844, 508, 336), 0); // Safari scrolled the view up by the keyboard height
  assert.equal(keyboardInset(844, 900, 0), 0); // never negative
});

test("frame cut: how far the page hangs below the visible screen edge", async () => {
  const { hiddenBelow } = await import("./keyboardInset.ts");
  assert.equal(hiddenBelow(844, 0, 844), 0); // all visible
  assert.equal(hiddenBelow(844, 0, 742), 102); // claude.ai app: frame runs 102px past the screen
  assert.equal(hiddenBelow(844, 0, 843), 0); // rounding noise
  assert.equal(hiddenBelow(844, 0, 0), 0); // nothing visible: no information
  assert.equal(hiddenBelow(844, 0, 100), 422); // capped at half the frame
});
