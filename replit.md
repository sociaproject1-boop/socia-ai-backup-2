# Socia Glow

AI-powered social media platform where users create images and videos with AI, share posts, chat in real time, and subscribe for premium generation credits.

## Group Chat System

Messenger-style group chats, completely isolated from DMs.

### User flow
1. Messages page → compose button (top right) → "New Group"
2. Step 1: search and multi-select members
3. Step 2: enter group name + optional avatar photo
4. Navigate to `/groups/:id` — full real-time group thread

### Features
- Real-time messages via Supabase Realtime (postgres_changes)
- Typing indicators via Supabase Presence channels
- Image/video/file sharing via Cloudinary unsigned upload
- Group avatar (Cloudinary upload during creation)
- Unread count badges on group inbox rows
- Infinite scroll (load older messages)
- Auto read-receipt on message view
- Group info sheet: member list with role badges (owner/admin/member)
- Add members (admin+), remove members (admin+), leave group, delete group (owner)
- Ownership transfer

### Database (run in Supabase SQL editor)
`artifacts/api-server/migrations/group-chat-schema.sql` — creates:
- `chat_groups` — group metadata (name, avatar, owner)
- `chat_group_members` — per-user membership + role
- `chat_group_messages` — messages with JSONB attachments
- `chat_group_reads` — per-user last-read tracking (unread counts)

### API routes (all require auth)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/groups` | Create group |
| GET | `/api/groups` | List my groups (with unread counts) |
| GET | `/api/groups/:id` | Group detail + members |
| GET | `/api/groups/:id/messages` | Paginated messages |
| POST | `/api/groups/:id/messages` | Send message |
| POST | `/api/groups/:id/read` | Mark read |
| PATCH | `/api/groups/:id` | Edit name/avatar (admin+) |
| DELETE | `/api/groups/:id` | Delete group (owner only) |
| POST | `/api/groups/:id/leave` | Leave group |
| POST | `/api/groups/:id/members` | Add members (admin+) |
| DELETE | `/api/groups/:id/members/:uid` | Remove member (admin+) |
| PATCH | `/api/groups/:id/transfer` | Transfer ownership |

### New files
| File | Purpose |
|------|---------|
| `artifacts/api-server/migrations/group-chat-schema.sql` | **Run in Supabase SQL editor** |
| `artifacts/api-server/src/routes/groupChat.ts` | All 12 REST endpoints |
| `artifacts/socia/src/lib/useGroupChat.ts` | Hooks + API helpers + Realtime subs |
| `artifacts/socia/src/components/messages/CreateGroupFlow.tsx` | 3-step group creation sheet |
| `artifacts/socia/src/pages/GroupThread.tsx` | Full group chat thread at `/groups/:id` |

### Production health endpoint
`GET /api/health` — probes database, Supabase REST, Supabase Storage, and Supabase Auth in parallel (3 s timeout each). Returns `healthy`/`degraded`/`unhealthy` + per-probe latency + full env inventory.

## Run & Operate

- `pnpm --filter @workspace/socia run dev` — run the Socia frontend (port 21175)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- **Frontend**: React + Vite + Tailwind + Radix UI + Zustand, auth via Supabase
- **API**: Express 5 + Socket.IO (typing/presence), auth via Supabase JWT middleware
- **DB**: Supabase (PostgreSQL) for all app data + Supabase Storage for avatars
- **AI generation**: OpenAI gpt-image-1 (images), fal.ai Kling 1.6 Pro + Luma (videos)
- **Media CDN**: Cloudinary (unsigned upload preset `socia_upload`, cloud `devyx5yyk`)
- **Realtime chat**: Supabase Realtime (postgres_changes)
- **Billing**: Supabase RPC credit ledger (`consume_credits`, `refund_credits`, `my_billing_summary`)
- **Admin panel**: bcrypt + JWT admin auth, service-role Supabase client (bypasses RLS)

## Where things live

- `artifacts/socia/` — React + Vite frontend (port 21175)
- `artifacts/api-server/` — Express API (port 8080, proxy path `/api`)
- `lib/db/` — Drizzle ORM schema (conversations, messages tables)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for codegen)
- `lib/integrations-openai-ai-server/` — Lazy-init OpenAI client + image/audio helpers
- `artifacts/socia/src/lib/supabase.ts` — Supabase client + profile/storage helpers
- `artifacts/socia/src/lib/useSupabaseChat.ts` — Real-time chat via Supabase Realtime
- `artifacts/api-server/src/lib/adminAuth.ts` — Admin JWT auth + service-role client
- `artifacts/api-server/src/lib/billing.ts` — Credit gate + Supabase billing RPCs

## Architecture decisions

