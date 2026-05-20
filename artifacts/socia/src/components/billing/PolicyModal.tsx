/**
 * Plan Policy & Fair Usage modal — premium upgrade experience.
 *
 * Design intent: feel like Apple / Stripe / Linear / Runway, not like a
 * warning popup. Spring-eased entrance, glass surface with a single
 * subtle glow (one blur layer max — stacked blurs murder mobile GPUs),
 * sticky header + sticky footer, expandable sections so the body never
 * feels like a wall of legal text.
 *
 * Animation budget:
 *   - Backdrop:  opacity only (no extra filter transition; static blur)
 *   - Sheet:    transform + opacity, spring (≈220ms perceived)
 *   - Sections: layout-animated collapse via Framer
 * GPU-friendly: transforms only, no width/height/margin animations.
 *
 * Flow:
 *   1. Parent opens with `open=true`.
 *   2. User picks language (instant, scroll preserved) and reads sections.
 *   3. User taps "Continue Secure Checkout" → `onAgree()` is awaited.
 *   4. While awaited, CTA shows a "Securing your checkout…" spinner state
 *      and inputs are locked. On success the parent navigates away; on
 *      failure the modal stays mounted with an inline error.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, Shield, Globe2, X, Film, Sparkles, Crown, Star, ChevronDown,
  Loader2, Target, Gauge, Timer, Repeat, Lock,
} from "lucide-react";
import {
  LOCALES, getPolicy, detectInitialLocale, saveLocale,
  type LocaleCode, type Policy,
} from "@/lib/i18n/policy";

export type PolicyPlanCode = "premium" | "elite" | "super_elite" | "cinematic";

interface Props {
  open:    boolean;
  plan:    PolicyPlanCode;
  /** Awaited — modal shows loading state until it resolves or rejects. */
  onAgree: () => Promise<void> | void;
  onClose: () => void;
}

const PLAN_PRICE: Record<PolicyPlanCode, string> = {
  premium:     "₱499",
  elite:       "₱999",
  super_elite: "₱1,999",
  cinematic:   "₱2,499",
};

const PLAN_NAME: Record<PolicyPlanCode, string> = {
  premium:     "Premium",
  elite:       "Elite",
  super_elite: "Super Elite",
  cinematic:   "AI Cinematic Studio",
};

const PLAN_BADGE: Record<PolicyPlanCode, string> = {
  premium:     "Monthly",
  elite:       "Monthly",
  super_elite: "Monthly",
  cinematic:   "Add-on · Monthly",
};

function planIconLg(p: PolicyPlanCode) {
  const cls = "h-5 w-5 text-white";
  switch (p) {
    case "premium":     return <Sparkles className={cls} />;
    case "elite":       return <Crown className={cls} />;
    case "super_elite": return <Star className={cls} />;
    case "cinematic":   return <Film className={cls} />;
  }
}

function planGradient(p: PolicyPlanCode): string {
  switch (p) {
    case "premium":     return "linear-gradient(135deg,#a855f7,#ec4899)";
    case "elite":       return "linear-gradient(135deg,#f59e0b,#ec4899)";
    case "super_elite": return "linear-gradient(135deg,#06b6d4,#a855f7)";
    case "cinematic":   return "linear-gradient(135deg,#ec4899,#f59e0b)";
  }
}

/** One-line teaser per section (shown when collapsed) — derived from the
 *  first bullet so we don't need a separate locale field per summary. */
function teaserOf(bullets: string[]): string {
  return bullets[0] ?? "";
}

interface SectionDef {
  key:       string;
  title:     string;
  icon:      React.ReactNode;
  bullets:   string[];
  /** Open by default — used for the most important section per plan. */
  defaultOpen?: boolean;
  /** Accent treatment for the daily-usage / what-included sections. */
  accent?:   boolean;
}

