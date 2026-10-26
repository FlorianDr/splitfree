/**
 * In-memory "at most once per window per key" gate, used to keep floods from turning into a flood of
 * audit rows, log lines or alerts. Pure, so node:test can load it. State is per process and resets on
 * restart, which is fine for its job: bounding noise, not enforcing limits.
 *
 * Returns `{ allow: true, suppressed }` for the first event of a window (with how many events of that
 * key were swallowed since the last allowed one), and `{ allow: false }` otherwise.
 */
export function createThrottle(windowMs: number, maxKeys = 5000) {
  const seen = new Map<string, { last: number; suppressed: number }>();
  return (key: string, now = Date.now()): { allow: true; suppressed: number } | { allow: false } => {
    const entry = seen.get(key);
    if (entry && now - entry.last < windowMs) {
      entry.suppressed++;
      return { allow: false };
    }
    if (!entry && seen.size >= maxKeys) {
      for (const [k, v] of seen) if (now - v.last >= windowMs) seen.delete(k);
      const oldest = seen.keys().next();
      if (seen.size >= maxKeys && !oldest.done) seen.delete(oldest.value);
    }
    seen.set(key, { last: now, suppressed: 0 });
    return { allow: true, suppressed: entry?.suppressed ?? 0 };
  };
}
