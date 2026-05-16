/**
 * UserProfile.tsx — view another user's public profile
 * Fetches real data from Supabase users table.
 */
import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, MessageCircle, UserPlus, UserCheck, Facebook, Instagram, Music2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { DbUser } from "@/lib/supabase";
import { useAuth } from "@/lib/authContext";
import { NameBadges, OnlineDot } from "@/components/Badges";

function compact(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return (n / 1_000_000).toFixed(1) + "M";
}

export default function UserProfile() {
  const [, params]   = useRoute("/profile/:id");
  const userId       = params?.id ?? "";
  const [, navigate] = useLocation();

  const { supabaseUser } = useAuth();

  const [profile,       setProfile]       = useState<DbUser | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [followed,      setFollowed]      = useState(false);
  const [followWorking, setFollowWorking] = useState(false);

  /**
   * Re-read the profile's denormalized follower/following counts from the
   * users table.  The follow_user / unfollow_user RPCs keep these columns
   * in sync, so this is always accurate and avoids any RLS issues that can
   * arise from counting the raw `follows` table directly.
   */
  const fetchCounts = async () => {
    const { data, error } = await supabase
      .from("users")
      .select("followers, following")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("[Follow] re-fetch counts error:", error.message);
      return;
    }

    if (data) {
      console.log("[Follow] counts", { followers: data.followers, following: data.following });
      setProfile((p) => (p ? { ...p, followers: data.followers ?? 0, following: data.following ?? 0 } : p));
    }
  };

  /* Re-key on BOTH the profile being viewed AND the logged-in user.
     If the user switches account while sitting on a profile page, this
     re-runs and re-checks the follow state from the new account's POV.   */
  const sessionUid = supabaseUser?.id ?? null;

  useEffect(() => {
    if (!userId) return;

    /* ── HARD RESET (synchronous, before any await) ───────────────────── *
     * Wouter keeps this component mounted when navigating between two    *
     * profile pages (same route pattern, only the :id param changes), so *
     * `followed` from the PREVIOUS profile would otherwise leak into the *
     * new one and look like an "auto-follow" until the async query       *
     * finishes. Same problem applies to a stale profile from account A   *
     * after switching to account B. Reset everything immediately.        */
    setProfile(null);
    setFollowed(false);
    setLoading(true);

    /* Capture the userId we're loading FOR, so a slow response from a    *
     * previous navigation can't overwrite the state of the current one.  */
    const requestedFor = userId;
    let cancelled = false;

    (async () => {
      /* ALWAYS pull a fresh session — never trust a cached uid. */
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      console.log("UID:", uid);
      console.log("TARGET:", userId);

      const [profileRes, followRes, followersRes, followingRes] = await Promise.all([
        supabase.from("users").select("*").eq("id", requestedFor).maybeSingle(),
        uid
          ? supabase
              .from("follows")
              .select("*")
              .eq("follower_id", uid)
              .eq("following_id", requestedFor)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("following_id", requestedFor),
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("follower_id", requestedFor),
      ]);

      /* Bail out if the user navigated away or switched account while
         these queries were in flight — preventing stale writes. */
      if (cancelled) return;

      if (profileRes.error)         console.error("[Profile] users ERROR:",          profileRes.error);
      if ((followRes as any).error) console.error("[Follow] check ERROR:",           (followRes as any).error);
      if (followersRes.error)       console.error("[Follow] followers count ERROR:", followersRes.error);
      if (followingRes.error)       console.error("[Follow] following count ERROR:", followingRes.error);

      const base = profileRes.data as DbUser | null;
      const initialCounts = {
        followers: followersRes.count ?? 0,
        following: followingRes.count ?? 0,
      };
      console.log("[Follow] initial counts", initialCounts);
      console.log("[Follow] initial followed?", !!followRes.data);

      setProfile(base ? { ...base, ...initialCounts } : null);
      setFollowed(!!followRes.data);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [userId, sessionUid]);

  /* Realtime: subscribe to UPDATEs on this user's row, so online/offline,
   * verified, owner badge, and avatar changes push live without a refresh. */
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`profile:${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "users", filter: `id=eq.${userId}` },
        (payload) => {
          const next = payload.new as DbUser;
          setProfile((p) => (p ? { ...p, ...next } : p));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const handleFollow = async () => {
    if (followWorking) return;

    /* ── 1. Resolve the live session UID (no fallback, no store) ─────── */
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;

    console.log("UID:", uid);
    console.log("TARGET:", userId);

    if (!uid) {
      console.error("[Follow] No authenticated user — cannot follow");
      return;
    }

    setFollowWorking(true);

    try {
      if (followed) {
        /* ── 2a. UNFOLLOW via RPC — removes row + decrements denorm counts ── */
        const { error } = await supabase.rpc("unfollow_user", { target_id: userId });
        if (error) {
          console.error("[Follow] unfollow_user RPC error:", error.code, error.message);
          return;
        }
        setFollowed(false);
      } else {
        /* ── 2b. FOLLOW via RPC — inserts row + bumps denorm counts ───────── */
        const { error } = await supabase.rpc("follow_user", { target_id: userId });
        if (error) {
          console.error("[Follow] follow_user RPC error:", error.code, error.message);
          return;
        }
        setFollowed(true);
      }

      /* ── 3. Re-count from DB after a confirmed write ─────────────── */
      await fetchCounts();
    } catch (e) {
      /* Network / unexpected throw — DO NOT flip UI */
      console.error("[Follow] unexpected error:", e);
    } finally {
      setFollowWorking(false);
    }
  };

  if (!userId || userId === supabaseUser?.id) {
    navigate("/profile");
    return null;
  }

  if (loading) {
    return (
      <div className="app-bg flex h-full flex-col">
        <div
          className="flex items-center gap-3 border-b border-white/[0.06] bg-background/70 px-4 backdrop-blur-2xl"
          style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 12px)`, paddingBottom: 12 }}
        >
          <button onClick={() => navigate(-1 as any)} className="card-premium grid h-9 w-9 place-items-center rounded-full text-white">
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          {/* Skeleton */}
          <div className="h-20 w-20 rounded-full shimmer" />
          <div className="h-5 w-32 rounded shimmer" />
          <div className="h-3.5 w-24 rounded shimmer" />
          <div className="mt-2 h-3 w-52 rounded shimmer" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="app-bg flex h-full flex-col">
        <div
          className="flex items-center gap-3 border-b border-white/[0.06] bg-background/70 px-4 backdrop-blur-2xl"
          style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 12px)`, paddingBottom: 12 }}
        >
          <button onClick={() => navigate(-1 as any)} className="card-premium grid h-9 w-9 place-items-center rounded-full text-white">
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center text-sm text-white/40">
          User not found
        </div>
      </div>
    );
  }

  const avatarSrc = profile.avatar_url;
  const initials  = (profile.name || "?").charAt(0).toUpperCase();

  return (
    <div className="app-bg flex h-full flex-col overflow-y-auto hide-scrollbar">
      {/* Header */}
      <div
        className="flex items-center gap-3 border-b border-white/[0.06] bg-background/70 px-4 backdrop-blur-2xl"
        style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 12px)`, paddingBottom: 12 }}
      >
        <button
          onClick={() => history.length > 1 ? history.back() : navigate("/messages")}
          className="card-premium grid h-9 w-9 place-items-center rounded-full text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="font-semibold text-white truncate">{profile.name || profile.username}</span>
      </div>

      {/* Profile body */}
      <div className="px-5 pt-6 pb-8">
        {/* Avatar + actions */}
        <div className="flex items-start justify-between">
          <div className="relative">
            <div
              className="h-20 w-20 overflow-hidden rounded-full"
              style={{ border: "2.5px solid var(--accent-primary)", boxShadow: "0 6px 24px -6px var(--accent-glow)" }}
            >
              {avatarSrc ? (
                <img src={avatarSrc} alt={profile.name} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-purple-600 via-pink-500 to-blue-600 grid place-items-center text-2xl font-bold text-white">
                  {initials}
                </div>
              )}
            </div>
            <div className="absolute bottom-0.5 right-0.5">
              <OnlineDot online={Boolean(profile.is_online)} size={14} />
            </div>
          </div>

          <div className="relative z-10 flex gap-2 pt-1 pointer-events-auto">
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                console.log("[Follow] CLICK", { followed, followWorking, userId });
                handleFollow();
              }}
              disabled={followWorking}
              className={
                "relative z-10 pointer-events-auto flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-white transition-colors disabled:opacity-60 " +
                (followed
                  ? "border border-white/20 bg-white/[0.06]"
                  : "bg-gradient-to-r from-purple-600 via-pink-500 to-blue-500 shadow-[0_4px_18px_-4px_rgba(236,72,153,0.45)]")
              }
            >
              {followed
                ? <><UserCheck className="h-3.5 w-3.5" /> Following</>
                : <><UserPlus className="h-3.5 w-3.5" /> Follow</>}
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => navigate(`/messages/${userId}`)}
              className="card-premium relative z-10 pointer-events-auto flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-white"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Message
            </motion.button>
          </div>
        </div>

        {/* Name / username / bio / badges */}
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-[22px] font-bold leading-tight text-white">
              {profile.name || profile.username || "Unknown"}
            </h2>
            <NameBadges
              isOwner={profile.is_owner}
              isVerified={profile.is_verified}
              size="md"
            />
          </div>
          {profile.username && (
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-white/50">
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em]">
                {profile.is_online ? "Online now" : "Offline"}
              </span>
              · @{profile.username}
            </p>
          )}
          {profile.bio && (
            <p className="mt-2.5 text-[13px] leading-relaxed text-white/60 max-w-sm whitespace-pre-line">{profile.bio}</p>
          )}
          <UserSocialLinks
            facebook={profile.social_facebook}
            instagram={profile.social_instagram}
            tiktok={profile.social_tiktok}
          />
        </div>

        {/* Stats — followers/following are clickable, route to list pages */}
        <div className="mt-5 flex overflow-hidden rounded-[18px] border border-white/[0.06] bg-white/[0.03]">
          <StatBox label="Followers" value={profile.followers ?? 0} onClick={() => navigate(`/followers/${userId}`)} />
          <div className="my-3 w-px self-stretch bg-white/[0.06]" />
          <StatBox label="Following" value={profile.following ?? 0} onClick={() => navigate(`/following/${userId}`)} />
        </div>

        {/* Empty posts state */}
        <div className="mt-8 flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-3xl">🎨</div>
          <p className="text-sm font-semibold text-white">No creations yet</p>
          <p className="text-xs text-white/40">Send them a message instead!</p>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate(`/messages/${userId}`)}
            className="mt-2 flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-600 via-pink-500 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_18px_-4px_rgba(236,72,153,0.45)]"
          >
            <MessageCircle className="h-4 w-4" />
            Start a conversation
          </motion.button>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 flex-col items-center justify-center py-4 transition-colors hover:bg-white/[0.03]"
    >
      <div className="font-display text-[17px] font-bold text-white">{compact(value)}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">{label}</div>
    </button>
  );
}

