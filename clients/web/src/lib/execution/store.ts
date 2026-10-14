import { useMemo, useSyncExternalStore } from "react";
import { migrateLegacy, type Execution, type LegacyTrade } from "./record";

// Device-local, like the history it replaces: wallet balances stay the
// authority, and this is the account of what this browser asked for.
const KEY = "seametry:executions:v1";
const LEGACY_KEY = "seametry:mainnet-allocation-activity:v1";
const KEPT = 200;
const NONE: Execution[] = [];

let cache: Execution[] | undefined;
const listeners = new Set<() => void>();

function looksLikeExecution(entry: unknown): entry is Execution {
  const value = entry as Partial<Execution> | null;
  return typeof value === "object" && value !== null && typeof value.id === "string" && typeof value.wallet === "string" &&
    (value.kind === "buy" || value.kind === "sell") && Array.isArray(value.legs) && typeof value.createdAt === "string";
}

function parse(text: string | null): unknown[] {
  try {
    const parsed: unknown = JSON.parse(text ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function load(): Execution[] {
  if (typeof window === "undefined") return NONE;
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored !== null) return parse(stored).filter(looksLikeExecution);
    // First read since the engine shipped: the old trade list becomes records
    // once, then its key is removed so the two can never disagree.
    const migrated = migrateLegacy(parse(window.localStorage.getItem(LEGACY_KEY)) as LegacyTrade[]);
    window.localStorage.setItem(KEY, JSON.stringify(migrated));
    window.localStorage.removeItem(LEGACY_KEY);
    return migrated;
  } catch {
    return NONE;
  }
}

function snapshot(): Execution[] {
  cache ??= load();
  return cache;
}

function commit(next: Execution[]) {
  cache = next.slice(0, KEPT);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // A browser that refuses storage still shows this session's records.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const fromAnotherTab = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    cache = undefined;
    listener();
  };
  window.addEventListener("storage", fromAnotherTab);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", fromAnotherTab);
  };
}

export const executions = {
  all: snapshot,
  get: (id: string) => snapshot().find((entry) => entry.id === id),
  add(execution: Execution) {
    commit([execution, ...snapshot().filter((entry) => entry.id !== execution.id)]);
  },
  update(id: string, change: (execution: Execution) => Execution) {
    commit(snapshot().map((entry) => (entry.id === id ? change(entry) : entry)));
  },
  markSeen(ids: string[]) {
    if (!ids.some((id) => snapshot().find((entry) => entry.id === id && !entry.seen))) return;
    commit(snapshot().map((entry) => (ids.includes(entry.id) ? { ...entry, seen: true } : entry)));
  },
};

/** Every record, newest first; filtered to one wallet when given. */
export function useExecutions(wallet?: string): Execution[] {
  const all = useSyncExternalStore(subscribe, snapshot, () => NONE);
  return useMemo(() => (wallet ? all.filter((entry) => entry.wallet === wallet) : all), [all, wallet]);
}
