/**
 * In-memory login throttle per username and per IP. Enough for a single
 * instance (docs/02-architecture.md §5): 5 failures in 15 minutes locks that
 * key for the rest of the window.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

type Entry = { failures: number; windowStart: number };
const store = new Map<string, Entry>();

function current(key: string, now: number): Entry | undefined {
  const e = store.get(key);
  if (e && now - e.windowStart > WINDOW_MS) {
    store.delete(key);
    return undefined;
  }
  return e;
}

export function isLocked(keys: string[], now = Date.now()): boolean {
  return keys.some((k) => (current(k, now)?.failures ?? 0) >= MAX_FAILURES);
}

export function recordFailure(keys: string[], now = Date.now()): void {
  for (const k of keys) {
    const e = current(k, now);
    if (e) e.failures += 1;
    else store.set(k, { failures: 1, windowStart: now });
  }
}

export function clearFailures(keys: string[]): void {
  for (const k of keys) store.delete(k);
}

export function resetRateLimiter(): void {
  store.clear();
}
