import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { TLSSocket } from "node:tls";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, sep } from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Db } from "./db.ts";
import type { Classifier } from "./classify.ts";
import type { CountdownResolver } from "./countdown.ts";
import { countdownFromText, isCountdown, type Countdown } from "../shared/countdown.ts";
import { forcedKind } from "./classify.ts";
import type { Item } from "../shared/types.ts";

const MAX_TEXT = 5000;
const COOKIE = "jd";
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function createApp({
  db,
  classifier,
  countdowns,
  passcode,
  staticDir,
}: {
  db: Db;
  classifier: Classifier;
  /** Finds dates for countdown entries; without it they ask the user for one. */
  countdowns?: CountdownResolver;
  passcode: string;
  staticDir?: string;
}) {
  const token = passcode ? createHmac("sha256", passcode).update("junkdrawer-session-v1").digest("hex") : null;

  const authed = (req: IncomingMessage) => {
    if (!token) return true;
    const got = parseCookies(req.headers.cookie)[COOKIE];
    return safeEqual(got, token);
  };

  // Sort in the background so posting stays instant.
  async function sortItem(item: Item, forced?: "todo" | "note") {
    const result = await classifier.classify(item.text, db.categories());
    if (forced) result.kind = forced;
    if (item.countdown) result.kind = "note"; // a timer, nothing to tick off
    if (db.get(item.id)) db.setSort(item.id, result, result.sortedBy);
  }

  async function api(req: IncomingMessage, res: ServerResponse, path: string) {
    if (path === "/api/login" && req.method === "POST") {
      const { passcode: given = "" } = (await readJson(req)) as { passcode?: string };
      if (!token) return send(res, 200, { ok: true });
      if (!safeEqual(String(given), passcode)) return send(res, 401, { error: "wrong passcode" });
      const https = req.headers["x-forwarded-proto"] === "https" || (req.socket as TLSSocket).encrypted;
      res.setHeader(
        "Set-Cookie",
        `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=34560000${https ? "; Secure" : ""}`
      );
      return send(res, 200, { ok: true });
    }
    if (!authed(req)) return send(res, 401, { error: "login required" });

    if (path === "/api/items" && req.method === "GET") {
      return send(res, 200, { items: db.list(), sorter: classifier.mode });
    }
    if (path === "/api/items" && req.method === "POST") {
      const body = (await readJson(req)) as { text?: unknown; id?: unknown };
      let text = String(body.text ?? "").trim();
      if (!text) return send(res, 400, { error: "empty" });
      if (text.length > MAX_TEXT) return send(res, 413, { error: `max ${MAX_TEXT} characters` });
      const forced = forcedKind(text);
      if (forced && forced.rest.trim()) text = forced.rest.trim();
      const id = typeof body.id === "string" && /^[\w-]{8,64}$/.test(body.id) ? body.id : undefined;
      let item = db.add(text, id);
      if (!item.sorted_by && !item.countdown && isCountdown(text)) {
        // Show the timer card straight away; dates that aren't in the entry are looked up meanwhile.
        const now = new Date();
        const first = countdownFromText(text, now);
        item = db.setCountdown(item.id, countdowns || first.status === "found" ? first : { ...first, status: "not-found" })!;
        if (first.status === "looking" && countdowns)
          countdowns(text, now)
            .then((cd) => db.get(item.id) && db.setCountdown(item.id, cd))
            .catch((e) => console.error(e));
      }
      if (!item.sorted_by) sortItem(item, forced?.kind).catch((e) => console.error(e));
      return send(res, 201, { item });
    }
    const m = /^\/api\/items\/([\w-]+)$/.exec(path);
    if (m && req.method === "PATCH") {
      const body = (await readJson(req)) as { done?: unknown; countdownDate?: unknown };
      const item = db.get(m[1]);
      if (!item) return send(res, 404, { error: "not found" });
      if ("countdownDate" in body) {
        // the user setting or changing a countdown's date
        const date = body.countdownDate;
        if (!item.countdown || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
          return send(res, 400, { error: "expected countdownDate as YYYY-MM-DD on a countdown" });
        const cd: Countdown = { ...item.countdown, status: "found", at: null, date, time: null, source: "you", url: null };
        return send(res, 200, { item: db.setCountdown(item.id, cd) });
      }
      return send(res, 200, { item: db.setDone(m[1], !!body.done) });
    }
    if (m && req.method === "DELETE") {
      return db.remove(m[1]) ? send(res, 200, { ok: true }) : send(res, 404, { error: "not found" });
    }
    return send(res, 404, { error: "not found" });
  }

  async function serveStatic(res: ServerResponse, path: string) {
    if (!staticDir) return send(res, 404, "not found");
    const file = normalize(join(staticDir, path === "/" ? "index.html" : path));
    if (!file.startsWith(staticDir + sep)) return send(res, 403, "forbidden");
    try {
      const data = await readFile(file);
      // Vite fingerprints everything under /assets, so those can be cached forever.
      const cache = path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
      res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream", "Cache-Control": cache });
      res.end(data);
    } catch {
      send(res, 404, "not found");
    }
  }

  return createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    try {
      if (path.startsWith("/api/")) await api(req, res, path);
      else await serveStatic(res, path);
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(err);
      if (!res.headersSent) {
        if (err instanceof HttpError) send(res, err.status, { error: err.message });
        else send(res, 500, { error: "server error" });
      }
    }
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  const json = typeof body !== "string";
  res.writeHead(status, { "Content-Type": json ? "application/json" : "text/plain", "Cache-Control": "no-store" });
  res.end(json ? JSON.stringify(body) : body);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64_000) throw new HttpError(413, "too large");
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new HttpError(400, "bad json");
  }
}

function safeEqual(a: string | undefined, b: string) {
  if (!a || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function parseCookies(header = ""): Record<string, string> {
  return Object.fromEntries(
    header
      .split(";")
      .map((c) => c.trim().split("="))
      .filter(([k, v]) => k && v)
  );
}
