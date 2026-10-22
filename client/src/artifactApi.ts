// Backend for the claude.ai preview build (`vite build --mode artifact`).
// There is no server there: each person's entries are documents in their own
// private part of the page's store, and Claude sorts them through the page,
// on the viewer's own Claude account. Same shape as the HTTP api in api.ts.
import type { Item, ItemsResponse, Sorting } from "../../shared/types.ts";
import { classifyByRules, cleanSorting, forcedKind, SORTING_INSTRUCTIONS, sortingRequest } from "../../shared/sorting.ts";

/** Thrown when the page can't reach the viewer's store (signed out, not allowed). */
export class StoreUnavailable extends Error {}

// Minimal shapes of the claude.ai page capabilities this file uses.
interface DocSnap {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
interface DocRef {
  get(): Promise<DocSnap>;
  set(data: Record<string, unknown>): Promise<void>;
  update(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
interface Collection {
  doc(id: string): DocRef;
  get(): Promise<{ docs: DocSnap[] }>;
}
interface SampleFn {
  json<T>(input: string, options?: { modelTier?: "quick" | "default" | "complex" }): Promise<T>;
}
interface ClaudeGlobal {
  use(name: string): Promise<unknown>;
}

interface Env {
  items: Collection;
  sample: SampleFn | null;
}

let envPromise: Promise<Env | null> | null = null;
function env(): Promise<Env | null> {
  envPromise ??= (async () => {
    const claude = (window as unknown as { claude?: ClaudeGlobal }).claude;
    if (!claude?.use) return null;
    const [db, user, sample] = (await Promise.all([claude.use("db"), claude.use("user"), claude.use("sample")])) as [
      { collection(path: string): Collection } | null,
      { id(): Promise<string | null> } | null,
      SampleFn | null,
    ];
    const uid = await user?.id();
    if (!db || !uid) return null;
    // data/users/<id> is this viewer's own collection: nobody else can read it.
    return { items: db.collection(`data/users/${uid}`), sample };
  })();
  return envPromise;
}

async function store() {
  const e = await env();
  if (!e) throw new StoreUnavailable("store unavailable");
  return e;
}

// Claude sorting turns off for the rest of the visit once the viewer declines
// it or it isn't available on their account; everything then sorts by rules.
let claudeOff = false;
const OFF_CODES = new Set(["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"]);

const toItem = (d: DocSnap): Item => {
  const x = d.data() as Partial<Item>;
  return {
    id: d.id,
    text: String(x.text ?? ""),
    kind: x.kind ?? "unsorted",
    category: x.category ?? "unsorted",
    title: x.title ?? null,
    emoji: x.emoji ?? null,
    done: !!x.done,
    sorted_by: x.sorted_by ?? null,
    created_at: Number(x.created_at ?? 0),
    updated_at: Number(x.updated_at ?? 0),
  };
};

async function listItems(e: Env): Promise<Item[]> {
  const snap = await e.items.get();
  return snap.docs.filter((d) => d.exists).map(toItem).sort((a, b) => b.created_at - a.created_at);
}

// One sort attempt per entry per page load, so a failure never loops.
const attempted = new Set<string>();

async function sortItem(e: Env, item: Item, forced: "todo" | "note" | undefined) {
  if (attempted.has(item.id)) return;
  attempted.add(item.id);
  let result: Sorting = classifyByRules(item.text);
  let sortedBy: "ai" | "rules" = "rules";
  if (e.sample && !claudeOff) {
    try {
      const categories = [...new Set((await listItems(e)).filter((x) => x.sorted_by).map((x) => x.category))];
      const reply = await e.sample.json<Partial<Sorting>>(
        `${SORTING_INSTRUCTIONS}\n\nReply with only a JSON object: {"kind": "todo" | "note", "category": string, "title": string | null, "emoji": string}.\n\n${sortingRequest(item.text, categories)}`,
        { modelTier: "quick" }
      );
      result = cleanSorting(reply, item.text);
      sortedBy = "ai";
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (OFF_CODES.has(code)) claudeOff = true;
      console.warn("[sort] using rules:", code || err);
    }
  }
  if (forced) result.kind = forced;
  try {
    await e.items.doc(item.id).update({ ...result, sorted_by: sortedBy, updated_at: Date.now() });
  } catch {
    /* deleted meanwhile */
  }
}

export const artifactApi = {
  async list(): Promise<ItemsResponse> {
    const e = await store();
    const items = await listItems(e);
    // Finish anything left unsorted, e.g. the page was closed mid-sort.
    for (const x of items) if (!x.sorted_by) void sortItem(e, x, undefined);
    return { items, sorter: e.sample && !claudeOff ? "ai" : "rules" };
  },

  async add(entry: { id: string; text: string }): Promise<{ item: Item }> {
    const e = await store();
    const ref = e.items.doc(entry.id);
    const existing = await ref.get();
    if (existing.exists) return { item: toItem(existing) }; // offline retries reuse the id
    const forced = forcedKind(entry.text);
    const text = (forced && forced.rest.trim() ? forced.rest : entry.text).trim().slice(0, 5000);
    const now = Date.now();
    const item: Item = {
      id: entry.id,
      text,
      kind: "unsorted",
      category: "unsorted",
      title: null,
      emoji: null,
      done: false,
      sorted_by: null,
      created_at: now,
      updated_at: now,
    };
    const { id: _id, ...body } = item;
    await ref.set(body);
    void sortItem(e, item, forced?.kind);
    return { item };
  },

  async setDone(id: string, done: boolean): Promise<{ item: Item }> {
    const e = await store();
    const ref = e.items.doc(id);
    await ref.update({ done, updated_at: Date.now() });
    return { item: toItem(await ref.get()) };
  },

  async remove(id: string): Promise<{ ok: true }> {
    const e = await store();
    await e.items.doc(id).delete();
    return { ok: true };
  },

  // claude.ai handles sign-in; there's no passcode.
  async login(): Promise<{ ok: true }> {
    return { ok: true };
  },
};
