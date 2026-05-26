/**
 * ComingSoonGuard — reusable route-level lock for modules whose
 * backend/API integrations aren't production-ready yet.
 *
 * Two uses:
 *   1. As a *wrapper*: pass `children` and an `enabled` flag. When
 *      `enabled` is true (default: non-admin), the children never
 *      render — we show a Coming Soon screen instead. This means none
 *      of the locked page's queries, sockets, or heavy setup ever
 *      mounts, which is both safer (no leaked API calls) and lighter.
 *   2. As a *fallback*: render `<ComingSoonScreen title="…" />`
 *      directly.
 *
 * The lock is rendered as a full-page card so it slots in cleanly
 * under the app shell without disturbing the bottom nav. A clear
 * "Back to Create" action gets the user back where they came from —
 * we use `navigate("/create")` rather than `history.back()` so that
 * non-admins who land here via a deep link / refresh still get a
 * sensible destination.
 */

import { useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles, Cpu } from "lucide-react";
import { useAdminState } from "@/hooks/useIsAdmin";

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
        {/* Decorative glow blob — purely visual. */}
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
  /** Title shown on the Coming Soon screen if the user is locked out. */
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

/**
 * Wraps a route component. Admins see `children`; everyone else gets
 * the Coming Soon screen — and the wrapped component never mounts,
 * so no API calls, sockets, or render workers spin up for non-admins.
 */
export function ComingSoonGuard({ title, subtitle, children }: GuardProps) {
  const { isAdmin, hydrated } = useAdminState();
  const [location, navigate] = useLocation();

  /* Auto-redirect only after admin status is RESOLVED as non-admin.
     Without the hydration check, real admins on a deep link / refresh
     would get bounced before `adminFetchSession()` rehydrates the
     store from localStorage. */
  useEffect(() => {
    if (!hydrated || isAdmin) return;
    const t = window.setTimeout(() => {
      if (window.location.pathname.endsWith(location)) navigate("/create");
    }, 2400);
    return () => window.clearTimeout(t);
  }, [hydrated, isAdmin, location, navigate]);

  /* Hold the page invisible while we resolve admin status — prevents
     the lock screen from flashing for a real admin during bootstrap. */
  if (!hydrated) return null;
  if (!isAdmin) return <ComingSoonScreen title={title} subtitle={subtitle} />;
  return <>{children}</>;
}
