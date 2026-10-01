import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Item, Sorting } from "../shared/types.ts";

type Row = Omit<Item, "done"> & { done: number };

export type Db = ReturnType<typeof openDb>;

export function openDb(file: string) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS items (
      id         TEXT PRIMARY KEY,
      text       TEXT NOT NULL,
      kind       TEXT NOT NULL DEFAULT 'unsorted',  -- todo | note | unsorted
      category   TEXT NOT NULL DEFAULT 'unsorted',
      title      TEXT,                              -- short label for long notes
      done       INTEGER NOT NULL DEFAULT 0,
      sorted_by  TEXT,                              -- ai | rules | null while pending
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS items_created ON items(created_at DESC);
  `);

  const q = {
    insert: db.prepare(`INSERT INTO items (id, text, created_at, updated_at) VALUES (?, ?, ?, ?)`),
    get: db.prepare(`SELECT * FROM items WHERE id = ?`),
    all: db.prepare(`SELECT * FROM items ORDER BY created_at DESC`),
    categories: db.prepare(
      `SELECT category, COUNT(*) AS n FROM items
       WHERE category != 'unsorted' GROUP BY category ORDER BY n DESC LIMIT 40`
    ),
    sort: db.prepare(
      `UPDATE items SET kind = ?, category = ?, title = ?, sorted_by = ?, updated_at = ?
       WHERE id = ?`
    ),
    done: db.prepare(`UPDATE items SET done = ?, updated_at = ? WHERE id = ?`),
    del: db.prepare(`DELETE FROM items WHERE id = ?`),
  };

  const toItem = (r: unknown): Item | undefined => {
    if (!r) return undefined;
    const row = r as Row;
    return { ...row, done: !!row.done };
  };
  const get = (id: string) => toItem(q.get.get(id));

  return {
    add(text: string, id: string = randomUUID()): Item {
      const existing = get(id);
      if (existing) return existing; // idempotent: offline retries reuse the id
      const now = Date.now();
      q.insert.run(id, text, now, now);
      return get(id)!;
    },
    get,
    list: () => q.all.all().map((r) => toItem(r)!),
    categories: () => q.categories.all().map((r) => (r as { category: string }).category),
    setSort(id: string, { kind, category, title }: Sorting, sortedBy: "ai" | "rules") {
      q.sort.run(kind, category, title ?? null, sortedBy, Date.now(), id);
      return get(id);
    },
    setDone(id: string, done: boolean) {
      q.done.run(done ? 1 : 0, Date.now(), id);
      return get(id);
    },
    remove: (id: string) => Number(q.del.run(id).changes) > 0,
    close: () => db.close(),
  };
}
