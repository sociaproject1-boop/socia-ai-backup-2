/**
 * Policy translation schema.
 *
 * TypeScript enforces that every locale file exports a complete `Policy`
 * object. Adding a new field here is a compile-time error in every locale
 * until that field is translated — this is intentional. Adding a new
 * language is as simple as creating `<code>.ts` next to en/tl/ceb and
 * registering it in `index.ts`.
 */

export type LocaleCode =
  | "en"
  | "tl"   // Tagalog / Filipino
  | "ceb"  // Bisaya / Cebuano
  // Reserved for future expansion — uncomment + add file when translated:
  // | "ja" | "ko" | "es" | "ar" | "hi" | "fr" | "pt"
  ;

export interface LocaleMeta {
  code:          LocaleCode;
  /** Native-name label shown in the language picker. */
  nativeLabel:   string;
  /** English label for accessibility tooltips. */
  englishLabel:  string;
  /** Optional flag emoji or icon glyph. */
  glyph?:        string;
  /** Right-to-left layout flag (for future Arabic support). */
  rtl?:          boolean;
}

export interface PlanPolicyContent {
  /** One-line headline shown under the plan name. */
  tagline:        string;
  /** "Who it's for" / positioning bullets. */
  whoFor:         string[];
  /** Daily quota bullets — phrased generously, no "limit" wording. */
  dailyUsage:     string[];
  /** Soft-limit / fair-usage adaptive-quality bullets. */
  afterSoftLimit: string[];
  /** Cooldown bullets. */
  cooldowns:      string[];
  /** Cinematic-only: what's included. Empty array for chat plans. */
  cinematicIncludes?: string[];
  /** Cinematic-only: fair-usage rules. Empty array for chat plans. */
  cinematicFairUse?: string[];
  /** Cinematic-only: rerender allowance. */
  cinematicRerender?: string[];
}

export interface Policy {
  /** Modal chrome & control labels. */
  ui: {
    title:                  string;
    subtitle:               string;
    languageLabel:          string;
    moreLanguagesSoon:      string;
    sectionPlan:            string;
    sectionWhoFor:          string;
    sectionDailyUsage:      string;
    sectionCooldowns:       string;
    sectionAfterSoftLimit:  string;
    sectionCinematicIncludes: string;
    sectionCinematicFairUse:  string;
    sectionCinematicRerender: string;
    sectionGlobalFairUsage: string;
    agree:                  string;
    cancel:                 string;
    proceedingTo:           string;
    stepIndicator:          string;
    learnMore:              string;
    showLess:               string;
    securing:               string;
  };
  /** Global fair-usage statement shown to every user before checkout. */
  global: {
    title:      string;
    paragraphs: string[];
  };
  plans: {
    premium:     PlanPolicyContent;
    elite:       PlanPolicyContent;
    super_elite: PlanPolicyContent;
    cinematic:   PlanPolicyContent;
  };
}
