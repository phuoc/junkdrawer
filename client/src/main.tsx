import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./style.css";
import { installZoomGuard } from "./zoomGuard.ts";
import { installKeyboardInset } from "./keyboardInset.ts";

installZoomGuard();
installKeyboardInset();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// No service worker in the claude.ai preview: the page frame doesn't allow one.
if ("serviceWorker" in navigator && import.meta.env.PROD && import.meta.env.MODE !== "artifact") {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