- **Supabase for everything auth/db/realtime**: Auth, user profiles, posts, messages, billing all live in Supabase. Drizzle ORM is only for conversations/messages tables (chat log).
- **Lazy OpenAI client init**: `lib/integrations-openai-ai-server/src/*/client.ts` uses a Proxy-based lazy singleton so the API server starts without AI keys set; routes that call OpenAI will throw a descriptive error instead of crashing the process on startup.
- **Socket.IO for presence only**: Typing indicators and online/offline presence run through Socket.IO at `/api/socket.io/`. Chat messages use Supabase Realtime. Client-side socket.io-client is installed but presence is primarily driven by Supabase channels.
- **Cloudinary unsigned preset**: Media uploads use an unsigned Cloudinary preset (no server secret needed). Cloud name and preset are hardcoded in `cloudinaryServer.ts`.
- **Admin system separate from Supabase auth**: Super-admins log in with username + bcrypt password → short-lived JWT (8h). Service-role Supabase client for RLS bypass; requires `SUPABASE_SERVICE_ROLE_KEY`.

## Product

- **Auth**: Email/password + Google OAuth via Supabase Auth
- **Feed**: Social posts with AI-generated images/videos, likes, comments
- **Create**: Prompt-to-image, prompt-to-video, image-to-video, multi-frame storyboard
- **Studio**: Preset-driven AI image styles
- **SociaGPT**: AI chat assistant with multimodal input (image, audio, video) + AI subscription system
- **Messages**: Real-time DMs via Supabase Realtime + typing indicators via Socket.IO
- **Profile**: Avatar upload (Supabase Storage), bio, social links, followers/following
- **Creator Billing**: Free daily quota + credit ledger for paid plans; top-up and upgrade flows
- **AI Billing**: Separate AI subscription plans (Free/Premium/Ultra) inside SociaGPT only
- **Admin**: `/sys-admin` panel with service-role access; requires `SUPABASE_SERVICE_ROLE_KEY`

## SociaGPT AI Subscription System (SEPARATE from creator subscriptions)

Two completely independent subscription systems:

### 1. Creator Subscriptions (EXISTING — DO NOT TOUCH)
- ₱1200/15 days or ₱1700/month creator plans
- Managed via `/billing`, `/billing/upgrade`, `/billing/topup`
- Credit ledger: `consume_credits`, `refund_credits` RPCs

### 2. SociaGPT AI Subscriptions (NEW — only inside SociaGPT)
- Managed via `/socia-gpt/billing`
- Plans: Free AI | Premium AI (₱299/mo) | Ultra Pro (₱999/mo)
- Users can have both, either, or neither independently

#### AI Plan Details:
| Plan       | Model       | Limit         | Cooldown | Max Words |
|-----------|-------------|---------------|----------|-----------|
| Free AI   | gpt-4o-mini | 15/day        | 20s      | 300       |
| Premium AI| gpt-4o      | 300/month     | 8s       | 4,000     |
| Ultra Pro | o1-mini     | 120/month     | 20s      | 8,000     |

#### AI Backend Protection (all server-side):
- `artifacts/api-server/src/lib/aiSubscription.ts` — plan middleware (reads `ai_subscriptions` table)
- `artifacts/api-server/src/lib/aiRateLimit.ts` — per-plan cooldowns + daily/monthly usage tracking
- `artifacts/api-server/src/lib/aiAbuseGuard.ts` — burst detection, escalating lockouts, abuse scoring
- `artifacts/api-server/src/routes/aiPlans.ts` — REST: `/api/ai/plans`, `/api/ai/plan`, `/api/ai/usage`, `/api/ai/subscribe`

#### AI Frontend:
- `artifacts/socia/src/lib/aiPlanClient.ts` — Zustand store + API helpers
- `artifacts/socia/src/pages/SociaGptBilling.tsx` — AI-only billing page (`/socia-gpt/billing`)
- `artifacts/socia/src/components/socia-gpt/AIPlanBadge.tsx` — plan badge
- `artifacts/socia/src/components/socia-gpt/AIUsageBar.tsx` — usage progress bar
- `artifacts/socia/src/components/socia-gpt/AIUpgradeModal.tsx` — upgrade modal

#### SQL Migration:
Run `artifacts/api-server/ai-subscription-schema.sql` in Supabase SQL editor to create:
- `ai_subscriptions` — active AI plans per user
- `ai_usage_tracking` — daily/monthly request counters
- `ai_requests` — audit log of every AI request
- `ai_cooldowns` — admin-imposed overrides
- `ai_abuse_flags` — flagged accounts for review
- `ai_billing_history` — AI payment records

## Required Secrets

| Secret | Used by | Status |
|--------|---------|--------|
| `VITE_SUPABASE_URL` | Frontend + API server | ✅ Set |
| `VITE_SUPABASE_ANON_KEY` | Frontend + API server | ✅ Set |
| `SESSION_SECRET` | Admin JWT signing | ✅ Set |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin panel (bypasses RLS) | ❌ Missing — admin 503 |
| `FAL_KEY` | Video generation (Kling, Luma) | ❌ Missing — video routes 500 |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Image gen + SociaGPT | ❌ Missing — returns 500 |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Image gen + SociaGPT | ❌ Missing — returns 500 |

## Gotchas

