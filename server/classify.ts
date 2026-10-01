import Anthropic from "@anthropic-ai/sdk";
import type { Sorter, Sorting } from "../shared/types.ts";

export interface Classifier {
  mode: Sorter;
  classify(text: string, existingCategories?: string[]): Promise<Sorting & { sortedBy: Sorter }>;
}

// --- Rules -------------------------------------------------------------------
// Used as the fallback when no API key is configured or the API call fails,
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

  return { kind, category, title: null };
}

// --- AI ----------------------------------------------------------------------

const SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["todo", "note"] },
    category: { type: "string" },
    title: { type: ["string", "null"] },
  },
  required: ["kind", "category", "title"],
  additionalProperties: false,
};

const SYSTEM = `You sort entries thrown into a personal "junk drawer" app. The user dumps quick thoughts on the go and never wants to organize them; your job is to file each one so they can find it later.

For each entry decide:

kind:
- "todo" — something the user can do and tick off: errands, things to buy, calls, tasks, reminders. Usually short (a line, under ~90 characters). Bare nouns like "milk" or "new phone charger" are shopping todos.
- "note" — something to keep rather than complete: ideas, thoughts, facts, references, quotes, passwords hints, longer multi-sentence text, lists of thoughts. Long or multi-line text is almost always a note, even if it contains verbs.
If the entry starts with "t:" it is a todo; "n:" it is a note.

category: one short lowercase label (1-2 words) for the drawer compartment. Strongly prefer reusing one of the existing categories when it fits, so the drawer stays tidy. Create a new one only when nothing fits. Good examples: shopping, home, work, health, money, ideas, people, errands, learning, travel, misc.

title: for notes longer than ~60 characters, a 3-7 word label that captures the gist, written in the same language as the entry. Otherwise null.`;

export function createClassifier({
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.JUNK_MODEL || "claude-haiku-4-5",
}: { apiKey?: string; model?: string } = {}): Classifier {
  if (!apiKey) return { mode: "rules", classify: async (text) => ({ ...classifyByRules(text), sortedBy: "rules" }) };

  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });

  async function classify(text: string, existingCategories: string[] = []) {
    try {
      const res = await client.messages.create({
        model,
        max_tokens: 1000,
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `Existing categories: ${existingCategories.length ? existingCategories.join(", ") : "(none yet)"}\n\nEntry:\n<entry>\n${text}\n</entry>`,
          },
        ],
      });
      if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") throw new Error(`stop_reason ${res.stop_reason}`);
      const out = res.content.find((b) => b.type === "text");
      if (!out) throw new Error("no text in response");
      const parsed = JSON.parse(out.text) as Partial<Sorting>;
      return {
        kind: parsed.kind === "note" ? "note" : "todo",
        category: normalizeCategory(parsed.category),
        title: parsed.title || null,
        sortedBy: "ai",
      } as const;
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) console.error("[classify] invalid ANTHROPIC_API_KEY");
      else if (err instanceof Anthropic.RateLimitError) console.error("[classify] rate limited");
      else if (err instanceof Anthropic.APIError) console.error(`[classify] API error ${err.status}: ${err.message}`);
      else console.error("[classify]", (err as Error).message);
      return { ...classifyByRules(text), sortedBy: "rules" } as const;
    }
  }

  return { mode: "ai", classify };
}

function normalizeCategory(c: unknown): string {
  const s = String(c ?? "").toLowerCase().replace(/[^\p{L}\p{N} &-]/gu, "").trim().slice(0, 24);
  return s || "misc";
}
