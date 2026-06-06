/**
 * MilestoneTimeline.tsx — Profile milestone history (Milestones tab).
 * Computed from existing user/post data — no extra DB tables needed.
 */
import { motion } from "framer-motion";
import { Star, Zap, CheckCircle, Users, Calendar, Award, Sparkles, Crown } from "lucide-react";
import type { SocialPost } from "@/lib/postsClient";
import type { SupporterTier } from "@/components/profile/FoundingSupporterBadge";
import { TIER_NAMES } from "@/components/profile/FoundingSupporterBadge";

interface Milestone {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  date?: string;
  gradient: string;
  accent: string;
}

interface Props {
  userProfile?: {
    created_at?: string;
    is_verified?: boolean;
    is_owner?: boolean;
    subscription_status?: string;
    name?: string;
    followers?: number;
  };
  posts?: SocialPost[];
  supporterTier?: SupporterTier | null;
}

export function MilestoneTimeline({ userProfile, posts = [], supporterTier }: Props) {
  const milestones: Milestone[] = [];

  /* ── Joined Socia ─────────────────────────────────────── */
  if (userProfile?.created_at) {
    milestones.push({
      id: "joined",
      icon: <Sparkles className="h-4 w-4" />,
      title: "Joined Socia",
      subtitle: "Became part of the Socia community",
      date: userProfile.created_at,
      gradient: "from-purple-500/20 to-blue-500/20",
      accent: "#a78bfa",
    });
  }

  /* ── Founding Supporter ───────────────────────────────── */
  if (supporterTier) {
    const tierLabel = `${TIER_NAMES[supporterTier]} Founding Supporter`;
    milestones.push({
      id: "supporter",
      icon: <Crown className="h-4 w-4" />,
      title: tierLabel,
      subtitle: "Supported Socia during its early days",
      gradient: "from-amber-500/20 to-yellow-500/20",
      accent: "#fbbf24",
    });
  }

  /* ── Verified Creator ─────────────────────────────────── */
  if (userProfile?.is_verified) {
    milestones.push({
      id: "verified",
      icon: <CheckCircle className="h-4 w-4" />,
      title: "Verified Creator",
      subtitle: "Account verified by the Socia team",
      gradient: "from-blue-500/20 to-cyan-500/20",
      accent: "#38bdf8",
    });
  }

  /* ── Platform Founder ─────────────────────────────────── */
  if (userProfile?.is_owner) {
    milestones.push({
      id: "founder",
      icon: <Crown className="h-4 w-4" />,
      title: "Platform Founder",
      subtitle: "Built and launched Socia",
      gradient: "from-amber-400/20 to-orange-500/20",
      accent: "#f59e0b",
    });
  }

  /* ── First Post ───────────────────────────────────────── */
  const firstPost = posts.slice().sort(
    (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
  )[0];
  if (firstPost) {
    milestones.push({
      id: "first_post",
      icon: <Zap className="h-4 w-4" />,
      title: "First Creation",
      subtitle: "Published their first post on Socia",
      date: firstPost.created_at,
      gradient: "from-pink-500/20 to-rose-500/20",
      accent: "#f472b6",
    });
  }

  /* ── Viral post (>100 likes) ──────────────────────────── */
  const viralPost = posts.find(p => (p.like_count ?? 0) >= 100);
  if (viralPost) {
    milestones.push({
      id: "viral",
      icon: <Star className="h-4 w-4" />,
      title: "Viral Moment",
      subtitle: `A post reached ${viralPost.like_count?.toLocaleString()} likes`,
      date: viralPost.created_at,
      gradient: "from-emerald-500/20 to-teal-500/20",
      accent: "#34d399",
    });
  }

  /* ── Community Builder (>100 followers) ──────────────── */
  if ((userProfile?.followers ?? 0) >= 100) {
    milestones.push({
      id: "community",
      icon: <Users className="h-4 w-4" />,
      title: "Community Builder",
      subtitle: `Growing a community of ${(userProfile?.followers ?? 0).toLocaleString()}+ followers`,
      gradient: "from-indigo-500/20 to-purple-500/20",
      accent: "#818cf8",
    });
  }

  /* ── Active Creator (>10 posts) ──────────────────────── */
  if (posts.length >= 10) {
    milestones.push({
      id: "prolific",
      icon: <Award className="h-4 w-4" />,
      title: "Active Creator",
      subtitle: `Published ${posts.length} creations`,
      gradient: "from-orange-500/20 to-amber-500/20",
      accent: "#fb923c",
    });
  }

  if (milestones.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-[20px] float"
          style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.2)" }}>
          <Calendar className="h-7 w-7 text-purple-400" />
        </div>
        <p className="font-display text-[15px] font-bold text-white">No milestones yet</p>
        <p className="text-[12px] text-white/40 max-w-[200px]">Achievements will appear here as you grow.</p>
      </div>
    );
  }

  /* Sort by date descending (most recent first) */
  const sorted = milestones.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return (
    <div className="relative">
      {/* Vertical line */}
      <div
        className="absolute left-[23px] top-0 bottom-4 w-px"
        style={{ background: "linear-gradient(to bottom, rgba(168,85,247,0.4), rgba(59,130,246,0.1))" }}
      />

      <div className="space-y-4">
        {sorted.map((milestone, i) => (
          <motion.div
            key={milestone.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: i * 0.06 }}
            className="flex gap-4 relative"
          >
            {/* Icon node */}
            <div
              className="relative z-10 grid h-12 w-12 shrink-0 place-items-center rounded-[14px]"
              style={{
                background: `linear-gradient(135deg, ${milestone.accent}22, ${milestone.accent}11)`,
                border: `1px solid ${milestone.accent}33`,
                color: milestone.accent,
              }}
            >
              {milestone.icon}
            </div>

            {/* Content card */}
            <div
              className="flex-1 rounded-[18px] p-3.5 min-w-0"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] font-bold text-white leading-tight">{milestone.title}</p>
                {milestone.date && (
                  <span className="shrink-0 text-[10px] text-white/35 mt-0.5">
                    {formatDate(milestone.date)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11.5px] text-white/45 leading-relaxed">{milestone.subtitle}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString([], { month: "short", year: "numeric" });
}
