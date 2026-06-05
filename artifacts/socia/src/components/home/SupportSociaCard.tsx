/**
 * SupportSociaCard — Compact floating support card for the homepage.
 * Replaces the full CommunityFunding widget on the feed.
 * Tapping opens the dedicated /support-hub page.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Heart, ChevronRight, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface FundingProgress {
  current_amount: number;
  target_amount:  number;
  supporters_count: number;
}

export function SupportSociaCard() {
  const [, navigate]  = useLocation();
  const [progress, setProgress] = useState<FundingProgress | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("community_funding")
          .select("current_amount, target_amount, supporters_count")
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!cancelled && data) setProgress(data as FundingProgress);
      } catch { /* ignore — show card without progress */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const pct = progress
    ? Math.min(100, Math.round((progress.current_amount / progress.target_amount) * 100))
    : 0;

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => navigate("/support-hub")}
      className="mx-4 mb-4 w-auto flex items-center gap-3 rounded-2xl px-4 py-3 text-left"
      style={{
        background: "linear-gradient(135deg, rgba(168,85,247,0.12) 0%, rgba(236,72,153,0.08) 100%)",
        border: "1px solid rgba(168,85,247,0.22)",
      }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Icon */}
      <div
        className="shrink-0 grid h-9 w-9 place-items-center rounded-xl"
        style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}
      >
        <Heart className="h-4 w-4 text-white" />
      </div>

      {/* Text + progress */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-purple-400" style={{ flexShrink: 0 }} />
          <p className="text-[12.5px] font-bold text-white leading-tight">Support Socia</p>
        </div>
        <p className="text-[10.5px] text-white/45 mt-0.5 leading-snug">
          Help build creator monetization & AI infrastructure
        </p>

        {/* Mini progress bar */}
        {progress && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: "linear-gradient(90deg,#a855f7,#ec4899)",
                  transition: "width 0.8s ease",
                }}
              />
            </div>
            <span className="text-[9.5px] font-bold text-purple-300 shrink-0">{pct}%</span>
          </div>
        )}
      </div>

      {/* Arrow */}
      <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "rgba(168,85,247,0.6)" }} />
    </motion.button>
  );
}
