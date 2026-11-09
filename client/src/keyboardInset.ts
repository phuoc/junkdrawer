// On phones the input sits at the bottom of the screen. iOS doesn't shrink the
// page when the on-screen keyboard opens, it covers the bottom of it, so this
// sets --kb on <html> to how much of the page the keyboard hides (0 when
// closed). Bottom-pinned elements add it to their offset to stay above it.

export function keyboardInset(innerHeight: number, viewportHeight: number, viewportOffsetTop: number): number {
  // Whatever Safari has already scrolled into view (offsetTop) isn't covered.
  return Math.max(0, Math.round(innerHeight - viewportHeight - viewportOffsetTop));
}

export function installKeyboardInset() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const update = () => root.style.setProperty("--kb", `${keyboardInset(window.innerHeight, vv.height, vv.offsetTop)}px`);
  update();
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
}
