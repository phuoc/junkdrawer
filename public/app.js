const $ = (s) => document.querySelector(s);
const text = $("#text");
const drawer = $("#drawer");
const statusEl = $("#status");
const OUTBOX = "jd-outbox";

let items = [];
let filter = "all";
let query = "";
let pollTimer = null;

// ---- storage helpers (never let storage errors break the app) ----
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

// ---- api ----
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  if (res.status === 401 && path !== "/api/login") { showLogin(); throw new Error("login"); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

// ---- focus: the input should always be ready ----
function focusInput() {
  if (!$("#login").hidden) return;
  if (document.activeElement === $("#find")) return;
  text.focus({ preventScroll: true });
}
window.addEventListener("focus", focusInput);
document.addEventListener("visibilitychange", () => { if (!document.hidden) { focusInput(); refresh(); } });

function autosize() {
  text.style.height = "auto";
  text.style.height = text.scrollHeight + "px";
}
text.addEventListener("input", autosize);

// Enter posts (also on the iPhone keyboard); Shift+Enter adds a line.
text.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    post();
  }
});
$("#add").addEventListener("submit", (e) => { e.preventDefault(); post(); });

function post() {
  const value = text.value.trim();
  if (!value) return;
  const entry = { id: uid(), text: value };
  text.value = "";
  autosize();
  // optimistic: show it right away, tagged as unsorted
  items.unshift({ ...entry, kind: "unsorted", category: "unsorted", done: false, created_at: Date.now(), _local: true });
  const outbox = store.get(OUTBOX, []);
  outbox.push(entry);
  store.set(OUTBOX, outbox);
  render();
  flush();
  focusInput();
}

let flushing = false;
async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    let outbox = store.get(OUTBOX, []);
    while (outbox.length) {
      const { item } = await api("POST", "/api/items", outbox[0]);
      const i = items.findIndex((x) => x.id === item.id);
      if (i >= 0) items[i] = item; else items.unshift(item);
      outbox = store.get(OUTBOX, []).filter((x) => x.id !== item.id);
      store.set(OUTBOX, outbox);
    }
    setStatus("");
    render();
    pollWhileSorting();
  } catch (e) {
    if (e.message !== "login") setStatus("offline — saved on this device, will send when back online");
  } finally {
    flushing = false;
  }
}
window.addEventListener("online", flush);

async function refresh() {
  try {
    const data = await api("GET", "/api/items");
    const pending = store.get(OUTBOX, []);
    const pendingItems = pending
      .filter((p) => !data.items.some((x) => x.id === p.id))
      .map((p) => ({ ...p, kind: "unsorted", category: "unsorted", done: false, created_at: Date.now(), _local: true }));
    items = [...pendingItems, ...data.items];
    if (data.sorter === "rules") setStatus("sorting by simple rules — add an ANTHROPIC_API_KEY on the server for AI sorting", true);
    render();
    if (pending.length) flush();
  } catch (e) {
    if (e.message !== "login") setStatus("offline");
  }
}

function pollWhileSorting(tries = 0) {
  clearTimeout(pollTimer);
  if (!items.some((x) => !x.sorted_by) || tries > 20) return;
  pollTimer = setTimeout(async () => { await refresh(); pollWhileSorting(tries + 1); }, 1500);
}
setInterval(() => { if (!document.hidden) refresh(); }, 30_000);

function setStatus(msg, soft) {
  statusEl.textContent = msg;
  statusEl.className = soft ? "soft" : "";
}

// ---- filters ----
document.querySelectorAll("#filters button").forEach((b) =>
  b.addEventListener("click", () => {
    filter = b.dataset.f;
    document.querySelectorAll("#filters button").forEach((x) => x.classList.toggle("on", x === b));
    render();
    focusInput();
  })
);
$("#find").addEventListener("input", (e) => { query = e.target.value.toLowerCase(); render(); });
$("#find").addEventListener("keydown", (e) => { if (e.key === "Escape") { e.target.value = ""; query = ""; render(); focusInput(); } });

