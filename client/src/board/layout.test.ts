import { test } from "node:test";
import assert from "node:assert/strict";
import type { Item } from "../../../shared/types.ts";
import { computeLayout, hubKey, relatedLinks } from "./layout.ts";

let t = 1000;
const item = (text: string, category: string, extra: Partial<Item> = {}): Item => ({
  id: `id-${t}`,
  text,
  kind: "todo",
  category,
  title: null,
  done: false,
  sorted_by: "ai",
  created_at: t++,
  updated_at: t,
  ...extra,
});

test("one hub per category; items hang off their hub, pending ones off the centre", () => {
  const items = [item("milk", "shopping"), item("eggs", "shopping"), item("dentist", "health"), item("new", "unsorted", { sorted_by: null })];
  const { hubs, cards } = computeLayout(items, {});
  assert.deepEqual(hubs.map((h) => h.category), ["shopping", "health"]);
  assert.deepEqual(cards.map((c) => c.hub), [hubKey("shopping"), hubKey("shopping"), hubKey("health"), "root"]);
});

test("layout is stable: same input same positions, and new items don't move old ones", () => {
  const items = [item("milk", "shopping"), item("dentist", "health")];
  const a = computeLayout(items, {});
  assert.deepEqual(computeLayout(items, {}), a);
  const b = computeLayout([...items, item("standup notes", "work"), item("eggs", "shopping")], {});
  assert.deepEqual(b.hubs.slice(0, 2), a.hubs);
  assert.deepEqual(b.cards.slice(0, 2), a.cards);
});

test("dragging a hub carries its cards; dragging a card moves only that card", () => {
  const items = [item("milk", "shopping"), item("eggs", "shopping")];
  const base = computeLayout(items, {});
  const movedHub = computeLayout(items, { [hubKey("shopping")]: { x: 50, y: -20 } });
  for (const [i, c] of movedHub.cards.entries()) {
    assert.equal(Math.round(c.x - base.cards[i].x), 50);
    assert.equal(Math.round(c.y - base.cards[i].y), -20);
  }
  const movedCard = computeLayout(items, { [items[0].id]: { x: 10, y: 10 } });
  assert.equal(movedCard.cards[0].x, base.cards[0].x + 10);
  assert.equal(movedCard.cards[1].x, base.cards[1].x);
});

test("related links join different compartments on a shared meaningful word", () => {
  const items = [
    item("birthday gift for mom", "shopping"),
    item("call mom about sunday", "people"),
    item("call the dentist", "health"), // shares only the verb "call": no link
    item("mom's recipe book", "shopping"), // same compartment as the gift: no link to it
  ];
  const links = relatedLinks(items);
  assert.deepEqual(
    links.map((l) => [l.a, l.b, l.word]),
    [
      [items[0].id, items[1].id, "mom"],
      [items[1].id, items[3].id, "mom"],
    ]
  );
});
