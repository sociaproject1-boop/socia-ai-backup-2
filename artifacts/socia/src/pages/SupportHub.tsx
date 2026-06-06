/**
 * SupportHub.tsx — Founding Supporter Program hub.
 * Contains community funding, creator monetization previews,
 * affiliate, seller marketplace, and creator economy roadmap.
 */
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, BadgeCheck } from "lucide-react";
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
        <div className="flex items-center gap-2">
          <div
            className="grid h-7 w-7 place-items-center rounded-lg"
            style={{ background: "linear-gradient(135deg,#a855f7,#3b82f6,#ec4899)" }}
          >
            <BadgeCheck className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold app-text leading-tight">Founding Supporter</h1>
            <p className="text-[10.5px] app-text-muted">Help build the future of creator monetization</p>
          </div>
        </div>
      </div>

      {/* Full CommunityFunding content */}
      <div className="px-4 pt-2">
        <CommunityFunding />
      </div>
    </div>
  );
}
