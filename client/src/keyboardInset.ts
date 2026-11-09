// On phones the input sits at the bottom of the screen, so bottom-pinned
// elements add --kb (set on <html>) to their offset. It is whichever is larger:
//
// - the on-screen keyboard: iOS doesn't shrink the page when it opens, it
//   covers the bottom of it;
// - the part of this page's frame that hangs off the bottom of the screen.
//   Inside claude.ai's app (home-screen / full-screen) the frame that holds
//   this page is taller than what's visible, so "the bottom of the page" is
//   below the screen edge. The frame can't ask its parent, but an
//   IntersectionObserver reports how much of a full-frame element is actually
//   on screen.

export function keyboardInset(innerHeight: number, viewportHeight: number, viewportOffsetTop: number): number {
  // Whatever Safari has already scrolled into view (offsetTop) isn't covered.
  return Math.max(0, Math.round(innerHeight - viewportHeight - viewportOffsetTop));
}

/** How much of the frame lies below the visible bottom edge (0 when it all shows). */
export function hiddenBelow(innerHeight: number, visibleTop: number, visibleBottom: number): number {
  // nothing visible at all (scrolled away, tab hidden) tells us nothing
  if (visibleBottom <= visibleTop) return 0;
  // a frame cut short by a few pixels of rounding isn't worth moving for
  const cut = Math.round(innerHeight - visibleBottom);
  return cut > 2 ? Math.min(cut, Math.round(innerHeight / 2)) : 0;
}

export function installKeyboardInset() {
  const root = document.documentElement;
  const vv = window.visualViewport;
  let keyboard = 0;
  let cut = 0;
  const apply = () => root.style.setProperty("--kb", `${Math.max(keyboard, cut)}px`);

  if (vv) {
    const update = () => {
      keyboard = keyboardInset(window.innerHeight, vv.height, vv.offsetTop);
      apply();
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
  }

  // Only a framed page can hang off the screen.
  if (window.top === window || typeof IntersectionObserver === "undefined") return;
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:fixed;inset:0;visibility:hidden;pointer-events:none;z-index:-1";
  document.body.appendChild(probe);
  const thresholds = Array.from({ length: 101 }, (_, i) => i / 100);
  const io = new IntersectionObserver(
    (entries) => {
      const e = entries[entries.length - 1];
      const r = e.intersectionRect;
      cut = e.isIntersecting ? hiddenBelow(window.innerHeight, r.top, r.bottom) : 0;
      apply();
    },
    { threshold: thresholds }
  );
  io.observe(probe);
  // a fresh observe reports the exact rect again, not just threshold crossings
  window.addEventListener("resize", () => {
    io.unobserve(probe);
    io.observe(probe);
  });
}
