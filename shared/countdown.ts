// Countdowns: an entry that mentions "countdown" (or "count down") becomes a
// live timer card. Shared by the server, the claude.ai preview and the client.

export interface Countdown {
  /** What is being counted down to ("foko bday", "Las Vegas Grand Prix"). */
  label: string;
  /** "looking" while the date is being found; "not-found" asks the user for one. */
  status: "looking" | "found" | "not-found";
  /** An exact moment (ms since epoch), e.g. a race start from a schedule. */
  at: number | null;
  /** Or a calendar date (YYYY-MM-DD), counted in the viewer's own time zone. */
  date: string | null;
  /** Optional local time of day for `date` (HH:MM). Without it the whole day counts. */
  time: string | null;
  /** Birthdays and anniversaries roll over to next year once the day has passed. */
  yearly: boolean;
  /** Where the date came from, shown on the card ("your entry", "Formula 1 calendar"). */
  source: string | null;
  url: string | null;
}

const COUNTDOWN_WORDS = /\bcount[\s-]?down\b/i;

export function isCountdown(text: string): boolean {
  return COUNTDOWN_WORDS.test(text);
}

const MONTHS: Record<string, number> = {};
for (const [i, names] of [
  "jan january januar",
  "feb february februar",
  "mar march mars",
  "apr april",
  "may mai",
  "jun june juni",
  "jul july juli",
  "aug august",
  "sep sept september",
  "oct october okt oktober",
  "nov november",
  "dec december des desember",
].entries())
  for (const n of names.split(" ")) MONTHS[n] = i + 1;
const MONTH_RE = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join("|");