// ---- rendering ----
function visible(x) {
  if (query && !`${x.text} ${x.title || ""} ${x.category}`.toLowerCase().includes(query)) return false;
  if (filter === "done") return x.done;
  if (x.done) return false;
  if (filter === "todo") return x.kind === "todo" || x.kind === "unsorted";
  if (filter === "note") return x.kind === "note" || x.kind === "unsorted";
  return true;
}

function render() {
  const shown = items.filter(visible);
  const groups = new Map();
  for (const x of shown) {
    const key = x.sorted_by ? x.category : "sorting…";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(x);
  }
  // pending first, then compartments with the most recent activity
  const keys = [...groups.keys()].sort((a, b) =>
    a === "sorting…" ? -1 : b === "sorting…" ? 1 : groups.get(b)[0].created_at - groups.get(a)[0].created_at
  );

  drawer.replaceChildren();
  if (!shown.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = query ? "nothing matches." : filter === "done" ? "nothing done yet." : "the drawer is empty. throw something in.";
    drawer.append(empty);
    return;
  }
  for (const key of keys) {
    const list = groups.get(key);
    // inside a compartment: todos first, then notes
    list.sort((a, b) => (a.kind === "note") - (b.kind === "note") || b.created_at - a.created_at);
    const section = document.createElement("section");
    section.className = "compartment";
    const h = document.createElement("h2");
    h.innerHTML = `<span></span><small>${list.length}</small>`;
    h.firstChild.textContent = key;
    section.append(h);
    for (const x of list) section.append(renderItem(x));
    drawer.append(section);
  }
}

function renderItem(x) {
  const row = document.createElement("article");
  row.className = `item ${x.kind}${x.done ? " done" : ""}${x.sorted_by ? "" : " pending"}`;

  if (x.kind === "todo") {
    const box = document.createElement("button");
    box.className = "box";
    box.setAttribute("aria-label", x.done ? "mark not done" : "mark done");
    box.textContent = x.done ? "✕" : "";
    box.addEventListener("click", () => toggle(x));
    row.append(box);
  } else if (x.kind === "note") {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = "N";
    row.append(tag);
  }

  const body = document.createElement("div");
  body.className = "body";
  if (x.title) {
    const t = document.createElement("strong");
    t.textContent = x.title;
    body.append(t);
  }
  const p = document.createElement("p");
  p.textContent = x.text;
  body.append(p);
  if (x.kind === "note") body.addEventListener("click", () => row.classList.toggle("open"));
  row.append(body);

  const del = document.createElement("button");
  del.className = "del";
  del.setAttribute("aria-label", "delete");
  del.textContent = "DEL";
  del.addEventListener("click", () => {
    if (!del.classList.contains("arm")) {
      del.classList.add("arm");
      del.textContent = "SURE?";
      setTimeout(() => { del.classList.remove("arm"); del.textContent = "DEL"; }, 2500);
      return;
    }
    remove(x);
  });
  row.append(del);
  return row;
}

async function toggle(x) {
  x.done = !x.done;
  render();
  try { await api("PATCH", `/api/items/${x.id}`, { done: x.done }); }
  catch { x.done = !x.done; render(); setStatus("couldn't save that — offline?"); }
  focusInput();
}

async function remove(x) {
  items = items.filter((y) => y !== x);
  store.set(OUTBOX, store.get(OUTBOX, []).filter((y) => y.id !== x.id));
  render();
  if (x._local) return;
  try { await api("DELETE", `/api/items/${x.id}`); }
  catch { setStatus("couldn't delete — offline?"); refresh(); }
  focusInput();
}

// ---- login ----
function showLogin() {
  $("#login").hidden = false;
  $("#add").hidden = true;
  $("#filters").hidden = true;
  drawer.hidden = true;
  $("#pass").focus();
}
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("POST", "/api/login", { passcode: $("#pass").value });
    $("#login").hidden = true;
    $("#add").hidden = false;
    $("#filters").hidden = false;
    drawer.hidden = false;
    setStatus("");
    focusInput();
    refresh();
  } catch {
    $("#pass").value = "";
    setStatus("wrong passcode");
  }
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

autosize();
focusInput();
refresh();