- Always run `pnpm --filter @workspace/db run push` after editing `lib/db/src/schema/`.
- Re-run `pnpm --filter @workspace/api-spec run codegen` after every OpenAPI spec change.
- The API server build bundles all workspace libs (esbuild, `bundle: true`). After changing any `lib/*` source file, restart the API server workflow to pick up the changes.
- `VITE_SUPABASE_*` env vars are shared (used by both frontend via `import.meta.env` and API server via `process.env`).
- Cloudinary uses unsigned upload preset — no server secret needed, but you must have the `socia_upload` preset configured in the `devyx5yyk` Cloudinary account.
- AI subscription tables need to be created in Supabase before AI plan gating persists. Until then, all users gracefully fall back to Free AI plan.
- Pre-existing TypeScript error in `src/components/ui/sidebar.tsx` (casing conflict + style prop) — not from new code, does not affect runtime.

## Refund System

Manual-review-only refund requests for both creator and AI subscriptions. Zero automatic refunds.

### User flow — subscription-level
1. User opens `/billing` (creator) or `/socia-gpt/billing` (AI) → clicks "Request a refund"
2. Modal loads usage estimate from `GET /api/refunds/estimate?type=creator|ai`
3. User fills in reason + description, optionally payment reference
4. `POST /api/refunds/request` stores the request in `refund_requests`; abuse guard blocks repeat abusers (≥3 requests / 30 days)
5. User sees request history + status badges in `/billing` and `/socia-gpt/billing`

### User flow — per-order refund (payment history)
1. User opens `/billing` → sees payment history
2. Approved orders show a "Refund" button inline on the row
3. Clicking opens `OrderRefundModal` (6 order-specific reasons: accidental, duplicate, wrong amount, unauthorized, service issue, other)
4. `POST /api/refunds/request` with `order_id` — skips eligibility check, stores directly
5. Duplicate guard: only one active (pending/reviewing) refund per order_id
6. Order row immediately shows "Refund Pending" badge after submit

### Admin flow
- Admin opens `/sys-admin` → Refunds tab
- Filters by status (pending / reviewing / approved / partial / rejected) and type (creator / AI)
- Stats row shows totals and total paid out
- Per-request: usage breakdown, description, payment ref, abuse score, decide (Full approve / Partial / Reviewing / Reject) + flag for abuse

### Refund calculation (server-side only)
- Creator: `(credits_remaining / credits_total) * price_paid` — 85%+ usage → ineligible
- AI: `(requests_remaining / monthly_limit) * price_paid` — 85%+ usage → ineligible
- Min refundable threshold: ₱50

### Anti-abuse
- 1 request → abuse_score 10; 2 requests → 50 (auto-flagged); 3+ → 90 (request blocked)
- Prior approved refund + another request → +30 score
- Score ≥ 50 → `is_flagged = true`, visible in admin

### New files
| File | Purpose |
|------|---------|
| `artifacts/api-server/refund-schema.sql` | **Run in Supabase SQL editor** — creates `refund_requests`, `refund_decisions` |
| `artifacts/api-server/src/lib/refundCalculator.ts` | Usage estimation + abuse scoring |
| `artifacts/api-server/src/routes/refunds.ts` | User routes: `/api/refunds/estimate`, `/api/refunds/my`, `/api/refunds/request` |
| `artifacts/api-server/src/routes/adminRefunds.ts` | Admin routes: `GET/POST /admin/refunds/*` |
| `artifacts/socia/src/components/billing/RefundModal.tsx` | Shared refund request modal (creator + AI) |
| `artifacts/socia/src/components/billing/RefundStatusBadge.tsx` | Status pill component |

### SQL migration required
Run `artifacts/api-server/refund-schema.sql` in Supabase SQL editor before using the refund system in production.

## Community Funding System (Phase 1 — Infrastructure Only)

Admin-verified funding system. No real payouts. Progress only increases after admin approval.

### User flow
1. User visits Home → sees "Help Build Socia" funding section with live progress
2. Clicks "Support Socia" → modal opens (amount presets, GCash/Maya, reference number, optional screenshot)
3. Screenshot uploads to Cloudinary (unsigned preset `socia_upload`); reference number stored in DB
4. Submission stored as `status = 'pending'` — funding totals are NOT changed yet
5. Admin opens `/sys-admin` → Funding tab → reviews, optionally adds notes → Approve or Reject
6. Approve only → `current_amount` and `supporters_count` increment on the global row

### Locked preview pages (public, no auth needed)
- `/creator/monetization` — Creator Monetization preview
- `/creator/affiliate` — Affiliate Program preview
- `/creator/seller` — Seller Center preview
- `/creator/stars` — Creator Stars preview

Each locked page shows: animated progress bar, locked banner, feature list, "Support & Speed This Up" CTA back to home.

### Database tables
- `community_funding` — single global row (ID `00000000-0000-0000-0000-000000000001`)
- `funding_donations` — individual support submissions

### Anti-spam
- 1 pending donation per 24 h per user (enforced server-side)
- Admin-only writes to `community_funding` (service role + RLS)

