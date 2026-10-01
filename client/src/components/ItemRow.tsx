import { useEffect, useState } from "react";
import type { Item } from "../../../shared/types.ts";

interface Props {
  item: Item;
  onToggle(item: Item): void;
  onRemove(item: Item): void;
}

export function ItemRow({ item, onToggle, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);

  // Delete needs a second tap within 2.5s.
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 2500);
    return () => window.clearTimeout(t);
  }, [armed]);

  const cls = ["item", item.kind, item.done && "done", !item.sorted_by && "pending", open && "open"].filter(Boolean).join(" ");

  return (
    <article className={cls}>
      {item.kind === "todo" && (
        <button type="button" className="box" aria-label={item.done ? "mark not done" : "mark done"} onClick={() => onToggle(item)}>
          {item.done ? "✕" : ""}
        </button>
      )}
      {item.kind === "note" && <span className="tag">N</span>}

      <div className="body" onClick={item.kind === "note" ? () => setOpen((o) => !o) : undefined}>
        {item.title && <strong>{item.title}</strong>}
        <p>{item.text}</p>
      </div>

      <button
        type="button"
        className={armed ? "del arm" : "del"}
        aria-label="delete"
        onClick={() => (armed ? onRemove(item) : setArmed(true))}
      >
        {armed ? "SURE?" : "DEL"}
      </button>
    </article>
  );
}
