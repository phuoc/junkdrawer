import { useCallback, useEffect, useRef, useState } from "react";
import { useDrawer } from "./useDrawer.ts";
import { useMediaQuery } from "./useMediaQuery.ts";
import { useStoredState } from "./storage.ts";
import type { Filter } from "./filters.ts";
import { Capture } from "./components/Capture.tsx";
import { Filters } from "./components/Filters.tsx";
import { Drawer } from "./components/Drawer.tsx";
import { Login } from "./components/Login.tsx";
import { Board } from "./board/Board.tsx";

export type Layout = "board" | "list";

export function App() {
  const { items, needsLogin, status, add, toggle, setCountdownDate, remove, login } = useDrawer();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  // Computers open on the board, phones and tablets on the list; the
  // LIST / BOARD button switches either way and is remembered per device.
  const desktop = useMediaQuery("(min-width: 1024px) and (hover: hover) and (pointer: fine)");
  const [layout, setLayout] = useStoredState<Layout>("jd-layout", desktop ? "board" : "list");
  const [showEmoji, setShowEmoji] = useStoredState("jd-emoji", true);
  const board = layout === "board" && !needsLogin;
  // On the board the input panel can fold down to a small tab (remembered per
  // device), and the map can take the whole screen (for this visit only).
  const [panelMin, setPanelMin] = useStoredState("jd-panel-min", false);
  const [full, setFull] = useState(false);
  const minimized = board && panelMin;
  const fullscreen = board && full;
  const captureRef = useRef<HTMLTextAreaElement>(null);
  const findRef = useRef<HTMLInputElement>(null);

  // The capture box should always be ready to type into,
  // unless the user is deliberately using the search box.
  const focusCapture = useCallback(() => {
    if (document.activeElement === findRef.current) return;
    captureRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (needsLogin) return;
    focusCapture();
    const onVisible = () => !document.hidden && focusCapture();
    window.addEventListener("focus", focusCapture);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", focusCapture);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [needsLogin, focusCapture]);

  // Full screen also asks the browser for real full screen where it's allowed
  // (desktop browsers; most phones and some app views say no, which is fine).
  const browserFull = useRef(false);
  const enterFull = useCallback(() => {
    setFull(true);
    const req = document.documentElement.requestFullscreen?.bind(document.documentElement);
    req?.()
      .then(() => (browserFull.current = true))
      .catch(() => {});
  }, []);
  const exitFull = useCallback(() => {
    setFull(false);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    browserFull.current = false;
  }, []);
  useEffect(() => {
    // leaving the browser's full screen (Esc, a gesture) leaves ours too
    const onChange = () => {
      if (!document.fullscreenElement && browserFull.current) exitFull();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && full && exitFull();
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("keydown", onKey);
    };
  }, [full, exitFull]);
  useEffect(() => {
    if (!board && full) exitFull(); // switching to the list ends full screen
  }, [board, full, exitFull]);

  const openPanel = () => {
    setPanelMin(false);
    window.setTimeout(focusCapture, 0);
  };

  // After any click (tick, delete, filter), hand focus back to the capture box.
  const refocusAfter =
    <A extends unknown[]>(fn: (...args: A) => unknown) =>
    (...args: A) => {
      fn(...args);
      focusCapture();
    };

  return (
    <main className={board ? "board-mode" : undefined}>
      <div className={`panel${minimized ? " minimized" : ""}`} hidden={fullscreen}>
        {minimized && (
          <button type="button" className="panel-open" onClick={openPanel} aria-label="open the input panel">
            JUNK DRAWER <span aria-hidden="true">＋</span>
          </button>
        )}
        {board && !minimized && (
          <button type="button" className="panel-min" onClick={() => setPanelMin(true)} aria-label="minimize the input panel" title="minimize">
            –
          </button>
        )}
        <div className="panel-body" hidden={minimized}>
        {needsLogin ? (
          <Login onSubmit={login} />
        ) : (
          <>
            <Capture ref={captureRef} onAdd={add} />
            <Filters
              filter={filter}
              onFilter={refocusAfter(setFilter)}
              query={query}
              onQuery={setQuery}
              onClearQuery={refocusAfter(() => setQuery(""))}
              findRef={findRef}
              layout={layout}
              onLayout={refocusAfter(setLayout)}
              showEmoji={showEmoji}
              onShowEmoji={refocusAfter(setShowEmoji)}
            />
          </>
        )}
        {status && (
          <div id="status" role="status" className={status.soft ? "soft" : undefined}>
            {status.message}
          </div>
        )}
        </div>
      </div>
      {board ? (
        <Board
          items={items}
          filter={filter}
          query={query}
          onToggle={refocusAfter(toggle)}
          onRemove={refocusAfter(remove)}
          onSetCountdownDate={refocusAfter(setCountdownDate)}
          onInteract={focusCapture}
          showEmoji={showEmoji}
          fullscreen={fullscreen}
          onFullscreen={(on) => (on ? enterFull() : exitFull())}
        />
      ) : (
        !needsLogin && (
          <Drawer items={items} filter={filter} query={query} onToggle={refocusAfter(toggle)} onRemove={refocusAfter(remove)} onSetCountdownDate={refocusAfter(setCountdownDate)} showEmoji={showEmoji} />
        )
      )}
    </main>
  );
}
