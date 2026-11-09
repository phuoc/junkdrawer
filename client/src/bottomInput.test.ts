import { test } from "node:test";
import assert from "node:assert/strict";
import { keyboardInset } from "./keyboardInset.ts";

test("keyboard inset: what the keyboard covers, minus what Safari already scrolled into view", () => {
  assert.equal(keyboardInset(844, 844, 0), 0); // no keyboard
  assert.equal(keyboardInset(844, 508, 0), 336); // keyboard up, page not moved
  assert.equal(keyboardInset(844, 508, 336), 0); // Safari scrolled the view up by the keyboard height
  assert.equal(keyboardInset(844, 900, 0), 0); // never negative
});
