import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Item } from "../../../shared/types.ts";
import { matches, type Filter } from "../filters.ts";
import { readStored, useStoredState, writeStored } from "../storage.ts";
import { ItemRow } from "../components/ItemRow.tsx";
import { categoryStyle } from "../categoryColors.ts";
import { bounds, computeLayout, relatedLinks, type Layout, type Offsets, type Point } from "./layout.ts";

type LinkMode = "all" | "hubs" | "off";
interface View extends Point {
  k: number; // zoom
}

const OFFSETS = "jd-board-offsets";
const VIEW = "jd-board-view";
const clampK = (k: number) => Math.min(2, Math.max(0.15, k));

/** Zoom and pan so the whole map fits in the space the capture panel and toolbar leave free. */
function fitView(layout: Layout, el: HTMLElement): View {
  const { width: W, height: H } = el.getBoundingClientRect();
  const panel = document.querySelector(".panel")?.getBoundingClientRect();
  const tools = document.querySelector(".board-tools")?.getBoundingClientRect();
  const bottom = tools ? H - tools.top + 12 : 80;
  // Beside the panel on a wide screen; below it on a phone, where it spans the top.
  const below = !!panel && panel.width > W / 2;
  const left = panel && !below ? panel.right + 24 : 12;
  const top = panel && below ? panel.bottom + 12 : 24;
  const area = { x: left, y: top, w: Math.max(120, W - left - 12), h: Math.max(120, H - top - bottom) };
  const b = bounds(layout);
  const k = clampK(Math.min(area.w / (b.maxX - b.minX), area.h / (b.maxY - b.minY), 1.1));
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return { k, x: area.x + area.w / 2 - W / 2 - cx * k, y: area.y + area.h / 2 - H / 2 - cy * k };
}

interface Drag {
  kind: "node" | "pan";
  key: string;
  sx: number;
  sy: number;
  origin: Point;
  moved: boolean;
}