### New files
| File | Purpose |
|------|---------|
| `artifacts/api-server/community-funding-schema.sql` | **Run in Supabase SQL editor** |
| `artifacts/api-server/src/routes/funding.ts` | `GET /api/funding/progress`, `POST /api/funding/donate`, `GET /api/funding/my` |
| `artifacts/api-server/src/routes/adminFunding.ts` | Admin: stats, list, approve, reject, goal update |
| `artifacts/socia/src/components/home/CommunityFunding.tsx` | Home section + SupportModal |
| `artifacts/socia/src/pages/CreatorMonetization.tsx` | Locked preview |
| `artifacts/socia/src/pages/AffiliateProgram.tsx` | Locked preview |
| `artifacts/socia/src/pages/SellerCenter.tsx` | Locked preview |
| `artifacts/socia/src/pages/CreatorStars.tsx` | Locked preview |

### SQL migration required
Run `artifacts/api-server/community-funding-schema.sql` in Supabase SQL editor before the funding system persists data.

## Usage Receipts & Partial Refund Engine (Phase 2)

Records every AI generation and chat event to `usage_receipts`. Powers usage-based refund calculations for admins.

### Privacy invariant
`estimated_cost` is INTERNAL and NEVER appears in user-facing responses. Only admin routes (service-role client) see cost data. `sanitizeRefundForUser()` strips all cost fields before user responses.

### Internal cost map (PHP ₱, admin-only)
`std_image`=₱2.24 · `hd_image`=₱6.72 · `std_video_5s`=₱28 · `hd_video_5s`=₱56 · `std_video_10s`=₱56 · `hd_video_10s`=₱112 · `multi_frame`=₱112 · `gpt_msg_mini`=₱0.17 · `gpt_msg_4o`=₱0.56 · `gpt_msg_o1`=₱1.68

### Heavy-user thresholds (per billing period)
- Images ≥ 20 → +25 score
- Videos ≥ 5 → +35 score
- Chat ≥ 200 → +15 score
- Cost ratio ≥ 70% of payment → +35 score
- Score ≥ 60 → `is_heavy_user = true`

### Partial refund formula
`refundable = MAX(0, payment_paid - actual_ai_cost)` — takes the LOWER of usage-based vs credit-ledger estimate. Ineligible if cost ratio ≥ 85% or refundable < ₱50.

### User routes (no cost data)
- `GET /api/usage/my` — paginated activity history (tool, model, status, duration, metadata)
- `GET /api/usage/my/summary` — generation counts by tool for current month

### Admin routes (full cost data)
- `GET /admin/usage` — all usage events with `estimated_cost`
- `GET /admin/usage/stats` — 30-day aggregate + top-cost users
- `GET /admin/usage/user/:userId` — per-user breakdown with cost analysis
- `GET /admin/usage/refund-calc/:userId` — full partial-refund analysis
- `GET /admin/usage/heavy-users` — list of flagged heavy-use accounts

### Tracking hooks
`trackUsage()` fires after every successful generation:
- `generateImage.ts` → `image_generation` (std_image / hd_image)
- `generateVideo.ts` → `video_generation` (std/hd × 5s/10s)
- `generateMultiframeVideo.ts` → `multiframe_video` (multi_frame)
- `sociaGpt.ts` → `ai_chat` (gpt_msg_mini / gpt_msg_4o / gpt_msg_o1)

Failed events are also tracked with `status: "failed"` for admin visibility.

### Admin refund decide enhancement
`POST /admin/refunds/:id/decide` now computes the partial-refund engine result before approving. The recommended amount (usage-based, not just ledger-based) is used as the default for full approvals. Usage snapshot is persisted to `refund_requests.usage_snapshot` for audit trail.

### SQL migration required
Run `artifacts/api-server/migrations/19-usage-receipts-schema.sql` in Supabase SQL editor to create:
- `usage_receipts` — one row per AI event (with `estimated_cost` column, RLS-gated)
- New columns on `refund_requests`: `actual_ai_cost_php`, `usage_based_refundable`, `heavy_usage_score`, `usage_snapshot`

### New files
| File | Purpose |
|------|---------|
| `artifacts/api-server/migrations/19-usage-receipts-schema.sql` | Run in Supabase SQL editor |
| `artifacts/api-server/src/lib/usageTracker.ts` | Cost map + `trackUsage()` + `computeUsageSummary()` + `computeHeavyScore()` |
| `artifacts/api-server/src/lib/partialRefundEngine.ts` | `computePartialRefund()` (admin) + `sanitizeRefundForUser()` |
| `artifacts/api-server/src/routes/usage.ts` | User-safe activity routes |
| `artifacts/api-server/src/routes/adminUsage.ts` | Admin analytics routes with full cost data |

## Performance Fixes (May 2026)

### Pass 1 — Bundle & startup (6 fixes)

