import { useCallback, useEffect, useRef, useState } from "react";
import type { Item, Sorter } from "../../shared/types.ts";
import { api, LoginRequired } from "./api.ts";

/** Entries typed but not yet accepted by the server (offline, server down). */
interface Pending {
  id: string;
  text: string;
}

const OUTBOX = "jd-outbox";

// Never let storage errors (private mode, blocked site data) break the app.
const outbox = {
  read(): Pending[] {
    try {
      return JSON.parse(localStorage.getItem(OUTBOX) ?? "[]") as Pending[];
    } catch {
      return [];
    }
  },
  write(v: Pending[]) {
    try {
      localStorage.setItem(OUTBOX, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  },
};

const uid = () =>
  crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);

const asLocalItem = (p: Pending): Item => ({
  ...p,
  kind: "unsorted",
  category: "unsorted",
  title: null,
  emoji: null,
  done: false,
  sorted_by: null,
  created_at: Date.now(),
  updated_at: Date.now(),
});

export interface Status {
  message: string;
  soft?: boolean;
}

export function useDrawer() {
  const [items, setItems] = useState<Item[]>([]);
  const [sorter, setSorter] = useState<Sorter>("ai");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const flushing = useRef(false);
  const pollTimer = useRef<number | undefined>(undefined);

  const fail = useCallback((err: unknown, message: string) => {
    if (err instanceof LoginRequired) setNeedsLogin(true);
    else setStatus({ message });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await api.list();
      const pending = outbox.read().filter((p) => !data.items.some((x) => x.id === p.id));
      setItems([...pending.map(asLocalItem), ...data.items]);
      setSorter(data.sorter);
      setNeedsLogin(false);
      return data.items;
    } catch (err) {
      fail(err, "offline");
      return null;
    }
  }, [fail]);

  // Re-fetch every 1.5s while anything is still being sorted (max ~30s).
  const pollWhileSorting = useCallback(
    (tries = 0) => {
      window.clearTimeout(pollTimer.current);
      if (tries > 20) return;
      pollTimer.current = window.setTimeout(async () => {
        const fresh = await refresh();
        if (fresh?.some((x) => !x.sorted_by)) pollWhileSorting(tries + 1);
      }, 1500);
    },
    [refresh]
  );

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      let queue = outbox.read();
      while (queue.length) {
        const { item } = await api.add(queue[0]);
        setItems((prev) => (prev.some((x) => x.id === item.id) ? prev.map((x) => (x.id === item.id ? item : x)) : [item, ...prev]));
        queue = outbox.read().filter((x) => x.id !== item.id);
        outbox.write(queue);
      }
      setStatus(null);
      pollWhileSorting();
    } catch (err) {
      fail(err, "offline — saved on this device, will send when back online");
    } finally {
      flushing.current = false;
    }
  }, [fail, pollWhileSorting]);

  const add = useCallback(
    (text: string) => {
      const entry = { id: uid(), text };
      outbox.write([...outbox.read(), entry]);
      // optimistic: show it right away, tagged as unsorted
      setItems((prev) => [asLocalItem(entry), ...prev]);
      void flush();
    },
    [flush]
  );

  const toggle = useCallback(
    async (item: Item) => {
      const flip = (done: boolean) => setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, done } : x)));
      flip(!item.done);
      try {
        await api.setDone(item.id, !item.done);
      } catch (err) {
        flip(item.done);
        fail(err, "couldn't save that — offline?");
      }
    },
    [fail]
  );

  const remove = useCallback(
    async (item: Item) => {
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      const queue = outbox.read();
      if (queue.some((x) => x.id === item.id)) {
        outbox.write(queue.filter((x) => x.id !== item.id));
        return; // never reached the server
      }
      try {
        await api.remove(item.id);
      } catch (err) {
        fail(err, "couldn't delete — offline?");
        void refresh();
      }
    },
    [fail, refresh]
  );

  const login = useCallback(
    async (passcode: string) => {
      try {
        await api.login(passcode);
        setNeedsLogin(false);
        setStatus(null);
        await refresh();
        void flush();
        return true;
      } catch {
        setStatus({ message: "wrong passcode" });
        return false;
      }
    },
    [refresh, flush]
  );

  useEffect(() => {
    void refresh().then(() => {
      if (outbox.read().length) void flush();
    });
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    const onOnline = () => void flush();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    // keep devices in sync
    const interval = window.setInterval(() => !document.hidden && void refresh(), 30_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.clearInterval(interval);
      window.clearTimeout(pollTimer.current);
    };
  }, [refresh, flush]);

  const shownStatus: Status | null =
    status ?? (sorter === "rules" ? { message: "sorting by simple rules — add an ANTHROPIC_API_KEY on the server for AI sorting", soft: true } : null);

  return { items, needsLogin, status: shownStatus, add, toggle, remove, login };
}
