/* ──────────────────────────────────────────────────────────────────────── *
 *  Semantic-version comparison helper                                       *
 *  ────────────────────────────────────────────────────────────────────── */

/**
 * Returns `true` when `current` is strictly older than `required`, using
 * dot-separated numeric comparison (e.g. "1.0.0" vs "1.2.0" → true).
 *
 * Missing segments are treated as 0, so "1.0" vs "1.0.0" → false (equal),
 * and "1.0" vs "1.0.1" → true (outdated).
 *
 * Non-numeric segments coerce to 0 — keep your version strings strictly
 * numeric (no pre-release tags) for predictable behaviour.
 */
export function isOutdated(current: string, required: string): boolean {
  const c = current.split(".").map((n) => Number(n) || 0);
  const r = required.split(".").map((n) => Number(n) || 0);

  for (let i = 0; i < r.length; i++) {
    const cv = c[i] ?? 0;
    const rv = r[i] ?? 0;
    if (cv < rv) return true;
    if (cv > rv) return false;
  }
  return false;
}
