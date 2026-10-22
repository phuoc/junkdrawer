// How an entry gets sorted, shared by the server (Anthropic API) and the
// claude.ai preview (which asks Claude through the page), so both file
// entries the same way.
import type { Sorting } from "./types.ts";
import { emojiFor, isEmoji } from "./emoji.ts";

// --- Rules -------------------------------------------------------------------
// Used as the fallback when Claude isn't available or a call fails,
// and for explicit prefixes ("t: ..." forces a todo, "n: ..." forces a note).

const ACTION_START =
  /^(buy|get|call|email|text|pay|book|fix|clean|send|pick up|return|order|schedule|renew|cancel|check|finish|write|read|watch|make|bring|remember|remind|ask|submit|sign|print|wash|reply|install|update|go|take|try|find|learn)\b/i;

export function forcedKind(text: string): { kind: "todo" | "note"; rest: string } | null {
  const m = /^\s*(t|todo|n|note)\s*:\s*/i.exec(text);
  if (!m) return null;
  return { kind: m[1][0].toLowerCase() === "t" ? "todo" : "note", rest: text.slice(m[0].length) };
}

/**
 * The rule of thumb for todo vs. note:
 * - todo: one short line (≤ ~90 chars), something you'd tick off. Starts with a
 *   verb, or is a short noun phrase like "milk" / "birthday gift for mom".
 * - note: multiple lines, long text, or anything reading like a thought,
 *   idea, fact or reference ("wifi password is ...", "idea: ...").
 */
export function classifyByRules(text: string): Sorting {
  const forced = forcedKind(text);
  const t = (forced ? forced.rest : text).trim();
  const words = t.split(/\s+/).length;
  let kind: Sorting["kind"];
  if (forced) kind = forced.kind;
  else if (t.includes("\n") || t.length > 90 || words > 14) kind = "note";
  else if (/^(idea|note|thought|fyi|quote)\b/i.test(t) || /\b(is|are|was)\b.*\d/.test(t)) kind = "note";
  else kind = "todo";

  let category = "misc";
  if (/^(buy|order|get)\b/i.test(t) || (/^[\w\s,'-]{1,30}$/.test(t) && words <= 3 && !ACTION_START.test(t)))
    category = "shopping";
  else if (/^idea\b/i.test(t)) category = "ideas";

  return { kind, category, title: null, emoji: emojiFor(t) };
}

// --- Claude --------------------------------------------------------------------

export const SORTING_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["todo", "note"] },
    category: { type: "string" },
    title: { type: ["string", "null"] },
    emoji: { type: "string" },
  },
  required: ["kind", "category", "title", "emoji"],
  additionalProperties: false,
};

export const SORTING_INSTRUCTIONS = `You sort entries thrown into a personal "junk drawer" app. The user dumps quick thoughts on the go and never wants to organize them; your job is to file each one so they can find it later.

For each entry decide:

kind:
- "todo" — something the user can do and tick off: errands, things to buy, calls, tasks, reminders. Usually short (a line, under ~90 characters). Bare nouns like "milk" or "new phone charger" are shopping todos.
- "note" — something to keep rather than complete: ideas, thoughts, facts, references, quotes, passwords hints, longer multi-sentence text, lists of thoughts. Long or multi-line text is almost always a note, even if it contains verbs.
If the entry starts with "t:" it is a todo; "n:" it is a note.

category: one short lowercase label (1-2 words) for the drawer compartment. Strongly prefer reusing one of the existing categories when it fits, so the drawer stays tidy. Create a new one only when nothing fits. Good examples: shopping, home, work, health, money, ideas, people, errands, learning, travel, misc.

title: for notes longer than ~60 characters, a 3-7 word label that captures the gist, written in the same language as the entry. Otherwise null.

emoji: exactly one emoji for the thing the entry is about, so it can be spotted at a glance. Pick the object or subject, not the action: "buy milk" → 🥛, "call the dentist" → 🦷, "renew passport" → 🛂, "fix the leaking tap" → 🚰, "wifi password" → 📶. Use 📝 only if nothing more specific fits.`;

/** The per-entry message: the drawer's current categories and the entry itself. */
export function sortingRequest(text: string, existingCategories: string[]) {
  return `Existing categories: ${existingCategories.length ? existingCategories.join(", ") : "(none yet)"}\n\nEntry:\n<entry>\n${text}\n</entry>`;
}

/** Turn whatever Claude returned into a clean Sorting, filling gaps from the rules. */
export function cleanSorting(parsed: Partial<Sorting> | null | undefined, text: string): Sorting {
  return {
    kind: parsed?.kind === "note" ? "note" : "todo",
    category: normalizeCategory(parsed?.category),
    title: typeof parsed?.title === "string" && parsed.title.trim() ? parsed.title.trim() : null,
    emoji: isEmoji(parsed?.emoji) ? parsed.emoji : emojiFor(text),
  };
}

function normalizeCategory(c: unknown): string {
  const s = String(c ?? "").toLowerCase().replace(/[^\p{L}\p{N} &-]/gu, "").trim().slice(0, 24);
  return s || "misc";
}