export interface ParsedDate {
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM
  hadYear: boolean;
  /** The bits of text that made up the date and time, to leave out of the label. */
  matched: string[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const validDay = (y: number, m: number, d: number) => {
  const t = new Date(y, m - 1, d);
  return m >= 1 && m <= 12 && t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
};

/**
 * Finds a date (and optional time) in free text: "30. july", "30 july 2027",
 * "july 30th", "30.7", "30/07/2027", "2027-07-30", "6pm", "18:30".
 * Without a year, the next time that day comes round (from `now`) is used.
 */
export function parseDate(text: string, now: Date): ParsedDate | null {
  const matched: string[] = [];
  let y: number | null = null;
  let m = 0;
  let d = 0;
  let found: RegExpExecArray | null;

  if ((found = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(text))) {
    [y, m, d] = [Number(found[1]), Number(found[2]), Number(found[3])];
  } else if (
    (found = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\.?\\s*(?:of\\s+)?(${MONTH_RE})\\b\\.?(?:,?\\s*(\\d{4})\\b)?`, "i").exec(text))
  ) {
    [d, m] = [Number(found[1]), MONTHS[found[2].toLowerCase()]];
    y = found[3] ? Number(found[3]) : null;
  } else if (
    (found = new RegExp(`\\b(${MONTH_RE})\\b\\.?\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s*(\\d{4})\\b)?`, "i").exec(text))
  ) {
    [m, d] = [MONTHS[found[1].toLowerCase()], Number(found[2])];
    y = found[3] ? Number(found[3]) : null;
  } else if ((found = /\b(\d{1,2})[./](\d{1,2})(?:[./](\d{4}|\d{2}))?\b(?![:.]\d)/.exec(text))) {
    // day first, as in "30.7" or "30/07/2027"
    [d, m] = [Number(found[1]), Number(found[2])];
    y = found[3] ? Number(found[3].length === 2 ? `20${found[3]}` : found[3]) : null;
  }
  if (!found) return null;
  matched.push(found[0]);

  const hadYear = y !== null;
  if (y === null) {
    y = now.getFullYear();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (validDay(y, m, d) && new Date(y, m - 1, d) < today) y += 1;
  }
  if (!validDay(y, m, d)) return null;

  // a time of day, outside the date we already used
  const rest = text.replace(found[0], " ");
  let time: string | null = null;
  let t: RegExpExecArray | null;
  if ((t = /\b(?:at\s+|kl\.?\s*|@\s*)?([01]?\d|2[0-3]):([0-5]\d)\b/i.exec(rest))) {
    time = `${pad(Number(t[1]))}:${t[2]}`;
    matched.push(t[0]);
  } else if ((t = /\b(?:at\s+)?(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i.exec(rest))) {
    const h = (Number(t[1]) % 12) + (t[3].toLowerCase() === "pm" ? 12 : 0);
    time = `${pad(h)}:${t[2] ?? "00"}`;
    matched.push(t[0]);
  }
  return { date: ymd(y, m, d), time, hadYear, matched };
}

const YEARLY = /\b(b-?day|birthday|bursdag|anniversary|jubileum)\b/i;

/** What the countdown is for: the entry minus "countdown" and the date words. */
export function countdownLabel(text: string, matched: string[] = []): string {
  let s = text;
  for (const m of matched) s = s.replace(m, " ");
  s = s
    .replace(new RegExp(COUNTDOWN_WORDS.source, "gi"), " ")
    .replace(/\s+/g, " ")
    .trim()
    // leftover joining words at either end: "countdown to x", "x - countdown on"
    .replace(/^(?:(?:to|till|until|for|on|the|a)\b\s*|[-–:,.!]\s*)+/i, "")
    .replace(/(?:\s*\b(?:to|till|until|for|on|at)|\s*[-–:,.!])+$/i, "")
    .trim();
  return s || "countdown";
}

/** The parts of a countdown that can be read straight from the entry. */
export function countdownFromText(text: string, now: Date): Countdown {
  const parsed = parseDate(text, now);
  const label = countdownLabel(text, parsed?.matched);
  if (!parsed) return { label, status: "looking", at: null, date: null, time: null, yearly: false, source: null, url: null };
  return {
    label,
    status: "found",
    at: null,
    date: parsed.date,
    time: parsed.time,
    yearly: !parsed.hadYear && YEARLY.test(text),
    source: "your entry",
    url: null,
  };
}

/**
 * When the countdown ends, in the viewer's time zone. Yearly ones that have
 * passed (their whole day included) move on to next year's date.
 */
export function countdownTarget(cd: Countdown, now: Date): Date | null {
  if (cd.status !== "found") return null;
  if (cd.at !== null) return new Date(cd.at);
  if (!cd.date) return null;
  const [y, m, d] = cd.date.split("-").map(Number);
  const [hh, mm] = (cd.time ?? "00:00").split(":").map(Number);
  let t = new Date(y, m - 1, d, hh, mm);
  if (cd.yearly) {
    while (t.getTime() + (cd.time ? 0 : 86_400_000) <= now.getTime()) t = new Date(t.getFullYear() + 1, m - 1, d, hh, mm);
  }
  return t;
}

/** Days/hours/minutes/seconds left, or how long ago it was. */
export function timeLeft(target: Date, now: Date, allDay: boolean) {
  const ms = target.getTime() - now.getTime();
  // an all-day event is "today" for the whole of its day
  if (allDay && ms <= 0 && ms > -86_400_000) return { state: "today" as const };
  if (ms <= 0) return { state: "past" as const, days: Math.floor(-ms / 86_400_000) };
  const s = Math.floor(ms / 1000);
  return {
    state: "future" as const,
    days: Math.floor(s / 86_400),
    hours: Math.floor((s % 86_400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

/** Check a date Claude or a schedule returned: a real day, today or later. */
export function cleanFoundDate(start: unknown, now: Date): Pick<Countdown, "at" | "date" | "time"> | null {
  if (typeof start !== "string") return null;
  const s = start.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) {
    const [y, m, d] = dateOnly.slice(1).map(Number);
    if (!validDay(y, m, d)) return null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return new Date(y, m - 1, d) >= today ? { at: null, date: s, time: null } : null;
  }
  // a full timestamp needs an offset or "Z", so it means one moment everywhere
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s)) return null;
  const at = Date.parse(s);
  return Number.isFinite(at) && at > now.getTime() - 3 * 3_600_000 ? { at, date: null, time: null } : null;
}
