import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { openDb } from "./db.ts";
import { createApp } from "./app.ts";
import type { Classifier } from "./classify.ts";
import { createCountdownResolver, nextF1Race } from "./countdown.ts";
import { countdownFromText, countdownLabel, countdownTarget, isCountdown, parseDate, timeLeft } from "../shared/countdown.ts";

const NOW = new Date(2026, 10, 1, 12, 0); // 1 Nov 2026, local time

test("spots countdown entries", () => {
  for (const t of ["f1 race countdown", "Worlds final COUNT DOWN", "count-down to xmas", "countdown foko bday 30. july"]) assert.ok(isCountdown(t), t);
  for (const t of ["count the downloads", "buy milk", "countdowns are fun"]) assert.ok(!isCountdown(t), t);
});

test("reads dates in common forms; without a year, the next one coming", () => {
  const d = (t: string) => parseDate(t, NOW)?.date ?? null;
  assert.equal(d("countdown foko bday 30. july"), "2027-07-30"); // July has passed this year
  assert.equal(d("30 july 2026"), "2026-07-30");
  assert.equal(d("party on 24th of december"), "2026-12-24");
  assert.equal(d("december 24th"), "2026-12-24");
  assert.equal(d("dec 24"), "2026-12-24");
  assert.equal(d("6.12"), "2026-12-06");
  assert.equal(d("30/07/2027"), "2027-07-30");
  assert.equal(d("2027-01-15"), "2027-01-15");
  assert.equal(d("31 feb"), null);
  assert.equal(d("worlds final countdown"), null);
  assert.equal(d("meet at 18.30"), null); // a time, not a date
  assert.deepEqual(
    [parseDate("concert 12 dec at 20:00", NOW)?.time, parseDate("dinner 3 nov 7pm", NOW)?.time],
    ["20:00", "19:00"]
  );
});

test("labels drop the countdown words and the date", () => {
  assert.equal(countdownLabel("f1 race countdown"), "f1 race");
  assert.equal(countdownLabel("countdown to the worlds final"), "worlds final");
  const p = parseDate("countdown foko bday 30. july", NOW)!;
  assert.equal(countdownLabel("countdown foko bday 30. july", p.matched), "foko bday");
});

test("birthdays without a year roll over; timers count down in local time", () => {
  const cd = countdownFromText("countdown foko bday 30. july", NOW);
  assert.equal(cd.status, "found");
  assert.equal(cd.yearly, true);
  assert.equal(cd.source, "your entry");
  // on the day it reads "today"; the day after, it has moved to next year
  const onTheDay = new Date(2027, 6, 30, 15, 0);
  assert.equal(timeLeft(countdownTarget(cd, onTheDay)!, onTheDay, true).state, "today");
  const after = new Date(2027, 6, 31, 9, 0);
  assert.equal(countdownTarget(cd, after)!.getFullYear(), 2028);

  const left = timeLeft(new Date(2026, 10, 3, 14, 30, 15), NOW, false);
  assert.deepEqual(left, { state: "future", days: 2, hours: 2, minutes: 30, seconds: 15 });
  assert.equal(countdownFromText("concert countdown 12 dec 2026", NOW).yearly, false);
});

// Recorded shapes of the jolpica-f1 schedule.
const races = (list: object[]) => new Response(JSON.stringify({ MRData: { RaceTable: { Races: list } } }));

test("F1: the next race from the schedule, or next season's first after the finale", async () => {
  const urls: string[] = [];
  const next = await nextF1Race(NOW, async (url) => {
    urls.push(url);
    return races([{ raceName: "Las Vegas Grand Prix", date: "2026-11-21", time: "04:00:00Z", url: "https://en.wikipedia.org/wiki/2026_Las_Vegas_Grand_Prix" }]);
  });
  assert.equal(next?.label, "Las Vegas Grand Prix");
  assert.equal(next?.at, Date.parse("2026-11-21T04:00:00Z"));
  assert.equal(urls.length, 1);

  const offSeason = await nextF1Race(new Date("2026-12-20T00:00:00Z"), async (url) =>
    url.includes("current/next")
      ? races([])
      : races([
          { raceName: "Australian Grand Prix", date: "2027-03-14", time: "05:00:00Z" },
          { raceName: "Chinese Grand Prix", date: "2027-03-21", time: "07:00:00Z" },
        ])
  );
  assert.equal(offSeason?.label, "Australian Grand Prix");

  assert.equal(await nextF1Race(NOW, async () => new Response("nope", { status: 503 })), null);
});

