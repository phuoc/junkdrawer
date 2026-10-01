import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "client",
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true },
  server: {
    // `npm run dev` runs the API on :3000; Vite proxies to it.
    proxy: { "/api": "http://localhost:3000" },
  },
});
