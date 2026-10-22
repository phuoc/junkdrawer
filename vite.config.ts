import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // `--mode artifact` builds the claude.ai preview: one JS and one CSS file
  // that scripts/build-artifact.mjs inlines into a single page.
  const artifact = mode === "artifact";
  return {
    root: "client",
    plugins: [react()],
    publicDir: artifact ? false : "public", // no manifest, icons or service worker in the preview
    build: {
      outDir: artifact ? "../dist-artifact" : "../dist",
      emptyOutDir: true,
      ...(artifact && { modulePreload: { polyfill: false }, cssCodeSplit: false, assetsInlineLimit: 100_000_000 }),
    },
    server: {
      // `npm run dev` runs the API on :3000; Vite proxies to it.
      proxy: { "/api": "http://localhost:3000" },
    },
  };
});