test("resolver: entry date first, then F1, then the web lookup, else not found", async () => {
  const lookups: string[] = [];
  const resolve = createCountdownResolver({
    fetchFn: async () => races([{ raceName: "Las Vegas Grand Prix", date: "2026-11-21", time: "04:00:00Z" }]),
    lookup: async (_text, label) => {
      lookups.push(label);
      return label === "worlds final" ? { label: "LoL Worlds 2026 Final", at: null, date: "2026-11-08", time: null, source: "web search", url: "https://lolesports.com" } : null;
    },
  });
  const bday = await resolve("countdown foko bday 30. july", NOW);
  assert.equal(bday.date, "2027-07-30");
  const f1 = await resolve("f1 race countdown", NOW);
  assert.equal(f1.label, "Las Vegas Grand Prix");
  assert.equal(f1.status, "found");
  const worlds = await resolve("worlds final countdown", NOW);
  assert.deepEqual([worlds.label, worlds.date, worlds.source], ["LoL Worlds 2026 Final", "2026-11-08", "web search"]);
  const unknown = await resolve("countdown to the thing", NOW);
  assert.equal(unknown.status, "not-found");
  assert.deepEqual(lookups, ["worlds final", "thing"]); // the date and the F1 schedule never needed the web
});

test("API: a countdown entry shows a card at once, fills in its date, and takes a date from the user", async (t) => {
  const db = openDb(":memory:");
  const classifier: Classifier = {
    mode: "ai",
    classify: async () => ({ kind: "todo", category: "sports", title: null, emoji: "🏆", sortedBy: "ai" }),
  };
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const countdowns = async (text: string, now: Date) => {
    await gate; // hold the lookup so the "looking" state is observable
    return { ...countdownFromText(text, now), status: "found" as const, label: "LoL Worlds 2026 Final", date: "2026-11-08", source: "web search" };
  };
  const server = createApp({ db, classifier, countdowns, passcode: "" }).listen(0);
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, body?: unknown) =>
    (await fetch(base + path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })).json() as Promise<any>;

  const { item } = await call("POST", "/api/items", { id: "count-1234", text: "worlds final countdown" });
  assert.deepEqual([item.countdown.status, item.countdown.label], ["looking", "worlds final"]);
  release();
  await new Promise((r) => setTimeout(r, 30));
  const [stored] = (await call("GET", "/api/items")).items;
  assert.deepEqual([stored.countdown.status, stored.countdown.date, stored.kind], ["found", "2026-11-08", "note"]);

  const { item: changed } = await call("PATCH", "/api/items/count-1234", { countdownDate: "2026-11-09" });
  assert.deepEqual([changed.countdown.date, changed.countdown.source], ["2026-11-09", "you"]);
  const bad = await fetch(base + "/api/items/count-1234", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ countdownDate: "soon" }) });
  assert.equal(bad.status, 400);

  // an entry with its own date needs no lookup; a plain entry gets no countdown
  const { item: bday } = await call("POST", "/api/items", { id: "count-5678", text: "countdown foko bday 30. july" });
  assert.equal(bday.countdown.status, "found");
  const { item: milk } = await call("POST", "/api/items", { id: "milk-12345", text: "buy milk" });
  assert.equal(milk.countdown, null);
});

test("without Claude, countdowns are filed under events", async () => {
  const { classifyByRules } = await import("../shared/sorting.ts");
  assert.deepEqual(
    ["f1 race countdown", "worlds final countdown"].map((t) => classifyByRules(t).category),
    ["events", "events"]
  );
});
