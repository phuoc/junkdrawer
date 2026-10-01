import { useEffect, useState } from "react";
import type { Item } from "../../../shared/types.ts";
import { emojiFor } from "../../../shared/emoji.ts";

interface Props {
  item: Item;
  onToggle(item: Item): void;
  onRemove(item: Item): void;
  showEmoji: boolean;
}

export function ItemRow({ item, onToggle, onRemove, showEmoji }: Props) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);

  // Delete needs a second tap within 2.5s.
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 2500);
    return () => window.clearTimeout(t);
  }, [armed]);

  // older entries have no stored emoji; guess one from the text
  const emoji = showEmoji && item.sorted_by ? (item.emoji ?? emojiFor(item.text)) : null;
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

      {emoji && (
        <span className="emoji" aria-hidden="true">
          {emoji}
        </span>
      )}
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
