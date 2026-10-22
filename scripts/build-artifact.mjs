// Builds the claude.ai preview into one self-contained page:
// dist-artifact/junk-drawer.html. claude.ai wraps a published page in its own
// <html>/<head>/<body>, so this writes only the title, styles, mount point
// and script, with the bundle inlined (the page can't load files from here).
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = "dist-artifact";
execFileSync("npx", ["vite", "build", "--mode", "artifact"], { stdio: "inherit" });

const assets = join(out, "assets");
const files = readdirSync(assets);
const js = files.filter((f) => f.endsWith(".js"));
const css = files.filter((f) => f.endsWith(".css"));
if (js.length !== 1 || css.length > 1) throw new Error(`expected one JS and at most one CSS file, got ${files.join(", ")}`);

const script = readFileSync(join(assets, js[0]), "utf8").replace(/<\/script/gi, "<\\/script");
const style = css.length ? readFileSync(join(assets, css[0]), "utf8").replace(/<\/style/gi, "<\\/style") : "";

const page = `<title>Junk Drawer</title>
<style>${style}</style>
<div id="root"></div>
<script type="module">${script}</script>
`;
writeFileSync(join(out, "junk-drawer.html"), page);
console.log(`wrote ${out}/junk-drawer.html (${(page.length / 1024).toFixed(0)} KB)`);
