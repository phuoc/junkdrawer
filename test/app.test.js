import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../lib/db.js";
import { createApp } from "../server.js";
import { classifyByRules } from "../lib/classify.js";

test("rules: short lines are todos, long or idea-like text are notes", () => {
  assert.equal(classifyByRules("buy milk").kind, "todo");
  assert.equal(classifyByRules("buy milk").category, "shopping");
  assert.equal(classifyByRules("oat milk").category, "shopping");
  assert.equal(classifyByRules("call the dentist").kind, "todo");
  assert.equal(classifyByRules("idea: an app that sorts my thoughts").kind, "note");
  assert.equal(classifyByRules("line one\nline two").kind, "note");
  assert.equal(
    classifyByRules("I keep thinking we should move the standup to the afternoon because nobody is awake at nine").kind,
    "note"
  );
  assert.equal(classifyByRules("n: buy milk").kind, "note");
  assert.equal(classifyByRules("t: a very long thing that would normally be a note but the user insists it is a todo ok").kind, "todo");
});

async function start(passcode = "") {
  const db = openDb(":memory:");
  const calls = [];
  const classifier = {
    mode: "ai",
    classify: async (text, cats) => {
      calls.push({ text, cats });
      return { kind: "note", category: "ideas", title: null, sortedBy: "ai" };
    },
  };
  const server = createApp({ db, classifier, passcode }).listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = (method, path, body, cookie) =>
    fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
      body: body && JSON.stringify(body),
    });
  return { server, req, calls };
}

test("post, sort in background, toggle, delete", async (t) => {
  const { server, req, calls } = await start();
  t.after(() => server.close());

  let res = await req("POST", "/api/items", { id: "abcdefgh-1", text: "  t: wild idea  " });
  assert.equal(res.status, 201);
  const { item } = await res.json();
  assert.equal(item.text, "wild idea"); // prefix stripped
  assert.equal(item.sorted_by, null);

  // same id again is idempotent (offline retry)
  res = await req("POST", "/api/items", { id: "abcdefgh-1", text: "t: wild idea" });
  assert.equal((await res.json()).item.id, "abcdefgh-1");

  await new Promise((r) => setTimeout(r, 20));
  const { items } = await (await req("GET", "/api/items")).json();
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "todo"); // forced prefix wins over classifier
  assert.equal(items[0].category, "ideas");
  assert.equal(calls.length, 1);

  res = await req("PATCH", "/api/items/abcdefgh-1", { done: true });
  assert.equal((await res.json()).item.done, true);

  assert.equal((await req("POST", "/api/items", { text: "   " })).status, 400);
  assert.equal((await req("DELETE", "/api/items/abcdefgh-1")).status, 200);
  assert.equal((await req("DELETE", "/api/items/abcdefgh-1")).status, 404);
});

test("passcode gates the api", async (t) => {
  const { server, req } = await start("hunter2");
  t.after(() => server.close());

  assert.equal((await req("GET", "/api/items")).status, 401);
  assert.equal((await req("POST", "/api/login", { passcode: "nope" })).status, 401);
  const ok = await req("POST", "/api/login", { passcode: "hunter2" });
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get("set-cookie").split(";")[0];
  assert.equal((await req("GET", "/api/items", null, cookie)).status, 200);
});
