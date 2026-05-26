/**
 * useIsAdmin — single source of truth for "is the currently-signed-in
 * super-admin a real admin?" Used to gate Create-page modules whose
 * backend models / API keys aren't production-ready yet.
 *
 * Admin auth lives in `lib/adminAuth.ts` and is intentionally separate
 * from the Supabase user session: a normal user can be signed in (or
 * not) without affecting admin access, and vice-versa. The store
 * starts unhydrated; `App` runs `adminFetchSession()` once at startup
 * if an admin token exists in localStorage, then flips `hydrated` so
 * we never misclassify a refreshing admin as a regular user.
 *
 * Returns a tri-state result so callers can hold rendering decisions
 * until admin status is actually resolved. Without `hydrated`, gated
 * pages would lock real admins out for the duration of the network
 * round-trip on refresh / deep link.
 */

import { useAdminStore } from "@/lib/adminAuth";

export interface AdminState {
  /** True only after the admin bootstrap has finished. */
  hydrated: boolean;
  /** Resolved admin presence — meaningless until `hydrated` is true. */
  isAdmin: boolean;
}

export function useAdminState(): AdminState {
  const profile  = useAdminStore((s) => s.profile);
  const hydrated = useAdminStore((s) => s.hydrated);
  return { hydrated, isAdmin: Boolean(profile && profile.is_active !== false) };
}

/** Back-compat convenience for call sites that don't need the hydrated
 *  flag (e.g. the CreateHub list — we'd rather flicker once than wait). */
export function useIsAdmin(): boolean {
  return useAdminState().isAdmin;
}
