/**
 * SupportHub.tsx — Dedicated support and monetization hub.
 * Contains all community funding, creator monetization previews,
 * affiliate, seller marketplace, and analytics info.
 * Replaces those sections on the homepage — accessed via the
 * compact SupportSociaCard widget on the feed.
 */
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { CommunityFunding } from "@/components/home/CommunityFunding";

export default function SupportHub() {
  const [, navigate] = useLocation();

  return (
    <div className="app-bg min-h-[100dvh] pb-28 overflow-y-auto scroll-native hide-scrollbar">
      {/* Header */}
      <div
        className="app-header sticky top-0 z-40 flex items-center gap-3 px-4 py-3"
      >
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => navigate(-1 as any)}
          className="grid h-9 w-9 place-items-center rounded-full app-surface"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4 app-text" />
        </motion.button>
        <div>
          <h1 className="text-base font-bold app-text leading-tight">Support Hub</h1>
          <p className="text-[10.5px] app-text-muted">Help build the Socia creator economy</p>
        </div>
      </div>

      {/* Full CommunityFunding content */}
      <div className="px-4 pt-2">
        <CommunityFunding />
      </div>
    </div>
  );
}
