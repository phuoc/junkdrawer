import type { Item, ItemsResponse } from "../../shared/types.ts";

/** Thrown when the server wants a passcode. */
export class LoginRequired extends Error {}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  if (res.status === 401 && path !== "/api/login") throw new LoginRequired();
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || res.statusText);
  return res.json() as Promise<T>;
}

export const api = {
  list: () => call<ItemsResponse>("GET", "/api/items"),
  add: (entry: { id: string; text: string }) => call<{ item: Item }>("POST", "/api/items", entry),
  setDone: (id: string, done: boolean) => call<{ item: Item }>("PATCH", `/api/items/${id}`, { done }),
  remove: (id: string) => call<{ ok: true }>("DELETE", `/api/items/${id}`),
  login: (passcode: string) => call<{ ok: true }>("POST", "/api/login", { passcode }),
};
