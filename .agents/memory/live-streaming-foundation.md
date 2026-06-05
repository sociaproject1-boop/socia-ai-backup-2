---
name: Live Streaming Foundation
description: Architecture decisions for Phase 13 live streaming — migration 48, streams router, React pages, and JWT/Realtime patterns.
---

## Key decisions

**JWT access**: Never use `useAppStore((s) => s.session?.access_token)` — the store has no `session` key.  
Use `supabase.auth.getSession()` inside async functions (postsClient.ts pattern) or `useState("")` + `useEffect(() => { getJwt().then(setJwt) }, [])` for page-level state.

**Supabase Realtime channel typing**: The chained pattern `const channel = supabase.channel("x").on("postgres_changes" as Parameters<typeof channel.on>[0], ...)` causes a circular reference TS error (channel implicit any).  
Fix: `import type { RealtimeChannel } from "@supabase/supabase-js"; const channel: RealtimeChannel = supabase.channel("x"); channel.on("postgres_changes" as Parameters<RealtimeChannel["on"]>[0], ...)`.

**useRef with interval/timeout**: `useRef<ReturnType<typeof setInterval>>()` fails TS (Expected 1 arg, got 0). Use `useRef<ReturnType<typeof setInterval> | null>(null)` and guard: `if (ref.current) clearInterval(ref.current)`.

**Video delivery (Phase 1)**: No real media server. Stream sessions, comments, reactions, viewers are fully functional via Supabase Realtime. Visual placeholder = creator avatar + gradient bg + pulse animation. Stream key is generated and ready for CDN (Mux/Agora) in Phase 2.

**Full-screen pages**: GoLive and LiveStream use `position: fixed; inset: 0; zIndex: 60` — NOT wrapped in AppShell. They must be registered as `Route` entries in App.tsx at `/go-live` and `/live/:id`.

**Go Live entry point**: Small red "Live" pill button in Home.tsx sticky header (right of the tab strip), plus the LiveNowSection strip appears above trending prompts when streams are active.

**DB**: Migration 48 — stream_sessions, stream_comments, stream_reactions, stream_viewers. Supabase Realtime enabled on all 4 tables via `ALTER PUBLICATION supabase_realtime ADD TABLE ...` inside a DO $$ block to silently catch errors.

**Why:**
- Consistent JWT pattern across all API-calling pages
- Realtime channel typing avoids runtime confusion and type errors  
- Phase 1 video placeholder allows full infrastructure to be tested before CDN costs
