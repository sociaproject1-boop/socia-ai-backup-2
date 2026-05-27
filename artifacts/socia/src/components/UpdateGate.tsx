import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { APP_VERSION } from "@/config";
import { isOutdated } from "@/utils/versionCheck";
import ForceUpdate from "@/components/ForceUpdate";

/* ──────────────────────────────────────────────────────────────────────── *
 *  UpdateGate                                                               *
 *  ────────────────────────────────────────────────────────────────────────  *
 *  Wraps the entire app. On mount, checks `app_config.min_version` from    *
 *  Supabase. If the installed APP_VERSION is older, renders the blocking   *
 *  ForceUpdate screen instead of the app tree.                             *
 *                                                                           *
 *  Performance: result is cached in localStorage for 24 h so repeat       *
 *  visits resolve synchronously — no network round-trip on every cold      *
 *  start. Only one network fetch per day.                                  *
 *                                                                           *
 *  Failure modes:                                                           *
 *    - Network error / Supabase down: fail OPEN (let the app run)         *
 *    - Empty / malformed response: fail OPEN                               *
 *  Only an explicitly-newer min_version blocks the app.                    *
 *  ────────────────────────────────────────────────────────────────────── */

const CACHE_KEY    = "socia_vc";        // version-check cache key
const CACHE_TTL_MS = 86_400_000;        // 24 hours

interface VcCache { ts: number; minVersion: string | null }

function readCache(): VcCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VcCache;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null; // expired
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(minVersion: string | null) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), minVersion }));
  } catch {}
}

export default function UpdateGate({ children }: { children: ReactNode }) {
  const [minVersion, setMinVersion] = useState<string | null>(null);
  const [checked,    setChecked]    = useState(false);

  useEffect(() => {
    // ── Fast path: use cached result if it's fresh ──────────────────────
    const cached = readCache();
    if (cached) {
      setMinVersion(cached.minVersion);
      setChecked(true);
      // Re-validate in the background so the cache stays warm
      void (async () => {
        try {
          const { data } = await supabase
            .from("app_config")
            .select("min_version")
            .limit(1)
            .maybeSingle();
          if (data?.min_version) {
            writeCache(String(data.min_version));
          }
        } catch {}
      })();
      return;
    }

    // ── Slow path: first visit or expired cache ──────────────────────────
    let cancelled = false;

    /* Hard 4-second cap on the version check so a hung network never leaves
     * the user staring at a blank splash. If the timer wins we fail open. */
    const safetyTimer = setTimeout(() => {
      if (!cancelled) { writeCache(null); setChecked(true); }
    }, 4000);

    (async () => {
      try {
        /* .maybeSingle() returns null (no error) when the row is missing —
         * unlike .single() which throws a 406 when there are 0 rows.       */
        const { data } = await supabase
          .from("app_config")
          .select("min_version")
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        const mv = data?.min_version ? String(data.min_version) : null;
        writeCache(mv);
        if (mv) setMinVersion(mv);
      } catch (err) {
        if (!cancelled) {
          console.warn("[UpdateGate] unexpected error — failing open:", (err as Error).message);
          writeCache(null);
        }
      } finally {
        clearTimeout(safetyTimer);
        if (!cancelled) setChecked(true);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
    };
  }, []);

  /* On the slow path, show a minimal splash rather than blank while the
   * one network check resolves. On the fast path this never renders because
   * checked=true is set synchronously above. */
  if (!checked) {
    return (
      <div
        style={{
          height:         "100dvh",
          background:     "linear-gradient(180deg, #08010f 0%, #14021c 100%)",
        }}
      />
    );
  }

  if (minVersion && isOutdated(APP_VERSION, minVersion)) {
    return <ForceUpdate current={APP_VERSION} required={minVersion} />;
  }

  return <>{children}</>;
}
