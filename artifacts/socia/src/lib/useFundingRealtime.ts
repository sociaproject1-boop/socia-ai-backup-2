/**
 * useFundingRealtime — live funding progress + supporter feed for the
 * Community Funding home section.
 *
 * Sources of truth (freshest first):
 *   1. Supabase Realtime — subscribes to community_funding UPDATE events
 *      (migration 39 adds the table to the publication). Fires within
 *      ~100 ms of a confirmed PayMongo payment.
 *   2. 30 s polling fallback — starts automatically when the realtime
 *      channel fails to subscribe or is dropped (network loss, idle tab).
 *      Stops the moment the channel reconnects.
 *
 * Channel rules (matches useSupabaseChat.ts / useRefundThread.ts):
 *   • ALL .on() handlers chained BEFORE .subscribe().
 *   • Channel name uses Math.random() — guaranteed uniqueness across
 *     hot-module reloads and fast mount/unmount cycles.
 *     (Date.now() repeats in the same millisecond and causes Supabase to
 *     return a cached already-subscribed channel → "cannot add
 *     postgres_changes after subscribe()").
 *   • Cleanup calls supabase.removeChannel() — fully destroys the channel.
 *   • refresh callback is stable (useCallback with no deps) — safe to pass
 *     as onReturn to the SupportModal without causing re-subscribe loops.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

/* ── Types ──────────────────────────────────────────────────────────── */
export interface FundingProgress {
  target_amount:    number;
  current_amount:   number;
  supporters_count: number;
  is_goal_reached:  boolean;
  unlock_phase:     number;
}

export interface RecentSupporter {
  id:       string;
  amount:   number;
  paid_at:  string;
  username: string;
}

/* ── Constants ──────────────────────────────────────────────────────── */
const BASE             = `${import.meta.env.BASE_URL}api`.replace(/\/{2,}/g, "/");
const FALLBACK_POLL_MS = 30_000;
const MAX_SUPPORTERS   = 20;

/* ── Data loaders (module-level, no React deps) ─────────────────────── */
async function loadProgress(): Promise<FundingProgress | null> {
  try {
    const r = await fetch(`${BASE}/funding/progress`, { cache: "no-store" });
    if (!r.ok) return null;
    const d = await r.json() as { funding?: FundingProgress };
    return d.funding ?? null;
  } catch { return null; }
}

async function loadSupporters(): Promise<RecentSupporter[]> {
  try {
    const r = await fetch(`${BASE}/funding/recent-supporters`, { cache: "no-store" });
    if (!r.ok) return [];
    const d = await r.json() as { supporters?: RecentSupporter[] };
    return (d.supporters ?? []).slice(0, MAX_SUPPORTERS);
  } catch { return []; }
}

/* ── Hook ───────────────────────────────────────────────────────────── */
export function useFundingRealtime() {
  const [progress,   setProgress]   = useState<FundingProgress | null>(null);
  const [supporters, setSupporters] = useState<RecentSupporter[]>([]);
  const [loading,    setLoading]    = useState(true);
  // Incremented each time a new payment is confirmed — triggers glow animation
  // in the component without needing to pass the amount delta through props.
  const [glowPulse,  setGlowPulse]  = useState(0);

  const prevAmountRef = useRef<number | null>(null);
  const pollRef       = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Refresh both data sources ──────────────────────────────────────
  // Stable reference: no deps → safe to pass to SupportModal as onReturn.
  const refresh = useCallback(async () => {
    const [p, s] = await Promise.all([loadProgress(), loadSupporters()]);
    if (p !== null) {
      if (prevAmountRef.current !== null && p.current_amount > prevAmountRef.current) {
        setGlowPulse((n) => n + 1);
      }
      prevAmountRef.current = p.current_amount;
      setProgress(p);
    }
    setSupporters(s);
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Initial load ───────────────────────────────────────────────────
  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime + 30 s polling fallback ──────────────────────────────
  useEffect(() => {
    function startPoll() {
      if (pollRef.current) return;
      pollRef.current = setInterval(() => void refresh(), FALLBACK_POLL_MS);
    }
    function stopPoll() {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }

    const ch = supabase
      .channel(`funding-live-${Math.random().toString(36).slice(2, 9)}`)
      .on(
        "postgres_changes" as const,
        { event: "UPDATE", schema: "public", table: "community_funding" },
        (payload) => {
          const row = payload.new as Partial<FundingProgress>;
          if (!row) return;

          setProgress((prev) => {
            const next: FundingProgress = {
              target_amount:    row.target_amount    ?? prev?.target_amount    ?? 50000,
              current_amount:   row.current_amount   ?? prev?.current_amount   ?? 0,
              supporters_count: row.supporters_count ?? prev?.supporters_count ?? 0,
              is_goal_reached:  row.is_goal_reached  ?? prev?.is_goal_reached  ?? false,
              unlock_phase:     row.unlock_phase     ?? prev?.unlock_phase     ?? 1,
            };

            // Trigger glow + supporters refresh only when amount increases.
            // setTimeout(0) escapes the state-updater context so we can call
            // additional setters without batching issues.
            const prevAmt = prevAmountRef.current ?? 0;
            if (next.current_amount > prevAmt) {
              prevAmountRef.current = next.current_amount;
              setTimeout(() => {
                setGlowPulse((n) => n + 1);
                void loadSupporters().then(setSupporters);
              }, 0);
            }
            return next;
          });
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          stopPoll();
        } else {
          // TIMED_OUT | CLOSED | CHANNEL_ERROR → fall back to polling
          startPoll();
        }
      });

    return () => {
      stopPoll();
      void supabase.removeChannel(ch);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { progress, supporters, loading, glowPulse, refresh };
}
