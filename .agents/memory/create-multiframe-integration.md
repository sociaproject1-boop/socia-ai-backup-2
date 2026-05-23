---
name: CreateMultiFrame real data integration
description: socia-trailer was a standalone design demo; the real AI Cinematic Studio is CreateMultiFrame.tsx in the Socia app. Key data sources and integration decisions.
---

## Rule
The `socia-trailer` artifact is a DEMO/animation only — hardcoded fake data, no backend. Do NOT treat it as the real studio. The real studio is `artifacts/socia/src/pages/CreateMultiFrame.tsx` at route `/create/multi-frame`.

**Why:** Previous work built socia-trailer as a UI exploration; it was never wired to real data.

## Real data sources in CreateMultiFrame.tsx
- **Credits (balance):** `useBillingStore(s => s.summary)` → `summary?.credits` (number)
- **Estimated cost:** `estCredits(cfg.renderEngine, segmentCount)` local helper → stored in `credits` local var
- **Render jobs:** `submitRenderJob(...)` + `useRenderJob(currentJobId)` via Socket.IO
- **Uploads:** Supabase storage, `useUploader` hook
- **Project save:** `saveProject()` backend + localStorage draft
- **Auth gate:** `isPaid` requires `plan_code === "p30"` or `is_owner`

## TopBar integration decisions (2026-05-23)
- Real available credits shown as `⚡ X,XXX` purple pill → taps to `/billing`
- Estimated cost shown separately as `~N needed` in GenerateBar credit row
- ⚠ Low badge shown when `summary.credits < credits` (balance < estimated cost)
- Desktop-only "AI Cinematic Studio" wordmark + gradient clapperboard icon added to TopBar

## AppShell behavior
`AppShell.tsx` hides TopBar/BottomNav for `/create/[^/]+$` routes — CreateMultiFrame manages its own full-screen chrome.
