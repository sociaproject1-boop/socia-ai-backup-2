/**
 * Plan Policy & Fair Usage modal.
 *
 * Shown after a user taps Pay on BillingUpgrade but BEFORE the PayMongo
 * checkout session is created. The user must:
 *   1. Optionally pick a language (auto-detected on first open)
 *   2. Read the plan-specific policy + global fair-usage statement
 *   3. Tap "I Understand & Agree" to proceed
 *
 * The modal scrolls; the CTA stays sticky at the bottom so users on small
 * phones never lose the action button. Backdrop tap and "Not yet" both
 * cancel without proceeding.
 *
 * Design language:
 *   - AMOLED dark glass surface, neon purple→pink accents
 *   - Mobile-first; sticky header + sticky CTA
 *   - Clear typographic hierarchy: title / section / bullets
 *   - No "limit reached" / "blocked" wording — every line uses adaptive,
 *     creator-friendly phrasing.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Shield, Globe2, X, Film, Sparkles, Crown, Star, ChevronDown } from "lucide-react";
import {
  LOCALES, getPolicy, detectInitialLocale, saveLocale,
  type LocaleCode, type Policy,
} from "@/lib/i18n/policy";

export type PolicyPlanCode = "premium" | "elite" | "super_elite" | "cinematic";

interface Props {
  open:    boolean;
  plan:    PolicyPlanCode;
  onAgree: () => void;
  onClose: () => void;
}

const PLAN_LABEL: Record<PolicyPlanCode, string> = {
  premium:     "Premium · ₱499/mo",
  elite:       "Elite · ₱999/mo",
  super_elite: "Super Elite · ₱1,999/mo",
  cinematic:   "AI Cinematic Studio · ₱2,499/mo",
};

function planIcon(p: PolicyPlanCode) {
  switch (p) {
    case "premium":     return <Sparkles className="h-3.5 w-3.5" />;
    case "elite":       return <Crown    className="h-3.5 w-3.5 text-amber-300" />;
    case "super_elite": return <Star     className="h-3.5 w-3.5 text-cyan-300" />;
    case "cinematic":   return <Film     className="h-3.5 w-3.5 text-rose-300" />;
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

export default function PolicyModal({ open, plan, onAgree, onClose }: Props) {
  const [locale, setLocale] = useState<LocaleCode>(() => detectInitialLocale());
  const [langOpen, setLangOpen] = useState(false);
  const policy: Policy = useMemo(() => getPolicy(locale), [locale]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset scroll to top when locale changes — better reading UX.
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0, behavior: "auto" }); }, [locale]);

  // Lock body scroll while modal is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // ESC closes the modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const planContent = policy.plans[plan];
  const activeLocale = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];

  const handleLocaleChange = (code: LocaleCode) => {
    setLocale(code);
    saveLocale(code);
    setLangOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)" }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="policy-modal-title"
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="card-premium relative flex w-full max-w-md flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl"
            style={{ maxHeight: "92dvh" }}
          >
            {/* Header — sticky */}
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4" style={{ background: "rgba(10,10,15,0.92)", backdropFilter: "blur(12px)" }}>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest app-text-muted">
                  <Shield className="h-3 w-3" /> {policy.ui.title}
                </div>
                <h2 id="policy-modal-title" className="mt-0.5 text-base font-black app-text leading-tight">{policy.ui.subtitle}</h2>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full app-surface"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body — scrollable */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* Language picker */}
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest app-text-muted mb-1.5">
                  <Globe2 className="h-3 w-3" /> {policy.ui.languageLabel}
                </div>
                <div className="relative">
                  <button
                    onClick={() => setLangOpen((o) => !o)}
                    className="flex w-full items-center justify-between gap-2 rounded-2xl border border-white/10 px-3.5 py-2.5 text-sm app-text app-surface"
                    aria-expanded={langOpen}
                  >
                    <span className="flex items-center gap-2">
                      <span aria-hidden>{activeLocale.glyph}</span>
                      <span className="font-semibold">{activeLocale.nativeLabel}</span>
                    </span>
                    <ChevronDown className={`h-4 w-4 app-text-muted transition ${langOpen ? "rotate-180" : ""}`} />
                  </button>
                  <AnimatePresence>
                    {langOpen && (
                      <motion.ul
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.14 }}
                        className="absolute z-20 mt-1 w-full overflow-hidden rounded-2xl border border-white/10 app-surface shadow-xl"
                      >
                        {LOCALES.map((l) => (
                          <li key={l.code}>
                            <button
                              onClick={() => handleLocaleChange(l.code)}
                              className={`flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-sm transition hover:bg-white/5 ${l.code === locale ? "app-text" : "app-text-muted"}`}
                            >
                              <span className="flex items-center gap-2">
                                <span aria-hidden>{l.glyph}</span>
                                <span className="font-semibold">{l.nativeLabel}</span>
                                <span className="text-[10px] app-text-muted">· {l.englishLabel}</span>
                              </span>
                              {l.code === locale && <Check className="h-4 w-4 text-emerald-400" />}
                            </button>
                          </li>
                        ))}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </div>
                <div className="mt-1.5 text-[10px] app-text-muted italic">{policy.ui.moreLanguagesSoon}</div>
              </div>

              {/* Selected plan banner */}
              <div className="rounded-2xl p-3.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest app-text-muted">
                  {planIcon(plan)} {policy.ui.sectionPlan}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="text-sm font-black app-text">{PLAN_LABEL[plan]}</div>
                  <div className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white" style={{ background: planGradient(plan) }}>
                    {plan === "cinematic" ? "Add-on" : plan.replace("_", " ")}
                  </div>
                </div>
                <p className="mt-1.5 text-xs app-text-muted leading-snug">{planContent.tagline}</p>
              </div>

              {/* Who it's for */}
              <Section title={policy.ui.sectionWhoFor} bullets={planContent.whoFor} />

              {/* Daily usage (chat plans only) */}
              {planContent.dailyUsage.length > 0 && (
                <Section title={policy.ui.sectionDailyUsage} bullets={planContent.dailyUsage} accent />
              )}

              {/* Cooldowns (chat plans only) */}
              {planContent.cooldowns.length > 0 && (
                <Section title={policy.ui.sectionCooldowns} bullets={planContent.cooldowns} />
              )}

              {/* Cinematic-specific: what's included */}
              {planContent.cinematicIncludes && planContent.cinematicIncludes.length > 0 && (
                <Section title={policy.ui.sectionCinematicIncludes} bullets={planContent.cinematicIncludes} accent />
              )}

              {/* Cinematic-specific: rerender policy */}
              {planContent.cinematicRerender && planContent.cinematicRerender.length > 0 && (
                <Section title={policy.ui.sectionCinematicRerender} bullets={planContent.cinematicRerender} />
              )}

              {/* Cinematic-specific: fair use */}
              {planContent.cinematicFairUse && planContent.cinematicFairUse.length > 0 && (
                <Section title={policy.ui.sectionCinematicFairUse} bullets={planContent.cinematicFairUse} />
              )}

              {/* After soft limit — adaptive behavior */}
              <Section title={policy.ui.sectionAfterSoftLimit} bullets={planContent.afterSoftLimit} />

              {/* Global fair usage */}
              <div className="rounded-2xl border border-white/10 p-4">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest app-text-muted mb-1.5">
                  <Shield className="h-3 w-3" /> {policy.ui.sectionGlobalFairUsage}
                </div>
                <h3 className="text-sm font-black app-text mb-2">{policy.global.title}</h3>
                <div className="space-y-2 text-xs app-text-muted leading-relaxed">
                  {policy.global.paragraphs.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </div>

              <p className="text-[11px] app-text-muted text-center pt-1">{policy.ui.proceedingTo}</p>
            </div>

            {/* CTA — sticky */}
            <div className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-white/10 px-5 py-4" style={{ background: "rgba(10,10,15,0.92)", backdropFilter: "blur(12px)" }}>
              <button
                onClick={onAgree}
                className="w-full rounded-2xl py-3 text-sm font-black text-white transition active:scale-[0.98]"
                style={{ background: planGradient(plan), boxShadow: "0 12px 32px -10px rgba(168,85,247,0.5)" }}
              >
                <Check className="inline h-4 w-4 mr-1.5" /> {policy.ui.agree}
              </button>
              <button
                onClick={onClose}
                className="w-full rounded-2xl py-2.5 text-sm font-bold app-surface app-text"
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

function Section({ title, bullets, accent = false }: { title: string; bullets: string[]; accent?: boolean }) {
  if (bullets.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest app-text-muted mb-1.5">{title}</div>
      <ul className="space-y-1.5">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-sm app-text leading-snug">
            <Check className={`mt-0.5 h-4 w-4 flex-shrink-0 ${accent ? "text-fuchsia-300" : "text-emerald-400"}`} />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
