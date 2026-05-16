/**
 * Smart AI Model Router
 *
 * Users feel unlimited premium access — the router silently picks the
 * cheapest model that can satisfy the request. This protects API costs
 * without users ever noticing a downgrade.
 *
 * Routing ladder (cheapest → most expensive):
 *   gpt-4o-mini  →  gpt-4o  →  o1-mini
 *
 * Decision factors:
 *   1. Plan tier (ceiling model)
 *   2. Prompt complexity score (length, keywords, reasoning signals)
 *   3. Abuse score (abusive users get silently downgraded)
 *   4. History depth (long conversations need stronger models)
 */
import type { AIPlan } from "./aiSubscription.js";

/* ── Models ──────────────────────────────────────────────────────────── */
export const MODELS = {
  MINI:     "gpt-4o-mini",
  STANDARD: "gpt-4o",
  ADVANCED: "o1-mini",
} as const;

export type ModelChoice = typeof MODELS[keyof typeof MODELS];

/* ── Complexity signals ──────────────────────────────────────────────── */

/** Keywords that indicate the user wants deep reasoning / analysis. */
const COMPLEX_SIGNALS = [
  /\b(analyz|reason|explain\s+why|step[\s-]by[\s-]step|compare|contrast|critique|evaluate|pros?\s+and\s+cons?|debug|refactor|architect|design\s+system|algorithm|optimiz|mathemat|deriv|proof|theorem|hypothesis|research|essay|technical|engineering)\b/i,
  /\b(write\s+(a\s+)?(?:detailed|comprehensive|in[\s-]depth|complete|thorough|long|full))\b/i,
  /\b(code|function|class|api|script|program|implement|build\s+a|create\s+a\s+(?:full|complete|production))\b/i,
  /\b(translate|summarize.*into|convert.*to|extract.*from)\b/i,
];

/** Keywords indicating simple/casual requests → cheap model fine. */
const SIMPLE_SIGNALS = [
  /^(hi|hello|hey|what['']?s? up|how are you|thanks?|okay|ok|sure|yes|no|lol|haha|nice|cool|good|great|awesome)[?.!]?\s*$/i,
  /^(caption|hashtag|rewrite this|make it shorter|fix typos?|emoji)\b/i,
];

/** Rough token estimate from characters. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/* ── Main routing function ───────────────────────────────────────────── */

interface RouterInput {
  plan:        AIPlan;
  prompt:      string;   // last user message content
  historyLen:  number;   // number of past turns
  abuseScore:  number;   // 0–100 from aiAbuseGuard
}

interface RouterOutput {
  model:    ModelChoice;
  reason:   string;   // internal label (for logging)
  degraded: boolean;  // true if silently downgraded from plan ceiling
}

export function routeModel(input: RouterInput): RouterOutput {
  const { plan, prompt, historyLen, abuseScore } = input;
  const planCode = plan.code;

  // ── Free plan: always mini, no routing needed ─────────────────────
  if (planCode === "free") {
    return { model: MODELS.MINI, reason: "free-plan", degraded: false };
  }

  // ── Compute complexity score (0–10) ──────────────────────────────
  let complexity = 0;

  // Length factor
  const tokens = estimateTokens(prompt);
  if (tokens > 800)       complexity += 4;
  else if (tokens > 300)  complexity += 2;
  else if (tokens > 80)   complexity += 1;

  // Keyword signals
  for (const re of COMPLEX_SIGNALS) {
    if (re.test(prompt)) { complexity += 3; break; }
  }
  const isSimple = SIMPLE_SIGNALS.some((re) => re.test(prompt.trim()));
  if (isSimple) complexity = Math.max(0, complexity - 4);

  // History depth boosts complexity (long conversations benefit from smarter model)
  if (historyLen > 15) complexity += 2;
  else if (historyLen > 7) complexity += 1;

  complexity = Math.min(10, complexity);

  // ── Abuse degradation ─────────────────────────────────────────────
  // High-abuse users get silently routed down without any visible error.
  let abuseDowngrade = 0;
  if (abuseScore >= 70)      abuseDowngrade = 2; // drop 2 tiers
  else if (abuseScore >= 45) abuseDowngrade = 1; // drop 1 tier

  // ── Plan routing matrix ───────────────────────────────────────────
  //
  //   Complexity:  0-2 (simple)  3-5 (normal)  6-8 (complex)  9-10 (deep)
  //   Premium  →   mini           standard       standard        standard
  //   Elite    →   mini           standard       standard        advanced
  //   SuperElt →   standard       standard       advanced        advanced
  //

  let tier: 0 | 1 | 2; // 0=mini, 1=standard, 2=advanced

  if (planCode === "premium") {
    tier = complexity <= 2 ? 0 : 1;
  } else if (planCode === "elite") {
    tier = complexity <= 2 ? 0 : complexity <= 8 ? 1 : 2;
  } else {
    // super-elite
    tier = complexity <= 2 ? 1 : 2;
  }

  // Apply abuse downgrade
  tier = Math.max(0, tier - abuseDowngrade) as 0 | 1 | 2;

  const MODEL_MAP: Record<0 | 1 | 2, ModelChoice> = {
    0: MODELS.MINI,
    1: MODELS.STANDARD,
    2: MODELS.ADVANCED,
  };

  const ceilingTier: 0 | 1 | 2 =
    planCode === "premium"     ? 1 :
    planCode === "elite"       ? 2 :
    /* super-elite */            2;

  const finalTier   = Math.min(tier, ceilingTier) as 0 | 1 | 2;
  const model       = MODEL_MAP[finalTier];
  const degraded    = abuseDowngrade > 0;
  const reason      = `plan:${planCode} complexity:${complexity} tier:${finalTier}${degraded ? " (abuse-degraded)" : ""}`;

  return { model, reason, degraded };
}

/* ── Output token limits per plan ────────────────────────────────────── */

export function getMaxOutputTokens(plan: AIPlan, complexity: number): number {
  // Base limits from plan
  const base = plan.maxOutputTokens;
  // Simple prompts get slightly less (cost protection)
  if (complexity <= 2) return Math.min(base, 600);
  return base;
}

/* ── Premium error messages ──────────────────────────────────────────── */

export function getLimitMessage(
  plan: AIPlan,
  period: "daily" | "monthly",
  used: number,
  limit: number,
): string {
  const periodLabel = period === "daily" ? "today" : "this month";
  const resetLabel  = period === "daily" ? "midnight UTC" : "the start of next month";

  if (plan.code === "free") {
    return `You've had ${used} conversations today — your daily high-priority quota is paused. ` +
      `Full-speed access resets at ${resetLabel}. ` +
      `Upgrade to Premium for 150 daily messages and advanced AI.`;
  }

  return `You've reached ${used} of ${limit} ${plan.label} requests ${periodLabel}. ` +
    `Your full-speed access resets at ${resetLabel}. ` +
    `Thank you for being a Socia ${plan.label} member.`;
}

export function getCooldownMessage(sec: number, plan: AIPlan): string {
  if (plan.code === "free") {
    return `Socia GPT is optimizing your next response. Ready in ${sec}s.`;
  }
  if (sec <= 3) {
    return `Just a moment — your next response is almost ready.`;
  }
  return `Your request is queued. Ready in ${sec}s.`;
}