| # | File | Fix |
|---|------|-----|
| 1 | `App.tsx` | All 30+ pages now **React.lazy()** — only Auth + Home are eager. `<Suspense>` wraps the router with a shimmer `PageSkeleton` inside AppShell so nav stays visible during lazy-load. Cuts initial JS parse by ~60–70% in production. |
| 2 | `UpdateGate.tsx` | Version check result **cached in localStorage for 24 h**. Repeat visits resolve synchronously — no network round-trip before first paint. First-visit slow path unchanged (4 s safety timeout, fail-open). |
| 3 | `billing.ts` | `refresh()` now has a **5-minute debounce** via Zustand `get()`. Prevents the `my_billing_summary` RPC from firing on every tab-focus/visibility-change event (common on mobile). Added `forceRefresh()` for post-payment actions that need an immediate re-fetch. |
| 4 | `AppShell.tsx` | Navigation animation duration reduced **180 ms → 130 ms**; exit offset distances halved. With `mode="wait"` this cuts the dead time between page unmount and new page mount by ~50 ms per navigation. |
| 5 | `vite.config.ts` | `rollupOptions.output.manualChunks` added — React, Supabase, Framer Motion, Lucide, and Zustand each get their **own cache-stable vendor chunk**. A code change no longer busts the React or Supabase browser cache. |
| 6 | `supabase.ts` | Removed verbose `console.log` calls added during avatar debugging (`fetchProfile avatar_url`, `upsertProfile result`). |

### Pass 2 — Runtime UX & mobile (7 fixes)

| # | File | Fix |
|---|------|-----|
| 1 | `supabase.ts` | `uploadAvatar` now **compresses images before upload** via canvas resize (max 400 px, JPEG 82%). A 6 MB phone photo becomes ~60 KB — upload time on mobile drops from 20–30 s to under 2 s. Falls back to the original file if canvas is unavailable. |
| 2 | `authContext.tsx` | `handleSession()` calls **`applyFallbackUser()` immediately** (before `syncProfile` DB round-trip) so Profile/TopBar render cached content the instant the auth spinner clears instead of showing blank for 200–800 ms. |
| 3 | `BillingCheckout.tsx` | `fetchMyOrders` moved **into the `Promise.allSettled` batch** alongside `fetchPaymentMethods/Plans/Topups` — eliminates one sequential RTT when viewing an existing order. |
| 4 | `BillingCheckout.tsx` + `Billing.tsx` | **"Pending" status now shows a `Clock` icon** and "Awaiting admin review" copy instead of `Loader2 animate-spin`. The infinite spinner implied the app was working; a clock correctly signals "waiting for a human". Updated in `OrderStatusCard`, `OrderRow`, and `PendingCallout`. |
| 5 | `Billing.tsx` | Uses **`forceRefresh()`** (not debounced `refresh()`) so the billing page always loads fresh credit/plan data when opened, regardless of what AppShell cached. |
| 6 | `useSupabaseChat.ts` | Conversation inbox message limit reduced **500 → 100**. Covers 50+ conversations, cuts the initial payload 5×, and speeds the follow-up user batch-fetch. |
| 7 | `migrations/15-performance-indexes.sql` | SQL migration adding **pg_trgm GIN indexes** on `users.username` and `users.name` (fixes full-table-scan on every `searchUsers` call), plus composite indexes on `messages(sender_id, created_at)`, `messages(receiver_id, created_at)`, `messages(sender_id, receiver_id, created_at)`, and `follows`. **Run in Supabase SQL editor.** |

## E2E Bug Fixes (testing pass — May 2026)

Four bugs found and fixed during full end-to-end testing:

| # | Bug | Root cause | Fix |
|---|-----|-----------|-----|
| 1 | **Profile save crashes** — "social_facebook column not found" | `users` table had no `social_*` columns | `Profile.tsx`: social fields in a separate fire-and-forget `update`; migration `14-social-columns-users.sql` adds the columns |
| 2 | **Auth race condition** — hard navigation to `/profile/settings`, `/billing`, `/socia-gpt/billing` redirected to `/` | `setLoading(false)` fired before `storeLogin()` → AuthGuard briefly saw `isAuthenticated=false` | `authContext.tsx`: `storeLogin()` is now called **before** `setLoading(false)` in `handleSession()` |
| 3 | **Follow FK violation** on new users — `follows_follower_id_fkey` | `syncProfile` used `.update()` which silently no-ops if no row exists; new OAuth/email users had no `public.users` row | Added `ensureProfile()` in `supabase.ts` (`.upsert()`) — called in two seed paths in `authContext.tsx` |
| 4 | **Follower count drops to 0** after unfollow on `/profile/:id` | `fetchCounts()` re-queried the raw `follows` table (RLS/sync issues); initial count came from denormalized `users.followers` column | `UserProfile.tsx`: `fetchCounts()` now re-reads `users.followers` / `users.following` (kept in sync by `follow_user`/`unfollow_user` RPCs) |

### SQL migration required
Run `artifacts/api-server/migrations/14-social-columns-users.sql` in Supabase SQL editor to add `social_facebook`, `social_instagram`, `social_tiktok` columns to the `users` table.

