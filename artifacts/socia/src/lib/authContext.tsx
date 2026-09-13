/**
 * authContext.tsx — Supabase Auth
 *
 * Loading guarantee: setLoading(false) is ALWAYS called from INITIAL_SESSION,
 * BEFORE awaiting syncProfile, so the UI never blocks on profile fetching.
 * syncProfile runs in the background with a 3-second hard timeout.
 */
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import {
  supabase,
  isSupabaseReady,
  fetchProfile,
  upsertProfile,
  ensureProfile,
  cacheProfile,
  getCachedProfile,
  setOnlineStatus,
  claimOwnerBadge,
} from "./supabase";
import { useMyPresence } from "./usePresence";
import { useAppStore } from "./store";
import { clearUserCache } from "./useSupabaseChat";
import { useSociaGptStore } from "./sociaGptClient";
import { useAIPlanStore } from "./aiPlanClient";

export const EMAIL_CONFIRMATION_REQUIRED = "email_confirmation_required";

interface AuthContextType {
  supabaseUser: SupabaseUser | null;
  loading:      boolean;
  signInEmail:  (email: string, password: string) => Promise<void>;
  signUpEmail:  (email: string, password: string, displayName: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOutUser:  () => Promise<void>;
  /** Sends a password-reset email; user lands on /reset-password */
  requestPasswordReset: (email: string) => Promise<void>;
  /** Updates the password for the currently authenticated user */
  updatePassword: (newPassword: string) => Promise<void>;
  /** Deletes the user's profile data + auth row (requires DB-level RPC) */
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Hard timeout so syncProfile never blocks the UI indefinitely
const SYNC_TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[Supabase] ${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

function isPlaceholderProfileValue(value: unknown): boolean {
  const v = String(value ?? "").trim().toLowerCase().replace(/^@/, "");
  return !v || v === "user" || v === "socia user" || v === "sociauser" || v === "unknown";
}

function resolveDisplayName(sbUser: SupabaseUser, dbName?: string | null, cachedName?: string | null): string {
  const metadata = (sbUser.user_metadata?.full_name ?? sbUser.user_metadata?.name ?? "") as string;
  const candidates = [cachedName, dbName, metadata, sbUser.email?.split("@")[0], "Socia User"];
  return (candidates.find((v) => !isPlaceholderProfileValue(v)) ?? "Socia User").trim();
}

function resolveUsername(sbUser: SupabaseUser, dbUsername?: string | null, cachedUsername?: string | null): string {
  const metadata = (sbUser.user_metadata?.user_name ?? sbUser.user_metadata?.preferred_username ?? "") as string;
  const candidates = [cachedUsername, dbUsername, metadata, sbUser.email?.split("@")[0], sbUser.id.slice(0, 8), "user"];
  return (candidates.find((v) => !isPlaceholderProfileValue(v)) ?? "user").trim().replace(/^@/, "");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading]           = useState(true);
  const syncing = useRef(false);
  const storeLogin         = useAppStore((s) => s.login);
  const storeLogout        = useAppStore((s) => s.logout);
  const setUser            = useAppStore((s) => s.setUser);
  const setFollowedUserIds = useAppStore((s) => s.setFollowedUserIds);

  /* ── Realtime presence system (15 s heartbeat, AWAY detection) ─────────── */
  useMyPresence(supabaseUser?.id ?? null);

  useEffect(() => {
    if (!isSupabaseReady) {
      setLoading(false);
      return;
    }

    // Guard: whichever fires first (getSession or INITIAL_SESSION) wins;
    // the second path is a no-op so syncProfile is never called twice.
    let initialized = false;

    function handleSession(user: SupabaseUser) {
      // Mark as authenticated BEFORE clearing the loading flag so that
      // AuthGuard never sees loading=false + isAuthenticated=false simultaneously.
      // That race caused protected routes (e.g. /profile/settings) to bounce
      // the user to /auth and then immediately back to / on every hard reload.
      setSupabaseUser(user);
      // Pre-populate the user store from localStorage cache immediately so
      // Profile/TopBar/BottomNav render real content as soon as the loading
      // spinner clears (~0ms).  syncProfile overwrites with fresh DB data once
      // the Supabase round-trip completes (200–800ms later on a fast link).
      // Without this, any component that does `if (!user) return null` shows
      // a blank screen for the entire syncProfile window.
      applyFallbackUser(user);
      storeLogin();        // isAuthenticated = true  ← must come before setLoading(false)
      setLoading(false);
      withTimeout(syncProfile(user), SYNC_TIMEOUT_MS, "syncProfile")
        .then(() => storeLogin())   // re-affirm after profile data arrives
        .catch((err) => {
          console.error("[Supabase] syncProfile failed:", err.message);
          applyFallbackUser(user);
          storeLogin();
        });
    }

    // ── Step 1: read session directly from localStorage ──────────────────
    // getSession() reads the token synchronously. If the stored refresh token
    // is invalid (e.g. stale from a previous Supabase project), wipe it so
    // the user is cleanly signed out rather than stuck in a broken state.
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        const code = (error as any).code ?? "";
        if (code === "refresh_token_not_found" || error.message?.includes("Refresh Token Not Found")) {
          console.warn("[Supabase] Stale refresh token — signing out to clear it");
          supabase.auth.signOut();   // clears localStorage, fires SIGNED_OUT
          return;
        }
      }
      const { session } = data;
      if (initialized) return; // INITIAL_SESSION already handled it
      initialized = true;
      if (session?.user) {
        handleSession(session.user);
      } else {
        setLoading(false);
      }
    });

    // ── Step 2: subscribe to live auth events ────────────────────────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "INITIAL_SESSION") {
          if (!initialized) {
            initialized = true;
            if (session?.user) {
              handleSession(session.user);
            } else {
              setLoading(false);
            }
          }
          return;
        }

        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
          if (session?.user) {
            setSupabaseUser(session.user);
            withTimeout(syncProfile(session.user), SYNC_TIMEOUT_MS, "syncProfile")
              .then(() => storeLogin())
              .catch((err) => {
                console.error("[Supabase] syncProfile failed on", event, ":", err.message);
                applyFallbackUser(session.user);
                storeLogin();
              });
          }
          return;
        }

        if (event === "SIGNED_OUT") {
          initialized = false;
          setSupabaseUser(null);
          // Clear ALL user-specific caches so User B never sees User A's data
          clearUserCache();
          useSociaGptStore.getState().clear();
          try { localStorage.removeItem("socia_gpt_chat_v2"); } catch {}
          useAIPlanStore.getState().reset();
          try {
            Object.keys(localStorage)
              .filter((k) => k.startsWith("socia_profile_"))
              .forEach((k) => localStorage.removeItem(k));
          } catch {}
          storeLogout();
          return;
        }
      }
    );

    // Safety net — ensure loading is never permanently stuck
    const safetyTimer = setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          console.warn("[Supabase] Safety timeout fired — forcing loading=false");
          return false;
        }
        return prev;
      });
    }, SYNC_TIMEOUT_MS + 500);

    return () => {
      subscription.unsubscribe();
      clearTimeout(safetyTimer);
    };
  }, []);

  /* ── Realtime: live-update SELF profile ─────────────────────────────── *
   * Subscribes to UPDATE events on this user's row in `public.users` so
   * that any field change (most importantly `is_owner` / `is_verified`)
   * propagates instantly into the global store — no refresh needed,
   * no per-page re-fetches needed. Every component that reads `useAuth()`
   * (Profile header, sidebar, settings, etc.) updates the moment the
   * RPC commits server-side. */
  useEffect(() => {
    if (!supabaseUser) return;
    const channel = supabase
      .channel(`self_user_${supabaseUser.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "users", filter: `id=eq.${supabaseUser.id}` },
        () => { void syncProfile(supabaseUser); },
      )
      .subscribe((status, err) => {
        if (err) console.warn("[auth] self_user channel error:", err.message);
      });
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseUser?.id]);

  /* ── Load which users this account follows (fire-and-forget) ───────────── */
  function refreshFollowedIds(uid: string) {
    supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", uid)
      .then(
        ({ data }) => {
          if (data) setFollowedUserIds((data as { following_id: string }[]).map((r) => r.following_id));
        },
        () => {},
      );
  }

  /* ── Fallback: build user object from auth metadata alone ─────────────── */
  function applyFallbackUser(sbUser: SupabaseUser) {
    const cached   = getCachedProfile(sbUser.id);
    const name     = resolveDisplayName(sbUser, null, cached?.name);
    const username = resolveUsername(sbUser, null, cached?.username);
    const avatar   = cached?.avatar_url || "";
    setUser({ id: sbUser.id, name, handle: username, avatar, bio: "", followers: 0, following: 0 });
  }

  /* ── Profile sync ─────────────────────────────────────────────────────── */
  async function syncProfile(sbUser: SupabaseUser) {
    if (syncing.current) return;
    syncing.current = true;

    try {
      /* Side-effects: claim the owner badge and mark the user as online.
       * Awaited in parallel so the DB row already has is_online=true by
       * the time fetchProfile reads it — eliminates the race condition that
       * caused the founder to show OFFLINE immediately after sign-in. */
      await Promise.all([
        claimOwnerBadge().catch(() => {}),
        setOnlineStatus(true).catch(() => {}),
      ]);

      const dbProfile = await fetchProfile(sbUser.id);

      /* ── Admin-enforced account states ──────────────────────────────── *
       * If a super-admin has banned, suspended, or force-logged-out this
       * account, kick the user out IMMEDIATELY before we even publish a
       * profile to the rest of the app. The status bits are read from the
       * same `users` row that's already in the realtime subscription, so
       * a live ban propagates within seconds. */
      const banned    = (dbProfile as { is_banned?:    boolean } | null)?.is_banned    === true;
      const suspended = (dbProfile as { is_suspended?: boolean } | null)?.is_suspended === true;
      const forceAt   = (dbProfile as { force_logout_at?: string | null } | null)?.force_logout_at ?? null;
      const sessionAt = sbUser.last_sign_in_at ? new Date(sbUser.last_sign_in_at).getTime() : 0;
      const forceMs   = forceAt ? new Date(forceAt).getTime() : 0;
      if (banned || suspended || (forceMs > 0 && forceMs > sessionAt)) {
        try {
          const reason = banned ? "Your account has been banned by the moderation team."
                       : suspended ? "Your account is suspended. Contact support if you believe this is a mistake."
                       : "Your session was ended by an administrator. Please sign in again.";
          // Defer the alert so the React render isn't aborted mid-flight.
          setTimeout(() => alert(reason), 0);
        } catch { /* ignore alert errors */ }
        await supabase.auth.signOut();
        return;
      }

      if (dbProfile) {
        /* If the user saved profile changes locally but the DB sync timed out,
         * the cache carries a `_local_updated_at` epoch that's newer than
         * `dbProfile.updated_at`.  Prefer local data and retry the DB write
         * in the background so the UI never loses unsync'd edits on refresh. */
        const cached    = getCachedProfile(sbUser.id);
        const localTs   = (cached as Record<string, unknown> | null)?._local_updated_at as number | undefined ?? 0;
        const dbTs      = dbProfile.updated_at ? new Date(dbProfile.updated_at).getTime() : 0;

        if (localTs > dbTs && cached) {
          console.log("[auth] Local cache is newer than DB — applying local data and retrying sync");
          // Only sync core fields — social columns may not exist in the schema yet.
          void upsertProfile(sbUser.id, {
            name:       (cached.name       ?? dbProfile.name)       as string | undefined,
            username:   (cached.username   ?? dbProfile.username)   as string | undefined,
            avatar_url: (cached.avatar_url ?? dbProfile.avatar_url) as string | undefined,
            bio:        (cached.bio        ?? dbProfile.bio)        as string | undefined,
          }).catch(() => {});
          // Social links: attempt separately — fails silently if columns not yet in schema.
          supabase.from("users").update({
            social_facebook:  (cached.social_facebook  ?? dbProfile.social_facebook)  ?? "",
            social_instagram: (cached.social_instagram ?? dbProfile.social_instagram) ?? "",
            social_tiktok:    (cached.social_tiktok    ?? dbProfile.social_tiktok)    ?? "",
          }).eq("id", sbUser.id).then(({ error: se }) => {
            if (se) console.warn("[auth] social sync failed (columns may not exist yet):", se.message);
          });

          setUser({
            id:                sbUser.id,
            name:              resolveDisplayName(sbUser, dbProfile.name, cached.name as string | undefined),
            handle:            resolveUsername(sbUser, dbProfile.username, cached.username as string | undefined),
            avatar:            (cached.avatar_url  as string | undefined) || dbProfile.avatar_url  || "",
            bio:               (cached.bio         as string | undefined) || dbProfile.bio         || "",
            followers:         dbProfile.followers  || 0,
            following:         dbProfile.following  || 0,
            isOwner:           dbProfile.is_owner    ?? false,
            isVerified:        dbProfile.is_verified ?? false,
            isOnline:          dbProfile.is_online   ?? false,
            website:           (cached.website           as string | undefined) ?? (dbProfile as any).website           ?? "",
            location:          (cached.location          as string | undefined) ?? (dbProfile as any).location          ?? "",
            gender:            (cached.gender            as string | undefined) ?? (dbProfile as any).gender            ?? "Prefer not to say",
            birthday:          (cached.birthday          as string | undefined) ?? (dbProfile as any).birthday          ?? "",
            relationshipStatus:(cached.relationship_status as string | undefined) ?? (dbProfile as any).relationship_status ?? "Prefer not to say",
            work:              (cached.work              as string | undefined) ?? (dbProfile as any).work              ?? "",
            workPrevious:      (cached.work_previous     as string | undefined) ?? (dbProfile as any).work_previous     ?? "",
            school:            (cached.school            as string | undefined) ?? (dbProfile as any).school            ?? "",
            college:           (cached.college           as string | undefined) ?? (dbProfile as any).college           ?? "",
            education:         (cached.education         as string | undefined) ?? (dbProfile as any).education         ?? "",
            public_email:      (cached.public_email      as string | undefined) ?? (dbProfile as any).public_email      ?? "",
            public_phone:      (cached.public_phone      as string | undefined) ?? (dbProfile as any).public_phone      ?? "",
            privacySettings:   (cached.privacy_settings as Record<string, boolean | string> | undefined) ?? (dbProfile as any).privacy_settings ?? undefined,
            social: {
              facebook:  (cached.social_facebook  as string | undefined) ?? dbProfile.social_facebook  ?? "",
              instagram: (cached.social_instagram as string | undefined) ?? dbProfile.social_instagram ?? "",
              tiktok:    (cached.social_tiktok    as string | undefined) ?? dbProfile.social_tiktok    ?? "",
              x:         (cached.social_x         as string | undefined) ?? (dbProfile as any).social_x        ?? "",
              youtube:   (cached.social_youtube   as string | undefined) ?? (dbProfile as any).social_youtube  ?? "",
              linkedin:  (cached.social_linkedin  as string | undefined) ?? (dbProfile as any).social_linkedin ?? "",
            },
          });
          refreshFollowedIds(sbUser.id);
          return;
        }

        setUser({
          id:                sbUser.id,
          name:              resolveDisplayName(sbUser, dbProfile.name, getCachedProfile(sbUser.id)?.name as string | undefined),
          handle:            resolveUsername(sbUser, dbProfile.username, getCachedProfile(sbUser.id)?.username as string | undefined),
          avatar:            dbProfile.avatar_url  || "",
          bio:               dbProfile.bio         || "",
          followers:         dbProfile.followers   || 0,
          following:         dbProfile.following   || 0,
          isOwner:           dbProfile.is_owner    ?? false,
          isVerified:        dbProfile.is_verified ?? false,
          isOnline:          dbProfile.is_online   ?? false,
          website:           (dbProfile as any).website           ?? "",
          location:          (dbProfile as any).location          ?? "",
          gender:            (dbProfile as any).gender            ?? "Prefer not to say",
          birthday:          (dbProfile as any).birthday          ?? "",
          relationshipStatus:(dbProfile as any).relationship_status ?? "Prefer not to say",
          work:              (dbProfile as any).work              ?? "",
          workPrevious:      (dbProfile as any).work_previous     ?? "",
          school:            (dbProfile as any).school            ?? "",
          college:           (dbProfile as any).college           ?? "",
          education:         (dbProfile as any).education         ?? "",
          public_email:      (dbProfile as any).public_email      ?? "",
          public_phone:      (dbProfile as any).public_phone      ?? "",
          privacySettings:   (dbProfile as any).privacy_settings  ?? undefined,
          social: {
            facebook:  dbProfile.social_facebook  ?? "",
            instagram: dbProfile.social_instagram ?? "",
            tiktok:    dbProfile.social_tiktok    ?? "",
            x:         (dbProfile as any).social_x        ?? "",
            youtube:   (dbProfile as any).social_youtube  ?? "",
            linkedin:  (dbProfile as any).social_linkedin ?? "",
          },
        });
        refreshFollowedIds(sbUser.id);
        return;
      }

      // 2. No DB row — use cache + auth metadata, then seed the row.
      //    Use ensureProfile (upsert) so the row is created if it doesn't exist yet.
      const cached   = getCachedProfile(sbUser.id);
      const name     = cached?.name     || (sbUser.user_metadata?.full_name as string) || sbUser.email?.split("@")[0] || "Socia User";
      const username = cached?.username || sbUser.email?.split("@")[0] || sbUser.id.slice(0, 8);
      const avatar   = cached?.avatar_url || (sbUser.user_metadata?.avatar_url as string) || "";

      const { error } = await ensureProfile(sbUser.id, {
        email: sbUser.email || "", name, username, avatar_url: avatar,
        bio: "", followers: 0, following: 0,
      });

      if (error) {
        console.warn("[Supabase] upsertProfile failed:", error);
      }

      setUser({ id: sbUser.id, name, handle: username, avatar, bio: "", followers: 0, following: 0 });
    } finally {
      syncing.current = false;
    }
  }

  /* ── Auth methods ─────────────────────────────────────────────────────── */

  async function signInEmail(email: string, password: string) {
    // Use the same-origin Render API for email/password authentication.
    // This avoids browser-side Supabase CORS/fetch failures while the server
    // still performs the actual authentication against Supabase Auth.
    const res = await fetch("/api/auth/password-signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
      credentials: "same-origin",
      cache: "no-store",
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error || "Sign-in failed");
    }

    if (!payload?.session) {
      throw new Error("Authentication succeeded but no session was returned.");
    }

    const { error } = await supabase.auth.setSession(payload.session);
    if (error) throw new Error(error.message);
  }

  async function signUpEmail(email: string, password: string, displayName: string) {
    // Same-origin proxy for signup for the same reason as sign-in above.
    const res = await fetch("/api/auth/password-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
      }),
      credentials: "same-origin",
      cache: "no-store",
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error || "Sign-up failed");
    }

    const data = payload;

    if (data.user && !data.session) {
      // Email confirmation ON — cache profile now, session comes after confirm.
      cacheProfile(data.user.id, {
        email, name: displayName, username: email.split("@")[0],
        avatar_url: "", bio: "", followers: 0, following: 0,
      });
      await ensureProfile(data.user.id, {
        email, name: displayName, username: email.split("@")[0],
        avatar_url: "", bio: "", followers: 0, following: 0,
      });
      throw new Error(EMAIL_CONFIRMATION_REQUIRED);
    }

    if (data.session) {
      const { error } = await supabase.auth.setSession(data.session);
      if (error) throw new Error(error.message);
    }

    if (data.user) {
      cacheProfile(data.user.id, {
        email, name: displayName, username: email.split("@")[0],
        avatar_url: "", bio: "", followers: 0, following: 0,
      });
    }
  }

  async function signInGoogle() {
    /*
     * HOW SUPABASE + GOOGLE OAUTH REDIRECTS WORK
     * ─────────────────────────────────────────────
     * There are TWO separate redirect URLs, serving different purposes:
     *
     * 1. redirect_uri  (what Google sees, set internally by Supabase):
     *      https://jfptmbvjtxien.supabase.co/auth/v1/callback
     *    ▸ This MUST be listed in Google Cloud Console → Authorized redirect URIs.
     *    ▸ Our code NEVER touches this — Supabase manages it automatically.
     *
     * 2. redirectTo  (what Supabase uses AFTER it finishes with Google):
     *      https://<domain>/socia/auth/callback  (or /auth/callback in dev)
     *    ▸ This MUST be listed in Supabase Dashboard → Auth → URL Configuration
     *      → Redirect URLs.
     *    ▸ Supabase passes this through via the OAuth state parameter; Google
     *      never sees it and it never affects redirect_uri_mismatch errors.
     *
     * So: redirect_uri_mismatch = missing entry in Google Cloud Console (#1 above).
     */

    /* Build the post-OAuth app callback URL for this environment.
     * BASE_URL = "/" in dev, "/socia/" in production via Vite config. */
    const base   = import.meta.env.BASE_URL.replace(/\/$/, ""); // e.g. "" or "/socia"
    const redirectTo = `${window.location.origin}${base}/auth/callback`;

    console.info("[Auth] Google OAuth redirectTo:", redirectTo);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        // Do NOT add access_type/prompt here — they can break mobile Chrome
        // and force a consent screen on every login.
      },
    });
    if (error) throw new Error(error.message);
  }

  async function signOutUser() {
    /* Try to flip the online flag off before the JWT is invalidated. */
    try { await setOnlineStatus(false); } catch {}
    await supabase.auth.signOut();
  }

  async function requestPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw new Error(error.message);
  }

  async function updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  }

  /* Deletes the user's profile + auth row by invoking a Postgres function
   * that runs with `security definer` privileges (defined in schema §12).
   * Falls back to wiping rows if the RPC isn't available, then signs out. */
  async function deleteAccount() {
    const u = supabaseUser;
    if (!u) throw new Error("Not signed in");
    /* RPC handles cascading deletes + auth.users row in one transaction */
    const { error: rpcErr } = await supabase.rpc("delete_my_account");
    if (rpcErr) {
      console.error("[Auth] delete_my_account RPC failed:", rpcErr);
      throw new Error(
        `Could not delete account: ${rpcErr.message}. ` +
        `Make sure you've run the latest supabase-schema.sql (section 12).`,
      );
    }
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{
      supabaseUser, loading,
      signInEmail, signUpEmail, signInGoogle, signOutUser,
      requestPasswordReset, updatePassword, deleteAccount,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
