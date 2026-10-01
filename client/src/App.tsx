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
  const { items, needsLogin, status, add, toggle, remove, login } = useDrawer();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  // The board needs room and a mouse; phones and tablets always get the list.
  const desktop = useMediaQuery("(min-width: 1024px) and (hover: hover) and (pointer: fine)");
  const [layout, setLayout] = useStoredState<Layout>("jd-layout", "board");
  const board = desktop && layout === "board" && !needsLogin;
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

  // After any click (tick, delete, filter), hand focus back to the capture box.
  const refocusAfter =
    <A extends unknown[]>(fn: (...args: A) => unknown) =>
    (...args: A) => {
      fn(...args);
      focusCapture();
    };

  return (
    <main className={board ? "board-mode" : undefined}>
      <div className="panel">
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
              layout={desktop ? layout : undefined}
              onLayout={refocusAfter(setLayout)}
            />
          </>
        )}
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
          onInteract={focusCapture}
        />
      ) : (
        !needsLogin && (
          <Drawer items={items} filter={filter} query={query} onToggle={refocusAfter(toggle)} onRemove={refocusAfter(remove)} />
        )
      )}
    </main>
  );
}