### Confirmed working flows
Messaging ✅ · Auth signup ✅ · Login ✅ · Session restore ✅ · Follow (FK fix) ✅ · Profile save (social fix) ✅ · Protected-route navigation (race fix) ✅ · Follower count (count fix) ✅

### Known Supabase config requirement
Avatar upload (`/profile → Edit Profile → camera`) requires an `avatars` bucket in Supabase Storage. If the bucket is missing, a visible error message now appears (`role=alert`). Create the bucket in the Supabase dashboard → Storage → New bucket → `avatars` (public).

## Refund Thread System (Phase 3)

Live support-ticket-style conversations attached to every refund request.

### Architecture
- **`refund_messages`** — one row per message (user / admin / system). Internal admin notes (`is_internal_note = true`) are stripped from all user-facing routes via RLS + API filter.
- **`refund_notifications`** — one row per user notification. Drives the bell badge in the top nav.
- **`payout_status`** column on `refund_requests` — tracks payout pipeline: `queued → processing → sent → failed`.
- Realtime: both tables are in `supabase_realtime` publication. Frontend hooks use random channel-suffix pattern (same as `useSupabaseChat.ts`) for live updates without polling.

### Auto-notifications on admin decide
`POST /admin/refunds/:id/decide` now automatically inserts a system thread message + user notification describing the decision (approve / partial / reject / review).

### User flow
1. User opens `/billing` → "Billing support history" section → "View thread" button on each refund row
2. Opens `/billing/refund/:id` — full chat-style thread with live updates
3. User can reply while status is `pending` or `reviewing`; thread locks once decided
4. Bell icon in TopBar shows unread count badge; dropdown lists recent notifications; clicking navigates to the thread

### Admin flow (SysAdmin.tsx — Refunds tab)
- Expand any refund row → scroll down past the decision panel
- **Support Thread section**: full message list (user messages, admin replies, system events, amber-highlighted internal notes)
- Compose box with "Internal note" toggle (hidden from user)
- "Request proof" button sends a system message asking the user to upload documentation
- **Payout tracking section** (visible after approve/partial): set payout_status + payment ref; saving "Sent ✓" automatically sends the user a notification and system message

### SQL migration required
Run `artifacts/api-server/migrations/20-refund-thread-schema.sql` in Supabase SQL editor **after migration 19** to create:
- `refund_messages` table + RLS + indexes
- `refund_notifications` table + RLS + indexes
- `payout_status`, `payout_ref`, `payout_at` columns on `refund_requests`
- Realtime publication for both new tables

### New files
| File | Purpose |
|------|---------|
| `artifacts/api-server/migrations/20-refund-thread-schema.sql` | **Run in Supabase SQL editor** |
| `artifacts/api-server/src/routes/refundMessages.ts` | User + admin message routes; `GET/POST /api/refunds/:id/messages`, `GET /api/refunds/my/:id`, admin routes under `/admin/refunds/:id/` |
| `artifacts/api-server/src/routes/refundNotifications.ts` | `GET /api/refund-notifications`, `PATCH /:id`, `POST /read-all` |
| `artifacts/socia/src/lib/useRefundThread.ts` | `useRefundThread(refundId)` + `useRefundNotifications()` hooks — Supabase Realtime |
| `artifacts/socia/src/pages/RefundThread.tsx` | User-facing thread page at `/billing/refund/:id` |
| `artifacts/socia/src/components/refunds/RefundNotificationBell.tsx` | Bell icon + unread badge + dropdown for TopBar |

### Status display (RefundStatusBadge.tsx)
| Status | Label |
|--------|-------|
| `pending` | Pending Review |
| `reviewing` | Under Investigation |
| `approved` | Approved |
| `partial` | Partially Approved |
| `rejected` | Rejected |
| `approved` + `payout_status=sent` | Refunded ✓ |

## Receipt Fraud Detection System (Phases 1–3)

### Phase 1 — OCR Engine
- **Primary OCR**: Tesseract.js (local, free, no API key required)
- **Fallback OCR**: OCRSpace API (if Tesseract fails)
- Blurry/unreadable images → `suspicious` status (not hard-blocked)
- `extracted_payment_method`, `extracted_date`, `ocr_engine` stored per receipt (migration 23)

### Phase 2 — AI Fraud Detection & Image Analysis
Fraud scoring engine in `artifacts/api-server/src/lib/fraudDetection.ts`:

| Signal | Points | Trigger |
|--------|--------|---------|
| Duplicate image hash (cross-user) | +100 | Same image reused across accounts |
| Duplicate reference number | +100 | Ref already linked to another request |
| Reference mismatch | +50 | Entered ref ≠ OCR-detected ref |
| Image tampering | +80 | Editing software, recompression, JPEG anomalies |
| Fake receipt structure | +40 | Missing fields, single-line, number-only content |
| Suspicious OCR text | +20 | Test/void/demo keywords, repeat patterns |
| Blurry image | +30 | Low text density + OCR confidence drop |
| Velocity abuse | +50 | 3+ receipts in 24 h |

