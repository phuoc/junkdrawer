import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
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
  const wantFull = useRef(false); // what the user last asked for
  const browserFull = useRef(false); // whether we hold the browser's full screen
  const enterFull = useCallback(() => {
    wantFull.current = true;
    setFull(true);
    const req = document.documentElement.requestFullscreen?.bind(document.documentElement);
    req?.()
      .then(() => {
        browserFull.current = true;
        // EXIT came while the browser was still switching: leave again now
        if (!wantFull.current) document.exitFullscreen?.().catch(() => {});
      })
      .catch(() => {});
  }, []);
  const exitFull = useCallback(() => {
    wantFull.current = false;
    setFull(false);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    browserFull.current = false;
    // the panel comes back: have the capture box ready to type into again
    window.setTimeout(focusCapture, 0);
  }, [focusCapture]);
  useEffect(() => {
    if (!full) return;
    // leaving the browser's full screen (Esc, a gesture) leaves ours too
    const onChange = () => {
      if (!document.fullscreenElement && browserFull.current) exitFull();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && exitFull();
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("keydown", onKey);
    };
  }, [full, exitFull]);
  useEffect(() => {
    if (!board && full) exitFull(); // e.g. the session needs a passcode again
  }, [board, full, exitFull]);
  const changeLayout = (l: Layout) => {
    if (l === "list" && full) exitFull(); // leave full screen together with the board
    setLayout(l);
  };

  const openTabRef = useRef<HTMLButtonElement>(null);
  const openPanel = () => {
    setPanelMin(false);
    window.setTimeout(focusCapture, 0);
  };
  const minimizePanel = () => {
    setPanelMin(true);
    window.setTimeout(() => openTabRef.current?.focus(), 0); // keep keyboard focus on the panel's tab
  };

  // While the panel is minimized the capture box is hidden, so typing a letter
  // (with nothing else focused) opens the panel and the letter lands in the box.
  useEffect(() => {
    if (!minimized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      const active = document.activeElement;
      if (active && active !== document.body && active !== openTabRef.current) return;
      // focus before the keystroke is delivered, so the character is typed into the box
      flushSync(() => setPanelMin(false));
      captureRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [minimized, setPanelMin]);

  // After any click (tick, delete, filter), hand focus back to the capture box.
  const refocusAfter =
    <A extends unknown[]>(fn: (...args: A) => unknown) =>
    (...args: A) => {
      fn(...args);
      focusCapture();
    };

  return (
    <main className={board ? "board-mode" : undefined}>
      {/* On touch screens the list puts the input at the bottom, so the name moves up here */}
      {!board && !needsLogin && (
        <p className="brand" aria-hidden="true">
          <span className="label">JUNK DRAWER</span>
        </p>
      )}
      <div className={`panel${minimized ? " minimized" : ""}`} hidden={fullscreen}>
        {minimized && (
          <button type="button" className="panel-open" ref={openTabRef} onClick={openPanel} aria-label="open the input panel">
            JUNK DRAWER <span aria-hidden="true">＋</span>
          </button>
        )}
        {board && !minimized && (
          <button type="button" className="panel-min" onClick={minimizePanel} aria-label="minimize the input panel" title="minimize">
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
              onLayout={refocusAfter(changeLayout)}
              showEmoji={showEmoji}
              onShowEmoji={refocusAfter(setShowEmoji)}
            />
          </>
        )}
        </div>
        {/* outside panel-body so messages (offline, couldn't save) still show while minimized */}
        {status && (
          <div id="status" role="status" className={status.soft ? "soft" : undefined}>
            {status.message}
          </div>
        )}
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
          panelMinimized={minimized}
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
