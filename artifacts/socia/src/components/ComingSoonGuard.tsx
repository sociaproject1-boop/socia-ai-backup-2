/**
 * ComingSoonGuard — reusable route-level lock for modules whose
 * backend/API integrations aren't production-ready yet.
 *
 * Unlocked for:
 *   1. Super-admins (JWT-based, via useAdminState)
 *   2. The platform owner (Supabase user with is_owner=true)
 */

import { useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles, Cpu } from "lucide-react";
import { useAdminState } from "@/hooks/useIsAdmin";
import { useAppStore } from "@/lib/store";

interface ScreenProps {
  title: string;
  subtitle?: string;
}

export function ComingSoonScreen({
  title,
  subtitle = "We're integrating production models and API keys. This module will unlock automatically once the backend is ready.",
}: ScreenProps) {
  const [, navigate] = useLocation();
  return (
    <div className="px-5 pb-24 pt-5">
      <button
        onClick={() => navigate("/create")}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-white/65 hover:text-white"
        style={{ touchAction: "manipulation" }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Create
      </button>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
        className="relative overflow-hidden rounded-3xl p-6"
        style={{
          background:
            "linear-gradient(135deg, rgba(124,58,237,0.10), rgba(236,72,153,0.08) 60%, rgba(59,130,246,0.06))",
          border: "1px solid rgba(139,92,246,0.32)",
          boxShadow:
            "0 20px 60px -16px rgba(99,102,241,0.45), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(168,85,247,0.45), transparent 70%)",
            filter: "blur(8px)",
          }}
        />

        <div className="relative">
          <div
            className="mb-4 grid h-14 w-14 place-items-center rounded-2xl"
            style={{
              background:
                "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
              boxShadow: "0 14px 30px -8px rgba(168,85,247,0.65)",
            }}
          >
            <Cpu className="h-6 w-6 text-white" strokeWidth={2.2} />
          </div>

          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
            style={{
              background: "rgba(251,191,36,0.14)",
              color: "#fbbf24",
              border: "1px solid rgba(251,191,36,0.32)",
            }}>
            <Sparkles className="h-3 w-3" />
            Coming Soon
          </div>

          <h1 className="font-display text-[24px] font-bold leading-tight text-white">
            {title}
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-white/65">
            {subtitle}
          </p>
        </div>
      </motion.div>
    </div>
  );
}

interface GuardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

/**
 * Wraps a route component.
 * Super-admins AND the platform owner (is_owner=true) see children.
 * Everyone else gets the Coming Soon screen.
 */
export function ComingSoonGuard({ title, subtitle, children }: GuardProps) {
  const { isAdmin, hydrated } = useAdminState();
  const isOwner = useAppStore((s) => s.user?.isOwner === true);
  const [location, navigate] = useLocation();

  const isUnlocked = isAdmin || isOwner;

  useEffect(() => {
    if (!hydrated || isUnlocked) return;
    const t = window.setTimeout(() => {
      if (window.location.pathname.endsWith(location)) navigate("/create");
    }, 2400);
    return () => window.clearTimeout(t);
  }, [hydrated, isUnlocked, location, navigate]);

  if (!hydrated) return null;
  if (!isUnlocked) return <ComingSoonScreen title={title} subtitle={subtitle} />;
  return <>{children}</>;
}