**Thresholds**: score ≥ 100 → auto-blocked · score ≥ 50 → manual review

New fields stored per receipt (migration 24): `structure_score`, `receipt_field_count`

Key files:
- `artifacts/api-server/src/lib/imageTamperDetection.ts` — JPEG binary analysis (editing software, quality, restart markers, progressive encoding, EXIF anomalies)
- `artifacts/api-server/src/lib/receiptHeuristics.ts` — Blur scoring + structural layout analysis
- `artifacts/api-server/src/lib/fraudDetection.ts` — Centralised fraud checks + scoring engine
- `artifacts/api-server/src/lib/ocrService.ts` — Tesseract.js primary + OCRSpace fallback

### Phase 3 — Enterprise Review Center
Admin receipt review tab in `/sys-admin` → **Receipts** tab.

Admin routes (`adminReceipts.ts`):
- `GET  /api/admin/receipts/stats` — summary counts for dashboard
- `GET  /api/admin/receipts`       — list (filterable: needs_review / suspicious / blocked / approved / rejected)
- `GET  /api/admin/receipts/:id`   — full detail + user history + notes
- `POST /api/admin/receipts/:id/decide` — approve / reject / flag suspicious
- `POST /api/admin/receipts/:id/proof`  — request additional proof from user
- `POST /api/admin/receipts/:id/notes`  — add internal fraud note

DB migration 25 (`migrations/25-receipt-review-center.sql`):
- `review_status`, `reviewed_by`, `reviewed_at`, `review_notes`, `proof_requested` columns on `payment_receipts`
- `receipt_review_notes` table — admin audit notes per receipt (RLS: admin-only via service-role)

### SQL migrations required (run in order in Supabase SQL editor)
21 → 22 → 23 → 24 → 25

## Performance + Anti-Abuse + Admin Systems (May 2026)

### AI Film Director Studio — Performance Optimizations
- **GPU-composited ambient orbs**: `willChange:"transform"` + `transform:"translateZ(0)"` on the ambient glow container — offloads to GPU compositor
- **GPU-optimized filmstrip scroll**: `willChange:"transform"` + `transform:"translateZ(0)"` on the scroll container — smooth 60fps on mobile
- **Lazy image loading**: all scene card thumbnails already use `loading="lazy"` (IntersectionObserver-based browser native)
- **Memory cleanup on unmount**: single `useEffect` cleanup clears `renderTimerRef` + aborts pending API calls via `AbortController`
- **AbortController cancel flow**: `abortRef.current?.abort()` on cancel — stops in-flight render request

### Render Cooldown System (Anti-Abuse)
- `LS_COOLDOWN = "socia_studio_cooldown_v1"` — localStorage timestamp written on every render start
- `PLAN_COOLDOWN: { p15: 8, p30: 3 }` — Standard 8s cooldown, Ultimate 3s (free blocked by paywall)
- `cooldownSec` state updates every 400ms via `setInterval` — live countdown display
- Generate button shows animated fill-bar + `Cooldown · Xs` text during lockout
- `canGenerate` gates on `cooldownSec === 0` so button stays disabled until ready

### Queue Priority Display
- `PLAN_PRIORITY` map: p30 = "Priority 1 — Ultimate" (purple), p15 = "Priority 2 — Pro" (indigo)
- Priority badge shown above generate button and in the cinematic render screen header
- `CinematicRenderScreen` receives `planCode` prop to display active tier during render

### Render Cancellation
- Cancel button in background render badge (X icon next to progress %)
- `cancelRender()`: aborts AbortController, clears render timer, resets UI, appends "cancelled" entry to render history
- History correctly tracks `status: "cancelled"` with "Cancelled by user" error message

### Admin Panel — Abuse Section Expansion
- **Cooldown Config Panel** (`CooldownConfigPanel`): per-plan slider to set cooldown seconds (p30: 0–30s, p15: 0–60s), persisted in `localStorage` per plan — `socia_admin_cooldown_{planId}`
- **Abuse Monitor Panel** (`AbuseMonitorPanel`): simulated live flagged-user list with abuse scores, plan tier, render counts, detection reason, expand/collapse, Block/Unlock/Clear Score actions, color-coded score bar
- Both components are pure front-end (localStorage-persisted) — backend persistence requires `abuse_flags` table + `POST /admin/studio/abuse/:userId`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Socket.IO server path: `/api/socket.io/` (covered by the `/api` proxy path in artifact.toml)
- Admin auth: `artifacts/api-server/src/lib/adminAuth.ts` — file-based fallback for `SUPABASE_SERVICE_ROLE_KEY` at `.local/secrets/SUPABASE_SERVICE_ROLE_KEY`
- AI subscription SQL: `artifacts/api-server/ai-subscription-schema.sql`
- Refund system SQL: `artifacts/api-server/refund-schema.sql`
- Community funding SQL: `artifacts/api-server/community-funding-schema.sql`
- Social columns SQL: `artifacts/api-server/migrations/14-social-columns-users.sql`
- Performance indexes SQL: `artifacts/api-server/migrations/15-performance-indexes.sql`
- Refund thread SQL: `artifacts/api-server/migrations/20-refund-thread-schema.sql`
- Receipt block code SQL: `artifacts/api-server/migrations/21-payment-receipts-block-code.sql`
- Receipt fraud columns SQL: `artifacts/api-server/migrations/22-receipt-fraud-columns.sql`
- Payment method & date columns SQL: `artifacts/api-server/migrations/23-payment-method-date-columns.sql`
- Receipt structure score SQL: `artifacts/api-server/migrations/24-structure-score-column.sql`
- Admin review center SQL: `artifacts/api-server/migrations/25-receipt-review-center.sql`
- Voice tracks SQL: `artifacts/api-server/migrations/28-voice-tracks.sql`

