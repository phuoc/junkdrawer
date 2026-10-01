export type Kind = "todo" | "note" | "unsorted";

export interface Item {
  id: string;
  text: string;
  kind: Kind;
  category: string;
  /** Short label for long notes. */
  title: string | null;
  done: boolean;
  /** Who sorted it; null while sorting is pending. */
  sorted_by: "ai" | "rules" | null;
  created_at: number;
  updated_at: number;
}

export interface Sorting {
  kind: "todo" | "note";
  category: string;
  title: string | null;
}

export type Sorter = "ai" | "rules";

export interface ItemsResponse {
  items: Item[];
  sorter: Sorter;
}
