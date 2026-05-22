---
name: Community Support Phase 3
description: Architecture decisions for Realtime Funding UI + Premium UX on CommunityFunding home card.
---

## Hook: useFundingRealtime
Lives at `artifacts/socia/src/lib/useFundingRealtime.ts`. Single hook exports:
- `progress`, `supporters`, `loading`, `glowPulse`, `refresh`
- Subscribes to `community_funding` UPDATE events (Supabase Realtime, migration 39).
- Falls back to 30 s polling when channel status ≠ "SUBSCRIBED".
- `refresh` is stable (useCallback with no deps) — safe to pass as `onReturn` to SupportModal.

## Realtime publication
Migration 39 adds `community_funding` to `supabase_realtime`. `community_support` is intentionally excluded (RLS user-owned rows). All payment totals flow through the singleton `community_funding` row.

## RAF counter: useCountUpRef
`useCountUpRef(to, duration, format)` — writes directly to DOM via `elemRef.current.textContent`. The span in JSX has **no children** so React never reconciles its text. Zero React re-renders during animation.

**Why:** State-based counters (setDisplay in rAF) trigger the whole CommunityFunding subtree on every frame — WHY_CARDS grid + supporters feed + preview pills. DOM-direct writes completely skip React's reconciler during the 700 ms animation.

**How to apply:** Always pass module-level const formatters (`fmtPhp`, `fmtNum`). If formatter is inline it will re-fire the effect on every render. Render the span with NO children: `<span ref={raisedRef} aria-live="polite" />`.

## Glow pulse
`glowPulse` increments each time `current_amount` increases. The progress card renders a `motion.span` keyed on `glowPulse` with an `opacity: 1 → 0` transition (GPU-composited). Progress bar is also re-keyed on `glowPulse` so it re-animates from 0 on each new payment.

## Loading skeletons
`StatSkeleton` and `SupporterSkeleton` use `animate-pulse` (Tailwind CSS animation). Shown while `loading=true`. The supporter feed section renders while loading too (to prevent layout shift when data arrives).

## Mobile perf rules kept
- Only one blur layer (the modal backdrop).
- All animations use opacity/transform only.
- No `layout` prop on supporter list items (avoids layout calculations on mobile).
- No scroll jumps: body scroll lock with position:fixed already handles modal open/close.

## Supporter feed
- Max 20 entries (API now returns 20, `useFundingRealtime` slices to 20).
- AnimatePresence with `initial={false}` — no entrance animation on first render, only on live insertions.
- New supporters animate in with `opacity: 0, x: -10 → opacity: 1, x: 0`.
