---
name: Admin gate hydration race
description: Client-side admin gating in socia needs a tri-state (hydrated/admin/non-admin) or it locks real admins out on refresh.
---

Any client-only gate built on `useAdminStore` (lib/adminAuth.ts) must wait for hydration before deciding lock vs allow. The store starts `profile: null, hydrated: false`; `adminFetchSession()` only runs inside admin-area pages. On normal app routes a refreshing admin starts with `profile === null` — naive `isAdmin = !!profile` flips them to "non-admin" and the gate locks / redirects them.

**Why:** discovered by architect review while gating /create/multi-frame and /studio. Without the hydrated flag the redirect-on-non-admin in ComingSoonGuard would bounce real admins to /create before the bootstrap fetch finishes.

**How to apply:**
- App.tsx mounts `<AdminSessionBootstrap />` that calls `adminFetchSession()` when `hasAdminToken()` then flips `setHydrated(true)`. Keep it there — removing it re-introduces the race.
- Gating components should use `useAdminState()` (returns `{hydrated, isAdmin}`), render `null` until hydrated, and only redirect/lock after `hydrated && !isAdmin`.
- Toaster must be mounted once at App root (`<Toaster />` under GlobalLoaderProvider). Calls to `useToast()` are silent without it — easy to miss because there's no console error.
