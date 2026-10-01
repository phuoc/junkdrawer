import { useCallback, useEffect, useRef, useState } from "react";
import { useDrawer } from "./useDrawer.ts";
import { Capture } from "./components/Capture.tsx";
import { Filters, type Filter } from "./components/Filters.tsx";
import { Drawer } from "./components/Drawer.tsx";
import { Login } from "./components/Login.tsx";

export function App() {
  const { items, needsLogin, status, add, toggle, remove, login } = useDrawer();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
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
    <main>
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
          />
        </>
      )}
      {status && (
        <div id="status" role="status" className={status.soft ? "soft" : undefined}>
          {status.message}
        </div>
      )}
      {!needsLogin && (
        <Drawer items={items} filter={filter} query={query} onToggle={refocusAfter(toggle)} onRemove={refocusAfter(remove)} />
      )}
    </main>
  );
}
