# Junk Drawer

A place to throw notes and todos without thinking about where they go. Open it, type, press enter, done. Claude sorts each entry into a **todo** or a **note** and files it in a category (shopping, work, ideas, ...).

## How it works

- The input is focused as soon as the page opens. **Enter** saves (on the iPhone keyboard too). Shift+Enter adds a new line.
- Saving is instant. Sorting runs in the background, and the entry moves into its compartment a moment later.
- **Todo vs. note:** a todo is something you can tick off. It's usually one short line (under about 90 characters), like "buy milk", "call the dentist", or just "batteries". A note is something to keep: ideas, facts, references, or anything long or multi-line. Claude decides, and it leans on length the same way.
- To override the sorting, start with `t:` (force a todo) or `n:` (force a note).
- Claude reuses your existing categories where it can, so the drawer stays tidy.
- **Find** searches every entry. **Done** shows ticked-off todos.
- Works offline: entries are kept on the device and sent when you're back online.
- Install it to your home screen (Safari → Share → Add to Home Screen) so it opens like an app.

## Run

Needs Node 22.13+ (it uses the built-in `node:sqlite`).

```sh
npm install
ANTHROPIC_API_KEY=sk-ant-... JUNK_PASSCODE=pick-something npm start
# http://localhost:3000
```

| env | |
|---|---|
| `ANTHROPIC_API_KEY` | Turns on AI sorting. Without it, a simple length/keyword rule sorts entries. |
| `JUNK_PASSCODE` | Passcode for the login screen. Each device stays logged in for about a year. **Set this on any public deployment.** |
| `JUNK_MODEL` | Claude model to use (default `claude-opus-5-5`). |
| `JUNK_DB` | SQLite file path (default `./data/junk.db`). |
| `PORT` | default `3000` |

## Deploy

You need one small server with a persistent disk, so every device (phone, laptop, tablet, work computer) sees the same drawer. The Dockerfile runs on Fly.io, Railway or Render. Mount a volume at `/data` and set the env vars above. Use HTTPS, which those hosts provide.

## Test

```sh
npm test
```
