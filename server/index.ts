import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.ts";
import { createClassifier } from "./classify.ts";
import { createApp } from "./app.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const port = Number(process.env.PORT) || 3000;
const db = openDb(process.env.JUNK_DB || join(ROOT, "data", "junk.db"));
const classifier = createClassifier();
const passcode = process.env.JUNK_PASSCODE || "";
const staticDir = resolve(process.env.JUNK_STATIC || join(ROOT, "dist"));

if (!passcode) console.warn("! JUNK_PASSCODE is not set - anyone who can reach this server can read your drawer.");
console.log(`sorting with: ${classifier.mode === "ai" ? "Claude" : "rules (set ANTHROPIC_API_KEY for AI sorting)"}`);

const server = createApp({ db, classifier, passcode, staticDir }).listen(port, () =>
  console.log(`junk drawer open on http://localhost:${port}`)
);

// Docker sends SIGTERM on stop; close cleanly so SQLite checkpoints its WAL.
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    server.close();
    db.close();
    process.exit(0);
  });
}
