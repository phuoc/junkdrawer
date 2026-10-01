import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { openDb } from "./lib/db.js";
import { createClassifier, forcedKind } from "./lib/classify.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC = join(ROOT, "public");
const MAX_TEXT = 5000;
const COOKIE = "jd";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

export function createApp({ db, classifier, passcode }) {
  const token = passcode ? createHmac("sha256", passcode).update("junkdrawer-session-v1").digest("hex") : null;

  const authed = (req) => {
    if (!token) return true;
    const got = parseCookies(req.headers.cookie)[COOKIE];
    return !!got && got.length === token.length && timingSafeEqual(Buffer.from(got), Buffer.from(token));
  };

  // Sort in the background so posting stays instant.
  async function sortItem(item) {
    const forced = item._forced;
    const result = await classifier.classify(item.text, db.categories());
    if (forced) result.kind = forced;
    if (db.get(item.id)) db.setSort(item.id, result, result.sortedBy);
  }

  async function api(req, res, path) {
    if (path === "/api/login" && req.method === "POST") {
      const { passcode: given = "" } = await readJson(req);
      if (!token) return send(res, 200, { ok: true });
      const ok = given.length === passcode.length && timingSafeEqual(Buffer.from(given), Buffer.from(passcode));
      if (!ok) return send(res, 401, { error: "wrong passcode" });
      const secure = req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted ? "; Secure" : "";
      res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=34560000${secure}`);
      return send(res, 200, { ok: true });
    }
    if (!authed(req)) return send(res, 401, { error: "login required" });

    if (path === "/api/items" && req.method === "GET") {
      return send(res, 200, { items: db.list(), sorter: classifier.mode });
    }
    if (path === "/api/items" && req.method === "POST") {
      const body = await readJson(req);
      let text = String(body.text ?? "").trim();
      if (!text) return send(res, 400, { error: "empty" });
      if (text.length > MAX_TEXT) return send(res, 413, { error: `max ${MAX_TEXT} characters` });
      const forced = forcedKind(text);
      if (forced && forced.rest.trim()) text = forced.rest.trim();
      const id = typeof body.id === "string" && /^[\w-]{8,64}$/.test(body.id) ? body.id : undefined;
      const item = db.add(text, id);
      if (!item.sorted_by) sortItem({ ...item, _forced: forced?.kind }).catch((e) => console.error(e));
      return send(res, 201, { item });
    }
    const m = /^\/api\/items\/([\w-]+)$/.exec(path);
    if (m && req.method === "PATCH") {
      const body = await readJson(req);
      if (!db.get(m[1])) return send(res, 404, { error: "not found" });
      return send(res, 200, { item: db.setDone(m[1], !!body.done) });
    }
    if (m && req.method === "DELETE") {
      return db.remove(m[1]) ? send(res, 200, { ok: true }) : send(res, 404, { error: "not found" });
    }
    return send(res, 404, { error: "not found" });
  }

  async function serveStatic(res, path) {
    const file = normalize(join(PUBLIC, path === "/" ? "index.html" : path));
    if (!file.startsWith(PUBLIC)) return send(res, 403, "forbidden");
    try {
      const data = await readFile(file);
      res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(data);
    } catch {
      send(res, 404, "not found");
    }
  }

  return createServer(async (req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    try {
      if (path.startsWith("/api/")) await api(req, res, path);
      else await serveStatic(res, path);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) send(res, err.status || 500, { error: err.status ? err.message : "server error" });
    }
  });
}

function send(res, status, body) {
  const json = typeof body !== "string";
  res.writeHead(status, { "Content-Type": json ? "application/json" : "text/plain", "Cache-Control": "no-store" });
  res.end(json ? JSON.stringify(body) : body);
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64_000) throw Object.assign(new Error("too large"), { status: 413 });
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw Object.assign(new Error("bad json"), { status: 400 });
  }
}

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((c) => c.trim().split("=")).filter(([k, v]) => k && v));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  const db = openDb(process.env.JUNK_DB || join(ROOT, "data", "junk.db"));
  const classifier = createClassifier();
  const passcode = process.env.JUNK_PASSCODE || "";
  if (!passcode) console.warn("! JUNK_PASSCODE is not set - anyone who can reach this server can read your drawer.");
  console.log(`sorting with: ${classifier.mode === "ai" ? "Claude" : "rules (set ANTHROPIC_API_KEY for AI sorting)"}`);
  createApp({ db, classifier, passcode }).listen(port, () => console.log(`junk drawer open on http://localhost:${port}`));
}
