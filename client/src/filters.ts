import type { Item } from "../../shared/types.ts";

export type Filter = "all" | "todo" | "note" | "done";

/** Whether an item matches the current filter tab and search text. */
export function matches(x: Item, filter: Filter, query: string) {
  if (query && !`${x.text} ${x.title ?? ""} ${x.category}`.toLowerCase().includes(query.toLowerCase())) return false;
  if (filter === "done") return x.done;
  if (x.done) return false;
  if (filter === "todo") return x.kind === "todo" || x.kind === "unsorted";
  if (filter === "note") return x.kind === "note" || x.kind === "unsorted";
  return true;
}
