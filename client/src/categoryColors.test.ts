import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryColor, categoryStyle } from "./categoryColors.ts";

test("each requested category gets its colour, synonyms included", () => {
  const bg = (c: string) => categoryColor(c)?.bg;
  assert.equal(bg("health"), "#e5262a"); // red
  assert.equal(bg("Fitness"), "#e5262a");
  assert.equal(bg("shopping"), "#1f5fff"); // blue
  assert.equal(bg("groceries"), "#1f5fff");
  assert.equal(bg("travel"), "#7b2ff7"); // purple
  assert.equal(bg("home"), "#ff7a00"); // orange
  assert.equal(bg("work"), "#7a4a22"); // brown
  assert.equal(bg("ideas"), "#ffd400"); // yellow
  assert.equal(bg("errands"), "#14a44d"); // green
  assert.equal(bg("priorities"), "#14a44d");
  assert.equal(bg(" Priority "), "#14a44d");
});

test("light colours get black text; unlisted categories stay uncoloured", () => {
  assert.equal(categoryColor("ideas")?.fg, "#000000");
  assert.equal(categoryColor("home")?.fg, "#000000");
  assert.equal(categoryColor("work")?.fg, "#ffffff");
  assert.equal(categoryColor("people"), null);
  assert.equal(categoryColor("homework"), null); // whole-word match only
  assert.deepEqual(categoryStyle("misc"), {});
});
