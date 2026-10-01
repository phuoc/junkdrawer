import type { Ref } from "react";

export type Filter = "all" | "todo" | "note" | "done";

const FILTERS: [Filter, string][] = [
  ["all", "ALL"],
  ["todo", "TODO"],
  ["note", "NOTES"],
  ["done", "DONE"],
];

interface Props {
  filter: Filter;
  onFilter(f: Filter): void;
  query: string;
  onQuery(q: string): void;
  onClearQuery(): void;
  findRef: Ref<HTMLInputElement>;
}

export function Filters({ filter, onFilter, query, onQuery, onClearQuery, findRef }: Props) {
  return (
    <nav id="filters">
      {FILTERS.map(([f, label]) => (
        <button key={f} type="button" className={f === filter ? "on" : undefined} onClick={() => onFilter(f)}>
          {label}
        </button>
      ))}
      <input
        id="find"
        ref={findRef}
        type="search"
        placeholder="find"
        enterKeyHint="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onClearQuery()}
      />
    </nav>
  );
}
