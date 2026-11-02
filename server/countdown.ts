import Anthropic from "@anthropic-ai/sdk";
import { cleanFoundDate, countdownFromText, type Countdown } from "../shared/countdown.ts";

/** Finds the date for a countdown entry, or says it couldn't. Never throws. */
export type CountdownResolver = (text: string, now: Date) => Promise<Countdown>;

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

// --- Formula 1: the public jolpica-f1 schedule (the Ergast API's successor) ---

const F1 = /\b(f1|formula\s?(1|one)|grand\s?prix|gp)\b/i;

interface F1Race {
  raceName?: string;
  date?: string;
  time?: string;
  url?: string;
}

export async function nextF1Race(now: Date, fetchFn: FetchFn = fetch): Promise<Partial<Countdown> | null> {
  // After the last race of a season "current/next" is empty, so also try next season.
  const urls = [
    "https://api.jolpi.ca/ergast/f1/current/next.json",
    `https://api.jolpi.ca/ergast/f1/${now.getUTCFullYear() + 1}.json`,
  ];
  for (const url of urls) {
    try {
      const res = await fetchFn(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const data = (await res.json()) as { MRData?: { RaceTable?: { Races?: F1Race[] } } };
      for (const race of data.MRData?.RaceTable?.Races ?? []) {
        if (!race.date) continue;
        const at = Date.parse(`${race.date}T${race.time ?? "00:00:00Z"}`);
        if (Number.isFinite(at) && at > now.getTime())
          return { label: race.raceName ?? "Next F1 race", at, date: null, time: null, source: "Formula 1 calendar", url: race.url ?? null };
      }
    } catch (err) {
      console.error("[countdown] F1 calendar:", (err as Error).message);
    }
  }
  return null;
}

// --- Anything else: Claude looks it up with web search -------------------------

const LOOKUP_INSTRUCTIONS = `You find when an upcoming event starts, for a countdown timer in a personal notes app.

Search the web for the NEXT upcoming occurrence of the event the user means (not a past one). Prefer official sources: the organiser, the league or the venue. If the exact start time is known, give it; otherwise give the date.

Reply with only one JSON object, no other text:
{"found": true, "label": "<short name of the event, e.g. \\"LoL Worlds 2026 Final\\">", "start": "<ISO 8601: either YYYY-MM-DD, or YYYY-MM-DDTHH:MM with a UTC offset or Z>", "url": "<the page you got the date from>"}
or, if you can't find a confirmed upcoming date:
{"found": false}`;

function firstJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function claudeLookup(client: Anthropic, model: string) {
  return async (text: string, label: string, now: Date): Promise<Partial<Countdown> | null> => {
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `Today is ${now.toISOString().slice(0, 10)}.\n\nThe user wrote:\n<entry>\n${text}\n</entry>\n\nWhen does the next "${label}" start?`,
      },
    ];
    // A server-side search can pause a long turn; send it back to continue (a few times at most).
    for (let round = 0; round < 4; round++) {
      const res = await client.messages.create({
        model,
        max_tokens: 2000,
        system: LOOKUP_INSTRUCTIONS,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
        messages,
      });
      if (res.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: res.content });
        continue;
      }
      if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
      const reply = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      const json = firstJsonObject(reply);
      if (!json || json.found !== true) return null;
      const when = cleanFoundDate(json.start, now);
      if (!when) return null;
      return {
        ...when,
        label: typeof json.label === "string" && json.label.trim() ? json.label.trim().slice(0, 80) : label,
        source: "web search",
        url: typeof json.url === "string" && /^https?:\/\//.test(json.url) ? json.url : null,
      };
    }
    return null;
  };
}

export function createCountdownResolver({
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.JUNK_MODEL || "claude-haiku-4-5",
  fetchFn = fetch,
  lookup,
}: {
  apiKey?: string;
  model?: string;
  fetchFn?: FetchFn;
  /** Override the Claude web lookup (tests). */
  lookup?: (text: string, label: string, now: Date) => Promise<Partial<Countdown> | null>;
} = {}): CountdownResolver {
  const webLookup = lookup ?? (apiKey ? claudeLookup(new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1 }), model) : null);

  return async (text, now) => {
    const base = countdownFromText(text, now);
    if (base.status === "found") return base; // the entry gave a date

    const found = async (): Promise<Partial<Countdown> | null> => {
      if (F1.test(text)) {
        const race = await nextF1Race(now, fetchFn);
        if (race) return race;
      }
      if (webLookup) {
        try {
          return await webLookup(text, base.label, now);
        } catch (err) {
          if (err instanceof Anthropic.APIError) console.error(`[countdown] API error ${err.status}: ${err.message}`);
          else console.error("[countdown]", (err as Error).message);
        }
      }
      return null;
    };
    const hit = await found();
    return hit ? { ...base, ...hit, status: "found", yearly: false } : { ...base, status: "not-found" };
  };
}