/** Two fingers on the board: zoom around their midpoint and pan with it. */
interface Pinch {
  dist: number;
  mid: Point;
  view: View;
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

interface Props {
  items: Item[];
  filter: Filter;
  query: string;
  onToggle(item: Item): void;
  onRemove(item: Item): void;
  /** Called after any pointer interaction so the capture box can take focus back. */
  onInteract(): void;
  showEmoji: boolean;
}

export function Board({ items, filter, query, onToggle, onRemove, onInteract, showEmoji }: Props) {
  // Offsets and view change on every pointer move, so they live in plain state
  // and are saved when a gesture ends.
  const [offsets, setOffsets] = useState<Offsets>(() => readStored(OFFSETS, {}));
  const [view, setView] = useState<View | null>(() => readStored<View | null>(VIEW, null));
  const [linkMode, setLinkMode] = useStoredState<LinkMode>("jd-board-links", "all");
  const [dragging, setDragging] = useState<string | null>(null);
  const [armTidy, setArmTidy] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<Pinch | null>(null);
  const suppressClick = useRef(false);
  const latest = useRef({ offsets, view });
  latest.current = { offsets, view };

  const layout = useMemo(() => computeLayout(items, offsets), [items, offsets]);

  const fit = () => {
    if (!boardRef.current) return;
    const next = fitView(layout, boardRef.current);
    setView(next);
    writeStored(VIEW, next);
  };
  // First visit on this device: frame the whole map once the items arrive.
  const fitted = useRef(view !== null);
  useEffect(() => {
    if (fitted.current || !items.length) return;
    fitted.current = true;
    fit();
  });
  const v = view ?? { x: 0, y: 0, k: 0.8 };
  const related = useMemo(
    () => (linkMode === "all" ? relatedLinks(items.filter((x) => !x.done || filter === "done")) : []),
    [items, linkMode, filter]
  );

  // Done items stay off the board unless you're looking at DONE; everything
  // else that doesn't match the filter/search just fades, so the map keeps its shape.
  const hidden = (x: Item) => x.done && filter !== "done";
  const cards = layout.cards.filter((c) => !hidden(c.item));
  const cardAt = new Map(cards.map((c) => [c.item.id, c]));
  const liveHubs = layout.hubs
    .map((h) => ({ ...h, cards: cards.filter((c) => c.hub === h.key) }))
    .filter((h) => h.cards.length);

  // --- gestures ---
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const p = pinch.current;
      const el = boardRef.current;
      if (p && el && pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()];
        const rect = el.getBoundingClientRect();
        const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        const k = clampK(p.view.k * (distance(a, b) / p.dist));
        // keep the world point that was under the fingers' midpoint under it
        const wx = (p.mid.x - center.x - p.view.x) / p.view.k;
        const wy = (p.mid.y - center.y - p.view.y) / p.view.k;
        const m = midpoint(a, b);
        setView({ k, x: m.x - center.x - wx * k, y: m.y - center.y - wy * k });
        return;
      }
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      if (d.kind === "pan") {
        setView((v) => ({ k: v?.k ?? 0.8, x: d.origin.x + dx, y: d.origin.y + dy }));
      } else {
        const k = latest.current.view?.k ?? 0.8;
        setDragging(d.key);
        setOffsets((o) => ({ ...o, [d.key]: { x: d.origin.x + dx / k, y: d.origin.y + dy / k } }));
      }
    };
    const up = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      if (pinch.current) {
        if (pointers.current.size < 2) {
          pinch.current = null;
          suppressClick.current = true;
          writeStored(VIEW, latest.current.view);
          if (!pointers.current.size) onInteract();
        }
        return;
      }
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      setDragging(null);
      if (d.moved) {
        suppressClick.current = true; // the click that ends a drag isn't a tap
        writeStored(OFFSETS, latest.current.offsets);
        writeStored(VIEW, latest.current.view);
      }
      onInteract();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [onInteract]);

  // Wheel pans; pinch (or ctrl+wheel) zooms around the cursor.
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    let saveTimer: number | undefined;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((cur) => {
        const v = cur ?? { x: 0, y: 0, k: 0.8 };
        if (!e.ctrlKey) return { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY };
        const rect = el.getBoundingClientRect();
        const cx = e.clientX - rect.left - rect.width / 2;
        const cy = e.clientY - rect.top - rect.height / 2;
        const k = clampK(v.k * Math.exp(-e.deltaY * 0.01));
        return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
      });
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => writeStored(VIEW, latest.current.view), 300);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  // Runs before any card or hub sees the press, so a second finger turns
  // whatever the first one started into a pinch.
  const trackPointer = (e: ReactPointerEvent) => {
    // A click always follows its own press, so a leftover "ignore the next
    // click" from a touch drag or pinch (which end without a click) is stale.
    suppressClick.current = false;
    if (e.pointerType === "mouse") return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = drag.current;
      if (d?.moved) {
        // put back whatever the first finger had started moving
        if (d.kind === "node") setOffsets((o) => ({ ...o, [d.key]: d.origin }));
        else setView((cur) => ({ k: cur?.k ?? 0.8, x: d.origin.x, y: d.origin.y }));
      }
      drag.current = null;
      setDragging(null);
      pinch.current = { dist: Math.max(1, distance(a, b)), mid: midpoint(a, b), view: latest.current.view ?? { x: 0, y: 0, k: 0.8 } };
    }
  };

  const startNode = (key: string) => (e: ReactPointerEvent) => {
    if (pointers.current.size > 1) return;
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    e.stopPropagation();
    drag.current = { kind: "node", key, sx: e.clientX, sy: e.clientY, origin: offsets[key] ?? { x: 0, y: 0 }, moved: false };
  };
  const startPan = (e: ReactPointerEvent) => {
    if (pointers.current.size > 1) return;
    if (e.button !== 0) return;
    drag.current = { kind: "pan", key: "", sx: e.clientX, sy: e.clientY, origin: { x: v.x, y: v.y }, moved: false };
  };

  const zoomBy = (f: number) =>
    setView((cur) => {
      const v = cur ?? { x: 0, y: 0, k: 0.8 };
      const k = clampK(v.k * f);
      const next = { k, x: (v.x * k) / v.k, y: (v.y * k) / v.k };
      writeStored(VIEW, next);
      return next;
    });

  const tidy = () => {
    if (!armTidy) {
      setArmTidy(true);
      window.setTimeout(() => setArmTidy(false), 2500);
      return;
    }
    setArmTidy(false);
    setOffsets({});
    writeStored(OFFSETS, {});
  };

  const at = (p: Point, tilt = 0) => ({ transform: `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(${tilt}deg)` });

  return (
    <div
      className="board"
      ref={boardRef}
      onPointerDownCapture={trackPointer}
      onPointerDown={startPan}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          e.stopPropagation();
          e.preventDefault();
        }
      }}
    >
      <div className="world" style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.k})` }}>
        {linkMode !== "off" && (
          <svg className="links" width="1" height="1" aria-hidden="true">
            {liveHubs.map((h) => (
              <line
                key={h.key}
                className={`trunk${h.cards.some((c) => matches(c.item, filter, query)) ? "" : " dim"}`}
                style={categoryStyle(h.category)}
                x1={0}
                y1={0}
                x2={h.x}
                y2={h.y}
              />
            ))}
            {cards.map((c) => {
              const from = c.hub === "root" ? { x: 0, y: 0 } : layout.hubs.find((h) => h.key === c.hub)!;
              const dim = !matches(c.item, filter, query);
              return (
                <line
                  key={c.item.id}
                  className={`branch${c.hub === "root" ? " pending" : ""}${dim ? " dim" : ""}`}
                  style={c.item.sorted_by ? categoryStyle(c.item.category) : undefined}
                  x1={from.x}
                  y1={from.y}
                  x2={c.x}
                  y2={c.y}
                />
              );
            })}
            {related.map((l) => {
              const a = cardAt.get(l.a);
              const b = cardAt.get(l.b);
              if (!a || !b) return null;
              return (
                <g
                  key={`${l.a}-${l.b}`}
                  className={`related${matches(a.item, filter, query) && matches(b.item, filter, query) ? "" : " dim"}`}
                >
                  <path d={`M${a.x},${a.y} Q${(a.x + b.x) / 2},${(a.y + b.y) / 2 - 60} ${b.x},${b.y}`} />
                  <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 34}>
                    {l.word}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        <div className="node root" style={at({ x: 0, y: 0 })}>
          JUNK
          <br />
          DRAWER
        </div>

        {liveHubs.map((h) => (
          <div
            key={h.key}
            className={`node hub${dragging === h.key ? " dragging" : ""}`}
            style={{ ...at(h), ...categoryStyle(h.category) }}
            onPointerDown={startNode(h.key)}
          >
            {h.category} <small>{h.cards.length}</small>
          </div>
        ))}

        {cards.map((c) => (
          <div
            key={c.item.id}
            className={`card${dragging === c.item.id ? " dragging" : ""}${matches(c.item, filter, query) ? "" : " dim"}`}
            style={{ ...at(c, c.tilt), ...(c.item.sorted_by ? categoryStyle(c.item.category) : {}) }}
            onPointerDown={startNode(c.item.id)}
          >
            <ItemRow item={c.item} onToggle={onToggle} onRemove={onRemove} showEmoji={showEmoji} />
          </div>
        ))}
      </div>

      <div className="board-tools" onPointerDown={(e) => e.stopPropagation()}>
        <span>LINKS</span>
        {(["all", "hubs", "off"] as const).map((m) => (
          <button key={m} type="button" className={linkMode === m ? "on" : undefined} onClick={() => setLinkMode(m)}>
            {m.toUpperCase()}
          </button>
        ))}
        <span className="gap" />
        <button type="button" aria-label="zoom out" onClick={() => zoomBy(1 / 1.2)}>
          −
        </button>
        <button type="button" aria-label="zoom in" onClick={() => zoomBy(1.2)}>
          +
        </button>
        <button type="button" onClick={fit} title="fit everything on screen">
          FIT
        </button>
        <button type="button" className={armTidy ? "arm" : undefined} onClick={tidy} title="undo all dragging">
          {armTidy ? "SURE?" : "TIDY"}
        </button>
      </div>
    </div>
  );
}
