/**
 * xAI (Grok) Fast-vs-Smart auto-router.
 *
 * Default: Grok Fast (cheap, low-latency) for chat, greetings, short
 * questions, casual conversation.
 *
 * Auto-switch to Grok Smart when the prompt looks like heavy reasoning,
 * coding, debugging, deep analysis, cinematic prompting, math, or when
 * the conversation context gets long.
 *
 * This sits OUTSIDE the existing OpenAI `routeModel` so we can layer it on
 * without disturbing plan-tier/abuse logic. The chat route calls this only
 * when Grok is available; otherwise it falls back to the OpenAI router.
 */

/** Keywords that flip routing to the smart model. Matches the product spec. */
const HEAVY_PATTERNS: RegExp[] = [
  /\b(analy[sz]e|analysis|reason(ing)?|deep(ly)?|step[\s-]by[\s-]step)\b/i,
  /\b(debug|debugging|fix\s+(this|the)\s+(bug|error)|stack\s*trace)\b/i,
  /\b(code|function|class|api|script|program|implement|refactor|algorithm|architecture)\b/i,
  /\b(complex|complicated|intricate|in[\s-]depth|comprehensive|thorough)\b/i,
  /\b(cinematic|storyboard|shot\s+list|scene\s+breakdown|director|cinematograph)\b/i,
  /\b(math|equation|derive|theorem|proof|calculate|formula)\b/i,
  /\b(explain\s+(deeply|in\s+detail|thoroughly|why|how))\b/i,
  /```/, // any fenced code block in the prompt
];

/** Short, casual messages — keep on the fast model even if a heavy word slips in. */
const TRIVIAL_PATTERNS: RegExp[] = [
  /^(hi|hello|hey|yo|sup|hola|thanks?|thank\s+you|ok(ay)?|sure|yes|no|cool|nice|great|awesome|lol|haha|gm|gn)[?.!\s]*$/i,
];

export type XaiTier = "fast" | "smart";

export interface XaiRouteInput {
  prompt:     string;
  historyLen: number;     // number of user turns so far
  totalChars: number;     // total chars across all history (context size signal)
  hasHeavyAttachment?: boolean; // e.g. video/audio/code file
}

export interface XaiRouteOutput {
  tier:   XaiTier;
  reason: string;
}

export function routeXai(input: XaiRouteInput): XaiRouteOutput {
  const { prompt, historyLen, totalChars, hasHeavyAttachment } = input;
  const trimmed = prompt.trim();

  // Trivial pleasantries → always fast.
  if (trimmed.length <= 60 && TRIVIAL_PATTERNS.some((re) => re.test(trimmed))) {
    return { tier: "fast", reason: "trivial" };
  }

  // Big single prompt (long question, pasted doc) → smart.
  if (trimmed.length >= 600) {
    return { tier: "smart", reason: "long-prompt" };
  }

  // Big rolling context → smart.
  if (totalChars >= 6000 || historyLen >= 12) {
    return { tier: "smart", reason: "long-context" };
  }

  // Heavy attachments (video, audio, multi-image) → smart.
  if (hasHeavyAttachment) {
    return { tier: "smart", reason: "heavy-attachment" };
  }

  // Keyword signals → smart.
  for (const re of HEAVY_PATTERNS) {
    if (re.test(prompt)) return { tier: "smart", reason: "keyword" };
  }

  return { tier: "fast", reason: "default" };
}
