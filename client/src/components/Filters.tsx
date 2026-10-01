import type { Ref } from "react";
import type { Filter } from "../filters.ts";
import type { Layout } from "../App.tsx";

export type { Filter };

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
  /** Only passed on desktop, where the board is available. */
  layout?: Layout;
  onLayout(l: Layout): void;
  showEmoji: boolean;
  onShowEmoji(on: boolean): void;
}

export function Filters({ filter, onFilter, query, onQuery, onClearQuery, findRef, layout, onLayout, showEmoji, onShowEmoji }: Props) {
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
      <button
        type="button"
        className={`emoji-toggle${showEmoji ? " on" : ""}`}
        aria-pressed={showEmoji}
        title={showEmoji ? "hide emojis" : "show emojis"}
        onClick={() => onShowEmoji(!showEmoji)}
      >
        EMOJI {showEmoji ? "ON" : "OFF"}
      </button>
      {layout && (
        <button type="button" className="layout-toggle" onClick={() => onLayout(layout === "board" ? "list" : "board")}>
          {layout === "board" ? "LIST" : "BOARD"}
        </button>
      )}
    </nav>
  );
}
