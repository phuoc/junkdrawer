import type { Item } from "../../../shared/types.ts";
import { matches, type Filter } from "../filters.ts";
import { ItemRow } from "./ItemRow.tsx";

const PENDING = "sorting…";

interface Props {
  items: Item[];
  filter: Filter;
  query: string;
  onToggle(item: Item): void;
  onRemove(item: Item): void;
}

export function Drawer({ items, filter, query, onToggle, onRemove }: Props) {
  const shown = items.filter((x) => matches(x, filter, query));

  if (!shown.length) {
    return (
      <p className="empty">
        {query ? "nothing matches." : filter === "done" ? "nothing done yet." : "the drawer is empty. throw something in."}
      </p>
    );
  }

  const groups = new Map<string, Item[]>();
  for (const x of shown) {
    const key = x.sorted_by ? x.category : PENDING;
    groups.set(key, [...(groups.get(key) ?? []), x]);
  }
  // inside a compartment: todos first, then notes, newest first
  for (const list of groups.values()) {
    list.sort((a, b) => Number(a.kind === "note") - Number(b.kind === "note") || b.created_at - a.created_at);
  }
  // pending first, then compartments with the most recent activity
  const newest = (list: Item[]) => Math.max(...list.map((x) => x.created_at));
  const keys = [...groups.keys()].sort((a, b) =>
    a === PENDING ? -1 : b === PENDING ? 1 : newest(groups.get(b)!) - newest(groups.get(a)!)
  );

  return (
    <div id="drawer">
      {keys.map((key) => {
        const list = groups.get(key)!;
        return (
          <section className="compartment" key={key}>
            <h2>
              <span>{key}</span>
              <small>{list.length}</small>
            </h2>
            {list.map((x) => (
              <ItemRow key={x.id} item={x} onToggle={onToggle} onRemove={onRemove} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
