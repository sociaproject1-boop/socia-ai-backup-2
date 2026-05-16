/**
 * UserProfile.tsx — view another user's public profile.
 * Founder/owner accounts get the full cinematic FounderHero treatment.
 */
import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, MessageCircle, UserPlus, UserCheck, Facebook, Instagram, Music2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { DbUser } from "@/lib/supabase";
import { useAuth } from "@/lib/authContext";
import { NameBadges, OnlineDot } from "@/components/Badges";
import { FounderHero, SuperKingBadge } from "@/components/profile/FounderHero";

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

  const fetchCounts = async () => {
    const { data, error } = await supabase
      .from("users").select("followers, following").eq("id", userId).maybeSingle();
    if (error) { console.error("[Follow] re-fetch counts error:", error.message); return; }
    if (data)  setProfile((p) => (p ? { ...p, followers: data.followers ?? 0, following: data.following ?? 0 } : p));
  };

  const sessionUid = supabaseUser?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    setProfile(null); setFollowed(false); setLoading(true);
    const requestedFor = userId;
    let cancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;

      const [profileRes, followRes, followersRes, followingRes] = await Promise.all([
        supabase.from("users").select("*").eq("id", requestedFor).maybeSingle(),
        uid
          ? supabase.from("follows").select("*").eq("follower_id", uid).eq("following_id", requestedFor).maybeSingle()
          : Promise.resolve({ data: null, error: null } as Parameters<typeof setProfile>[0] extends null ? never : unknown) as Promise<{ data: null; error: null }>,
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", requestedFor),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id",  requestedFor),
      ]);

      if (cancelled) return;
      const base = profileRes.data as DbUser | null;
      const counts = { followers: followersRes.count ?? 0, following: followingRes.count ?? 0 };
      setProfile(base ? { ...base, ...counts } : null);
      setFollowed(!!(followRes as { data: unknown }).data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, sessionUid]);

  /* Realtime: live updates to this user's row */
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`profile:${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "users", filter: `id=eq.${userId}` },
        (payload) => setProfile((p) => p ? { ...p, ...(payload.new as DbUser) } : p),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const handleFollow = async () => {
    if (followWorking) return;
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    setFollowWorking(true);
    try {
      if (followed) {
        const { error } = await supabase.rpc("unfollow_user", { target_id: userId });
        if (!error) setFollowed(false);
      } else {
        const { error } = await supabase.rpc("follow_user", { target_id: userId });
        if (!error) setFollowed(true);
      }
      await fetchCounts();
    } catch (e) {
      console.error("[Follow] unexpected error:", e);
    } finally {
      setFollowWorking(false);
    }
  };

  if (!userId || userId === supabaseUser?.id) { navigate("/profile"); return null; }

  const BackBtn = () => (
    <div
      className="flex items-center gap-3 border-b border-white/[0.04] bg-[#000000] px-4"
      style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 12px)`, paddingBottom: 12 }}
    >
      <button
        onClick={() => history.length > 1 ? history.back() : navigate("/")}
        className="card-premium grid h-9 w-9 place-items-center rounded-full text-white"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      {profile && (
        <span className="font-semibold text-white truncate">{profile.name || profile.username}</span>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="app-bg flex h-full flex-col">
        <BackBtn />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
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
        <BackBtn />
        <div className="flex flex-1 items-center justify-center text-sm text-white/40">User not found</div>
      </div>
    );
  }

  const isOwnerProfile = !!profile.is_owner;
  const avatarSrc      = profile.avatar_url;
  const initials       = (profile.name || "?").charAt(0).toUpperCase();

  return (
    <div className="app-bg flex h-full flex-col overflow-y-auto hide-scrollbar">
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 border-b border-white/[0.04] px-4"
        style={{
          paddingTop:    `calc(env(safe-area-inset-top, 0px) + 12px)`,
          paddingBottom: 12,
          background:    isOwnerProfile ? "transparent" : "#000000",
          position:      isOwnerProfile ? "absolute" : "relative",
          zIndex:        isOwnerProfile ? 20 : "auto",
          top:           0, left: 0, right: 0,
        }}
      >
        <button
          onClick={() => history.length > 1 ? history.back() : navigate("/")}
          className="card-premium grid h-9 w-9 place-items-center rounded-full text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        {!isOwnerProfile && (
          <span className="font-semibold text-white truncate">{profile.name || profile.username}</span>
        )}
      </div>

      {/* ── Founder cinematic hero ─────────────────────────────────────── */}
      {isOwnerProfile && <FounderHero />}

      {/* ── Profile body ──────────────────────────────────────────────── */}
      <div className={`px-5 pb-8 ${isOwnerProfile ? "pt-2" : "pt-6"}`}>
        {/* Avatar + action buttons */}
        <div className="flex items-start justify-between">
          {/* Avatar */}
          <div className="relative">
            {isOwnerProfile ? (
              <motion.div
                animate={{
                  boxShadow: [
                    "0 0 0 2px #f59e0b, 0 0 14px 4px rgba(245,158,11,0.38)",
                    "0 0 0 2.5px #fbbf24, 0 0 30px 8px rgba(251,191,36,0.65)",
                    "0 0 0 2px #f59e0b, 0 0 14px 4px rgba(245,158,11,0.38)",
                  ],
                }}
                transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                className="h-20 w-20 overflow-hidden rounded-full"
              >
                {avatarSrc
                  ? <img src={avatarSrc} alt={profile.name} loading="lazy" className="h-full w-full object-cover" />
                  : <div className="h-full w-full bg-gradient-to-br from-yellow-600 via-amber-500 to-orange-600 grid place-items-center text-2xl font-bold text-white">{initials}</div>
                }
              </motion.div>
            ) : (
              <div className="h-20 w-20 overflow-hidden rounded-full"
                style={{ border: "2.5px solid var(--accent-primary)", boxShadow: "0 6px 24px -6px var(--accent-glow)" }}>
                {avatarSrc
                  ? <img src={avatarSrc} alt={profile.name} loading="lazy" className="h-full w-full object-cover" />
                  : <div className="h-full w-full bg-gradient-to-br from-purple-600 via-pink-500 to-blue-600 grid place-items-center text-2xl font-bold text-white">{initials}</div>
                }
              </div>
            )}

            {/* Online dot */}
            <div className="absolute bottom-0.5 right-0.5">
              <OnlineDot online={Boolean(profile.is_online)} size={isOwnerProfile ? 0 : 14} />
            </div>
          </div>

          {/* Follow + Message buttons */}
          <div className="relative z-10 flex gap-2 pt-1 pointer-events-auto">
            <motion.button
              type="button" whileTap={{ scale: 0.9 }}
              onClick={handleFollow} disabled={followWorking}
              className={
                "relative z-10 pointer-events-auto flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-white transition-colors disabled:opacity-60 " +
                (followed ? "border border-white/20 bg-white/[0.06]"
                  : "bg-gradient-to-r from-purple-600 via-pink-500 to-blue-500 shadow-[0_4px_18px_-4px_rgba(236,72,153,0.45)]")
              }
            >
              {followed ? <><UserCheck className="h-3.5 w-3.5" /> Following</> : <><UserPlus className="h-3.5 w-3.5" /> Follow</>}
            </motion.button>
            <motion.button
              type="button" whileTap={{ scale: 0.9 }}
              onClick={() => navigate(`/messages/${userId}`)}
              className="card-premium relative z-10 pointer-events-auto flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-white"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Message
            </motion.button>
          </div>
        </div>

        {/* ── Name / badges / title / status ─────────────────────────── */}
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-[22px] font-bold leading-tight text-white">
              {profile.name || profile.username || "Unknown"}
            </h2>
            <NameBadges isOwner={profile.is_owner} isVerified={profile.is_verified} size="md" />
          </div>

          {/* Founder title — owner profiles only */}
          {isOwnerProfile && (
            <motion.div
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
              className="mt-1 flex items-center gap-2"
            >
              <SuperKingBadge />
              <motion.span
                animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                style={{
                  fontSize: 11.5, fontWeight: 800, letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  background: "linear-gradient(90deg, #d97706, #fbbf24, #f59e0b, #fbbf24, #d97706)",
                  backgroundSize: "200% auto",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Founder · Socia
              </motion.span>
            </motion.div>
          )}

          {/* Online status */}
          {isOwnerProfile ? (
            <div className="mt-2 flex items-center gap-2">
              <div className="relative" style={{ width: 10, height: 10 }}>
                {profile.is_online && (
                  <motion.div
                    animate={{ scale: [1, 2.4, 1], opacity: [0.7, 0, 0.7] }}
                    transition={{ duration: 1.6, repeat: Infinity }}
                    style={{ position: "absolute", inset: -2, borderRadius: "50%", background: "rgba(34,197,94,0.5)" }}
                  />
                )}
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: profile.is_online ? "#22c55e" : "#6b7280", position: "relative" }} />
              </div>
              <span style={{
                fontSize: 11, fontWeight: 800, letterSpacing: "0.09em",
                textTransform: "uppercase", color: profile.is_online ? "#22c55e" : "#6b7280",
              }}>
                {profile.is_online ? "Live · Online Now" : "Offline"}
              </span>
            </div>
          ) : (
            profile.username && (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-white/50">
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em]">
                  {profile.is_online ? "Online now" : "Offline"}
                </span>
                · @{profile.username}
              </p>
            )
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

        {/* Stats */}
        <div
          className="mt-5 flex overflow-hidden rounded-[18px]"
          style={{
            border:     isOwnerProfile ? "1px solid rgba(251,191,36,0.15)" : "1px solid rgba(255,255,255,0.06)",
            background: isOwnerProfile ? "rgba(251,191,36,0.025)"          : "rgba(255,255,255,0.03)",
          }}
        >
          <StatBox label="Followers" value={profile.followers ?? 0} onClick={() => navigate(`/followers/${userId}`)} />
          <div className="my-3 w-px self-stretch bg-white/[0.06]" />
          <StatBox label="Following" value={profile.following ?? 0} onClick={() => navigate(`/following/${userId}`)} />
        </div>

        {/* Empty posts nudge */}
        <div className="mt-8 flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-3xl">{isOwnerProfile ? "👑" : "🎨"}</div>
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

/* ══════════════════════════════════════════════════════════════════════════
   Helper components
══════════════════════════════════════════════════════════════════════════ */

function StatBox({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex flex-1 flex-col items-center justify-center py-4 transition-colors hover:bg-white/[0.03]">
      <div className="font-display text-[17px] font-bold text-white">{compact(value)}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">{label}</div>
    </button>
  );
}

function UserSocialLinks({ facebook, instagram, tiktok }: { facebook?: string; instagram?: string; tiktok?: string }) {
  const buildUrl = (kind: "facebook" | "instagram" | "tiktok", v?: string) => {
    if (!v) return null; const t = v.trim(); if (!t) return null;
    if (/^https?:\/\//i.test(t)) return t;
    const handle = t.replace(/^@/, "");
    return kind === "facebook" ? `https://facebook.com/${handle}` : kind === "instagram" ? `https://instagram.com/${handle}` : `https://tiktok.com/@${handle}`;
  };
  const items: { icon: typeof Facebook; url: string; label: string }[] = [];
  const fb = buildUrl("facebook",  facebook);  if (fb) items.push({ icon: Facebook,  url: fb, label: "Facebook"  });
  const ig = buildUrl("instagram", instagram); if (ig) items.push({ icon: Instagram, url: ig, label: "Instagram" });
  const tt = buildUrl("tiktok",    tiktok);    if (tt) items.push({ icon: Music2,    url: tt, label: "TikTok"    });
  if (items.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map(({ icon: Icon, url, label }) => (
        <a key={label} href={url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-white/80">
          <Icon className="h-3 w-3" />{label}
        </a>
      ))}
    </div>
  );
}