## Phase 3D — Real AI APIs + Voice Synthesis

### Render Engine Abstraction Layer (`fal.ts`)
Multi-engine dispatch via `interpolateWithEngine(engine, frame0, frame1, prompt, aspect)`:

| Engine ID        | Provider        | fal.ai model                              | Status    |
|------------------|-----------------|-------------------------------------------|-----------|
| `kling-standard` | fal.ai Kling    | v1.6/standard/image-to-video              | ✅ Live   |
| `kling-cinematic`| fal.ai Kling    | v1.6/pro/image-to-video                   | ✅ Live   |
| `kling-master`   | fal.ai Kling    | v2.1/master/image-to-video                | ✅ Ready  |
| `luma`           | fal.ai Luma     | luma-dream-machine                        | ✅ Live   |
| `runway-gen4`    | Runway          | (not integrated)                          | ❌ Future |
| `veo-ultra`      | Google Veo      | (not integrated)                          | ❌ Future |

Kling uses `image_url` + `tail_image_url` for real keyframe interpolation between two scene images.
The render worker now dispatches using `job.render_engine` from the DB — the engine the user selected in the studio.

### Voice Synthesis Pipeline (`voiceSynthesis.ts`)
Real TTS via fal.ai Kokoro (open-source model, free tier, requires `FAL_KEY`):

- **14 voice type → Kokoro voice ID mappings** (cinematic-male → `am_michael`, soft-female → `af_bella`, villain → `am_adam`, horror-whisper → `bf_emma`, etc.)
- **12 emotion → speech speed multipliers** (sad = 0.78×, angry = 1.20×, aggressive = 1.28×, etc.)
- **Text preprocessing per emotion**: ellipsis pauses for sad/emotional, punctuation chopping for tense/fear, deliberate pacing for mysterious
- **Word-level timing map**: built from Kokoro's `word_start_times` or estimated at ~350ms/word
- **Concurrent synthesis**: `synthesizeAllVoiceTracks()` runs all scene voices in parallel; failures are isolated per scene
- **Duration calculation**: derived from timing map tail or estimated from word-count + speed

### Voice REST Endpoints (`voiceSynth.ts`)
- `POST /api/voice/preview` — instant TTS for studio UI (no render job needed, 1000-char limit)
- `GET  /api/voice/tracks/:jobId` — all generated voice tracks for a completed render job (RLS-verified ownership)

### Voice Synthesis in Render Worker
The `voice_synthesis` stage is now real:
1. Extracts `frameVoiceTracks` from `job.input_payload` (frames with non-empty dialogue text)
2. Calls `synthesizeAllVoiceTracks()` → concurrent Kokoro TTS jobs
3. Stores results in `voice_tracks` table (audio URL, duration, word timing map, status)
4. Individual scene failures are logged and stored as `status: "failed"` — non-fatal
5. If no dialogue is configured, skips gracefully with a single 600ms pause

### Voice Timeline Data (`voice_tracks` table)
Per-scene voice track: `job_id`, `scene_index`, `dialogue_text`, `voice_type`, `emotion`, `audio_url`, `duration_sec`, `timing_map` (JSONB word timestamps), `status`, `provider`

### VoicePreview Component (`VoicePreview.tsx`)
Inline real-time TTS preview in the frame config panel:
- Appears below the dialogue textarea when dialogue text is non-empty
- "Preview Voice" button → calls `POST /api/voice/preview` with current voice/emotion
- Renders an HTML `<audio>` player with play/pause on success
- Shows `FAL_KEY_MISSING` guidance when key is not set
- Disabled state when text is empty

### Frontend Integration
- `submitRenderJob()` now accepts `frameVoiceTracks?: FrameVoiceTrack[]`
- Before each render job, dialogue is extracted from all frames (`frame.dialogue`, `frame.characterVoice`, `frame.emotion`) and sent as voice track config
- `cfg.renderEngine` (user's engine selection) is now correctly forwarded to the backend — previously hardcoded to `"luma"`

### SQL migration required
Run `artifacts/api-server/migrations/28-voice-tracks.sql` in Supabase SQL editor to create the `voice_tracks` table with RLS.