function UserSocialLinks({ facebook, instagram, tiktok }: {
  facebook?: string; instagram?: string; tiktok?: string;
}) {
  const buildUrl = (kind: "facebook" | "instagram" | "tiktok", v?: string) => {
    if (!v) return null;
    const t = v.trim();
    if (!t) return null;
    if (/^https?:\/\//i.test(t)) return t;
    const handle = t.replace(/^@/, "");
    if (kind === "facebook")  return `https://facebook.com/${handle}`;
    if (kind === "instagram") return `https://instagram.com/${handle}`;
    return `https://tiktok.com/@${handle}`;
  };
  const items: { icon: typeof Facebook; url: string; label: string }[] = [];
  const fb = buildUrl("facebook",  facebook);  if (fb) items.push({ icon: Facebook,  url: fb, label: "Facebook"  });
  const ig = buildUrl("instagram", instagram); if (ig) items.push({ icon: Instagram, url: ig, label: "Instagram" });
  const tt = buildUrl("tiktok",    tiktok);    if (tt) items.push({ icon: Music2,    url: tt, label: "TikTok"    });
  if (items.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map(({ icon: Icon, url, label }) => (
        <a
          key={label}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-white/80"
        >
          <Icon className="h-3 w-3" />
          {label}
        </a>
      ))}
    </div>
  );
}
