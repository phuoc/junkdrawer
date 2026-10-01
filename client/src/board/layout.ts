import type { Item } from "../../../shared/types.ts";

// Board layout: a mind map with the drawer at the centre (0,0), one hub per
// category around it, and each hub's items clustered around the hub.
// Positions are deterministic so the board looks the same on every reload,
// and they only depend on creation order, so existing nodes don't jump
// around when new ones arrive. Dragged nodes keep a manual offset.

export interface Point {
  x: number;
  y: number;
}

export type Offsets = Record<string, Point>;

export interface Hub extends Point {
  key: string;
  category: string;
  /** Direction from the centre to the hub's home spot; its cards fan out this way. */
  away: number;
}

export interface Placed extends Point {
  item: Item;
  /** Key of the hub this card hangs off; "root" while still sorting. */
  hub: string;
  /** Slight tilt for the cluttered look, in degrees. */
  tilt: number;
}

export interface Layout {
  hubs: Hub[];
  cards: Placed[];
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // ~137.5°, spreads points evenly without a fixed count
export const hubKey = (category: string) => `hub:${category}`;

/** Small stable hash, used for per-item jitter. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295; // 0..1
}

export function computeLayout(items: Item[], offsets: Offsets): Layout {
  const byAge = [...items].sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id));

  // hubs in the order their category first appeared
  const categories: string[] = [];
  for (const x of byAge) if (x.sorted_by && !categories.includes(x.category)) categories.push(x.category);

  const hubs: Hub[] = categories.map((category, i) => {
    const angle = i * GOLDEN - Math.PI / 2;
    const r = 300 + 120 * Math.sqrt(i);
    const key = hubKey(category);
    const off = offsets[key] ?? { x: 0, y: 0 };
    const x = Math.cos(angle) * r * 1.45;
    const y = Math.sin(angle) * r;
    // `away` ignores the drag offset so a dragged hub carries its cluster without spinning it
    return { key, category, away: Math.atan2(y, x), x: x + off.x, y: y + off.y };
  });
  const hubAt = new Map(hubs.map((h) => [h.category, h]));

  const cards: Placed[] = [];
  const counts = new Map<string, number>();
  let pending = 0;
  for (const item of byAge) {
    const jitter = hash(item.id);
    const tilt = (jitter - 0.5) * 7;
    const off = offsets[item.id] ?? { x: 0, y: 0 };

    if (!item.sorted_by) {
      // still sorting: hang just under the drawer
      const a = Math.PI / 2 + (pending++ - 1) * 0.5;
      cards.push({ item, hub: "root", tilt, x: Math.cos(a) * 170 + off.x, y: Math.sin(a) * 140 + off.y });
      continue;
    }
    const hub = hubAt.get(item.category)!;
    const k = counts.get(item.category) ?? 0;
    counts.set(item.category, k + 1);
    // spiral outwards from the hub, starting on the side facing away from the centre
    const a = hub.away + k * GOLDEN + (jitter - 0.5) * 0.6;
    const r = 125 + 55 * Math.sqrt(k) + jitter * 25;
    cards.push({ item, hub: hub.key, tilt, x: hub.x + Math.cos(a) * r * 1.3 + off.x, y: hub.y + Math.sin(a) * r + off.y });
  }
  return { hubs, cards };
}

// --- "related" links -----------------------------------------------------------
// Experimental: connect items in different compartments that share a
// meaningful word ("call mom" in people ↔ "birthday gift for mom" in shopping).

const STOP = new Set(
  "about above after again also among and any are back been before being below between both but can could did does doing down during each few for from further had has have having her here hers him his how into its just like more most much must need not now off once only other our out over own same she should some such than that the their them then there these they this those through too under until very was were what when where which while who whom why will with would you your yours idea note thing things todo make get buy call send pay book fix try ask take bring order check need want".split(
    " "
  )
);

function keywords(text: string): Set<string> {
  const words = text.toLowerCase().match(/\p{L}[\p{L}\p{N}'-]{2,}/gu) ?? [];
  return new Set(words.map((w) => w.replace(/'s$|s$/, "")).filter((w) => w.length >= 3 && !STOP.has(w)));
}

export interface Link {
  a: string;
  b: string;
  word: string;
}

/** Bounding box of everything on the board, padded by roughly a card's size. */
export function bounds({ hubs, cards }: Layout) {
  const pts: Point[] = [{ x: 0, y: 0 }, ...hubs, ...cards];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { minX: Math.min(...xs) - 130, maxX: Math.max(...xs) + 130, minY: Math.min(...ys) - 80, maxY: Math.max(...ys) + 80 };
}

export function relatedLinks(items: Item[], maxPerItem = 2, maxTotal = 80): Link[] {
  const sorted = items.filter((x) => x.sorted_by);
  const words = new Map(sorted.map((x) => [x.id, keywords(`${x.title ?? ""} ${x.text}`)]));
  const degree = new Map<string, number>();
  const links: Link[] = [];
  for (let i = 0; i < sorted.length && links.length < maxTotal; i++) {
    for (let j = i + 1; j < sorted.length && links.length < maxTotal; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (a.category === b.category) continue; // same hub is already linked
      if ((degree.get(a.id) ?? 0) >= maxPerItem || (degree.get(b.id) ?? 0) >= maxPerItem) continue;
      const wb = words.get(b.id)!;
      const shared = [...words.get(a.id)!].find((w) => wb.has(w));
      if (!shared) continue;
      links.push({ a: a.id, b: b.id, word: shared });
      degree.set(a.id, (degree.get(a.id) ?? 0) + 1);
      degree.set(b.id, (degree.get(b.id) ?? 0) + 1);
    }
  }
  return links;
}
