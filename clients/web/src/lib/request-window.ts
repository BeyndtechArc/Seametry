/**
 * Grants each request a departure time so that no more than `limit` leave in
 * any `windowMs`: the first `limit` go at once, and every later one waits for
 * the oldest of the last `limit` to leave the window. Pure, apart from the
 * clock it is handed, so the rule is tested without a server
 * (tests/compose-formula.spec.ts); lib/jupiter.ts owns the numbers.
 */
export function slidingWindow(limit: number, windowMs: number): (now: number) => number {
  const granted: number[] = [];
  return (now) => {
    const at = granted.length < limit ? now : Math.max(now, granted[0] + windowMs);
    granted.push(at);
    if (granted.length > limit) granted.shift();
    return at;
  };
}