export default function PolicyModal({ open, plan, onAgree, onClose }: Props) {
  const [locale, setLocale]   = useState<LocaleCode>(() => detectInitialLocale());
  const [submitting, setSub]  = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [openSections, setOS] = useState<Record<string, boolean>>({});
  const scrollRef             = useRef<HTMLDivElement>(null);
  const sheetRef              = useRef<HTMLDivElement>(null);
  const ctaRef                = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef  = useRef<HTMLElement | null>(null);
  /** True while the component is mounted; guards async setState callers
   *  (e.g. the submit watchdog) from firing after navigation unmounts us. */
  const mountedRef            = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const policy: Policy        = useMemo(() => getPolicy(locale), [locale]);
  const content               = policy.plans[plan];

  // Reset section state when plan changes (different plans expose different
  // section sets), but NOT when locale changes — preserve scroll + state.
  // Also clear any stuck submitting/error state from a previous attempt.
  useEffect(() => {
    setOS({});
    setError(null);
    setSub(false);
  }, [plan]);

  // Reset transient state when the modal is opened fresh. Guarantees a
  // failed previous attempt can't leave submitting=true on reopen.
  useEffect(() => {
    if (open) {
      setSub(false);
      setError(null);
    }
  }, [open]);

  // Lock body scroll while open (without layout shift on iOS Safari we'd
  // need scrollbar padding, but the AMOLED background has no visible bar).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Focus management: remember what had focus, focus the primary CTA on
  // open (creator-friendly — main action is one tap away for keyboard
  // users), and restore on close. Tab cycles inside the sheet only.
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) ?? null;
    // Defer one frame so the sheet is mounted + animations have started.
    const id = requestAnimationFrame(() => ctaRef.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(id);
      previouslyFocusedRef.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  // ESC + focus-trap. Tab/Shift+Tab cycle within the sheet so keyboard
  // users can't accidentally land on background content while the modal
  // is blocking the page.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!submitting) onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = sheetRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last  = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault(); first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting]);

  const handleLocale = useCallback((code: LocaleCode) => {
    if (code === locale) return;
    setLocale(code);
    saveLocale(code);
    // Note: we intentionally do NOT scroll to top — scroll position
    // is preserved so language toggling feels instant in place.
  }, [locale]);

  const toggle = useCallback((key: string) => {
    setOS((s) => ({ ...s, [key]: !s[key] }));
  }, []);

  const handleAgree = useCallback(async () => {
    if (submitting) return;
    setError(null);
    setSub(true);

    // Watchdog: if `onAgree()` resolves without `window.location.assign`
    // actually unmounting us (the exact failure mode this guards), the
    // watchdog fires at 8s and releases the CTA so the user can retry.
    // We intentionally do NOT clear this on the success path — the
    // expected outcome is navigation, which unmounts the component and
    // the `mountedRef` guard below makes the timeout a harmless no-op.
    const watchdog = window.setTimeout(() => {
      if (mountedRef.current) setSub(false);
    }, 8000);

    try {
      await onAgree();
      // Success: leave watchdog armed; navigation should unmount us.
    } catch (e) {
      // Error path: cancel watchdog and surface inline immediately so
      // the user doesn't sit through 8s of disabled-button before retry.
      window.clearTimeout(watchdog);
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
        setSub(false);
      }
    }
  }, [onAgree, submitting]);

  // Build the section list per plan. Section order is the reading order.
  const sections: SectionDef[] = useMemo(() => {
    const s: SectionDef[] = [
      { key: "whoFor",   title: policy.ui.sectionWhoFor,   icon: <Target className="h-4 w-4" />, bullets: content.whoFor, defaultOpen: false },
    ];
    if (content.dailyUsage.length > 0) {
      s.push({ key: "daily", title: policy.ui.sectionDailyUsage, icon: <Sparkles className="h-4 w-4" />, bullets: content.dailyUsage, defaultOpen: true, accent: true });
    }
    if (content.cooldowns.length > 0) {
      s.push({ key: "cool", title: policy.ui.sectionCooldowns, icon: <Timer className="h-4 w-4" />, bullets: content.cooldowns });
    }
    if (content.cinematicIncludes?.length) {
      s.push({ key: "cinInc", title: policy.ui.sectionCinematicIncludes, icon: <Film className="h-4 w-4" />, bullets: content.cinematicIncludes, defaultOpen: true, accent: true });
    }
    if (content.cinematicRerender?.length) {
      s.push({ key: "cinRe", title: policy.ui.sectionCinematicRerender, icon: <Repeat className="h-4 w-4" />, bullets: content.cinematicRerender });
    }
    if (content.cinematicFairUse?.length) {
      s.push({ key: "cinFair", title: policy.ui.sectionCinematicFairUse, icon: <Shield className="h-4 w-4" />, bullets: content.cinematicFairUse });
    }
    s.push({ key: "soft", title: policy.ui.sectionAfterSoftLimit, icon: <Gauge className="h-4 w-4" />, bullets: content.afterSoftLimit });
    return s;
  }, [policy, content]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
          /* ONE blur layer for the entire modal — applied here only. */
          style={{ background: "rgba(0,0,0,0.74)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
          onClick={() => { if (!submitting) onClose(); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="policy-modal-title"
        >
          <motion.div
            key="sheet"
            ref={sheetRef}
            initial={{ y: 32, opacity: 0, scale: 0.985 }}
            animate={{ y: 0,  opacity: 1, scale: 1 }}
            exit={{    y: 24, opacity: 0, scale: 0.99 }}
            transition={{ type: "spring", damping: 30, stiffness: 340, mass: 0.85 }}
            onClick={(e) => e.stopPropagation()}
            className="card-premium relative flex w-full max-w-md flex-col overflow-hidden rounded-t-[28px] sm:rounded-[28px]"
            style={{
              maxHeight: "92dvh",
              willChange: "transform, opacity",
              transform: "translateZ(0)",  // promote to its own GPU layer
            }}
          >
            {/* Subtle glow accent — a radial gradient, NOT a blurred element.
                Avoids a second blur layer (mobile GPU overdraw). */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-40"
              style={{
                background: `radial-gradient(120% 100% at 50% 0%, ${plan === "premium" ? "rgba(168,85,247,0.55)" : plan === "elite" ? "rgba(245,158,11,0.5)" : plan === "super_elite" ? "rgba(6,182,212,0.5)" : "rgba(236,72,153,0.55)"} 0%, transparent 65%)`,
              }}
            />

            {/* ====== STICKY HEADER ====== */}
            {/* Solid translucent background (no backdrop blur) so we stay
                at one blur layer total — see backdrop above. */}
            <div
              className="sticky top-0 z-10 border-b border-white/10 px-5 pt-4 pb-3"
              style={{ background: "rgba(12,12,18,0.96)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] app-text-muted">
                    <Shield className="h-3 w-3" />
                    <span>{policy.ui.stepIndicator}</span>
                  </div>
                  <h2 id="policy-modal-title" className="mt-1 text-[15px] font-black app-text leading-tight">
                    {policy.ui.title}
                  </h2>
                </div>
                <button
                  onClick={() => { if (!submitting) onClose(); }}
                  disabled={submitting}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full app-surface disabled:opacity-40"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Plan badge + price */}
              <div className="mt-3 flex items-center gap-3 rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl shadow-lg"
                  style={{ background: planGradient(plan), boxShadow: "0 8px 24px -10px rgba(168,85,247,0.6)" }}
                >
                  {planIconLg(plan)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-widest app-text-muted">{PLAN_BADGE[plan]}</div>
                  <div className="text-sm font-black app-text leading-tight truncate">{PLAN_NAME[plan]}</div>
                </div>
                <div className="text-right">
                  <div className="text-base font-black app-text leading-none">{PLAN_PRICE[plan]}</div>
                  <div className="text-[10px] app-text-muted mt-0.5">/ month</div>
                </div>
              </div>

              {/* Language pills — instant, in-place */}
              <div className="mt-3 flex items-center gap-1.5">
                <Globe2 className="h-3.5 w-3.5 app-text-muted flex-shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-widest app-text-muted flex-shrink-0 mr-1">
                  {policy.ui.languageLabel}
                </span>
                <div className="flex flex-1 gap-1 overflow-x-auto no-scrollbar">
                  {LOCALES.map((l) => {
                    const active = l.code === locale;
                    return (
                      <button
                        key={l.code}
                        onClick={() => handleLocale(l.code)}
                        disabled={submitting}
                        className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-40 ${active ? "text-white" : "app-text-muted hover:app-text"}`}
                        style={active ? { background: planGradient(plan) } : { background: "rgba(255,255,255,0.05)" }}
                        aria-pressed={active}
                      >
                        {l.nativeLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ====== SCROLLABLE BODY ====== */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-2.5"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <p className="text-xs app-text-muted leading-relaxed px-1">{policy.ui.subtitle}</p>

              {sections.map((s) => (
                <ExpandableSection
                  key={s.key}
                  section={s}
                  expanded={openSections[s.key] ?? s.defaultOpen ?? false}
                  onToggle={() => toggle(s.key)}
                  learnMore={policy.ui.learnMore}
                  showLess={policy.ui.showLess}
                />
              ))}

              {/* Global fair usage — collapsed by default; tappable. */}
              <ExpandableSection
                section={{
                  key:     "global",
                  title:   policy.ui.sectionGlobalFairUsage,
                  icon:    <Shield className="h-4 w-4" />,
                  bullets: policy.global.paragraphs,
                }}
                expanded={openSections["global"] ?? false}
                onToggle={() => toggle("global")}
                learnMore={policy.ui.learnMore}
                showLess={policy.ui.showLess}
                paragraphMode
                heading={policy.global.title}
              />

              <div className="flex items-center justify-center gap-1.5 pt-2 pb-1 text-[10px] app-text-muted">
                <Lock className="h-3 w-3" />
                <span>{policy.ui.proceedingTo}</span>
              </div>
            </div>

            {/* ====== STICKY FOOTER ====== */}
            {/* Solid translucent — no backdrop blur (one blur layer rule). */}
            <div
              className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-white/10 px-5 py-3.5"
              style={{ background: "rgba(12,12,18,0.97)" }}
            >
              {error && (
                <div className="rounded-xl px-3 py-2 text-xs text-rose-200" style={{ background: "rgba(244,63,94,0.12)", border: "1px solid rgba(244,63,94,0.3)" }}>
                  {error}
                </div>
              )}
              <button
                ref={ctaRef}
                onClick={handleAgree}
                disabled={submitting}
                className="relative w-full overflow-hidden rounded-2xl py-3 text-sm font-black text-white transition active:scale-[0.985] disabled:opacity-90"
                style={{ background: planGradient(plan), boxShadow: "0 12px 32px -10px rgba(168,85,247,0.5)" }}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {submitting ? (
                    <motion.span
                      key="loading"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.16 }}
                      className="flex items-center justify-center gap-2"
                    >
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{policy.ui.securing}</span>
                    </motion.span>
                  ) : (
                    <motion.span
                      key="cta"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.16 }}
                      className="flex items-center justify-center gap-1.5"
                    >
                      <Lock className="h-3.5 w-3.5" />
                      <span>{policy.ui.agree}</span>
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
              <button
                onClick={() => { if (!submitting) onClose(); }}
                disabled={submitting}
                className="w-full rounded-2xl py-2.5 text-sm font-bold app-text-muted disabled:opacity-40"
              >
                {policy.ui.cancel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Expandable section — icon + title + teaser, taps to reveal bullets.
// Uses Framer's `animate` on a fixed-height-free div via `height: auto`
// trick (initial=0 → animate=auto). Cheap enough on mobile because the
// content layer is small.
// ─────────────────────────────────────────────────────────────────────
interface ExpandableProps {
  section:       SectionDef;
  expanded:      boolean;
  onToggle:      () => void;
  learnMore:     string;
  showLess:      string;
  /** Render bullets as paragraphs (used for the global fair-usage block). */
  paragraphMode?: boolean;
  /** Optional heading shown above the paragraphs when paragraphMode. */
  heading?:      string;
}

function ExpandableSection({ section, expanded, onToggle, learnMore, showLess, paragraphMode, heading }: ExpandableProps) {
  const { title, icon, bullets, accent } = section;
  if (bullets.length === 0) return null;

  return (
    <div
      className="rounded-2xl border border-white/10 overflow-hidden"
      style={{ background: "rgba(255,255,255,0.025)" }}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition active:bg-white/5"
        aria-expanded={expanded}
      >
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ background: accent ? "rgba(236,72,153,0.14)" : "rgba(255,255,255,0.06)", color: accent ? "rgb(244,114,182)" : "rgb(226,232,240)" }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-black app-text leading-tight">{title}</div>
          {!expanded && (
            <div className="mt-0.5 truncate text-[11px] app-text-muted leading-snug">
              {paragraphMode ? heading : teaserOf(bullets)}
            </div>
          )}
          {expanded && (
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: accent ? "rgb(244,114,182)" : "rgb(148,163,184)" }}>
              {showLess}
            </div>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 app-text-muted transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
        {!expanded && (
          <span className="sr-only">{learnMore}</span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="expand"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div className="px-3.5 pb-3.5 pt-1">
              {paragraphMode ? (
                <div className="space-y-2">
                  {heading && <div className="text-[12px] font-black app-text">{heading}</div>}
                  {bullets.map((p, i) => (
                    <p key={i} className="text-[12px] app-text-muted leading-relaxed">{p}</p>
                  ))}
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] app-text leading-snug">
                      <Check className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${accent ? "text-fuchsia-300" : "text-emerald-400"}`} />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
