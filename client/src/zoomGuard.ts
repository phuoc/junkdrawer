// iOS Safari zooms the page in when you tap a text field whose text is smaller
// than 16px *as shown on screen*, and that zoom cuts off the side of the page.
// A zoomed-out page (Settings › Apps › Safari › Page Zoom, or the "aA" menu)
// shows CSS pixels smaller, so even 16–22px fields can trigger it.
//
// On iPhone and iPad this sets `--zoom-out` on <html> (how far the page is
// zoomed out: 1 = not at all, 2 = 50%), which style.css uses to keep text
// fields at least 16px on screen, and adds the `ios` class those rules key on.

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** How many CSS pixels fit in one screen point: above 1 when the page is zoomed out. */
export function zoomOutFactor(layoutWidth: number, screenW: number, screenH: number, portrait: boolean): number {
  // iOS reports the screen in portrait terms whichever way the phone is held
  const deviceWidth = portrait ? Math.min(screenW, screenH) : Math.max(screenW, screenH);
  if (!layoutWidth || !deviceWidth) return 1;
  return Math.min(4, Math.max(1, layoutWidth / deviceWidth));
}

export function installZoomGuard() {
  if (!isIOS()) return;
  const root = document.documentElement;
  root.classList.add("ios");

  const update = () => {
    // clientWidth is the layout viewport; innerWidth on iOS follows pinch zoom
    const f = zoomOutFactor(root.clientWidth, screen.width, screen.height, matchMedia("(orientation: portrait)").matches);
    root.style.setProperty("--zoom-out", f.toFixed(3));
  };
  update();
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);

  // Where this page owns the window (self-hosted, not inside claude.ai's frame),
  // also tell Safari not to zoom in on focus. iOS still lets you pinch-zoom.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (window.top === window && meta && !/maximum-scale/.test(meta.content)) meta.content += ", maximum-scale=1";
}
