/**
 * AI Plan client — 4-tier subscription system.
 *
 * Fetches the user's AI subscription plan and usage stats from the API,
 * and exposes them via a Zustand store for use in SociaGPT components.
 *
 * Plans: free | premium | elite | super-elite
 */
import { create } from "zustand";
import { supabase } from "./supabase";

export type AIPlanCode = "free" | "premium" | "elite" | "super-elite";

export interface AIPlan {
  code:             AIPlanCode;
  label:            string;
  brandedModel?:    string;
  model:            string;
  dailyLimit:       number | null;
  monthlyLimit:     number | null;
  cooldownSec:      number;
  maxWords:         number;
  maxMessages:      number;
  maxOutputTokens?: number;
}

export interface AIUsage {
  used:    number;
  limit:   number;
  period:  "daily" | "monthly";
  resetAt: string;
}

export interface AIPlanState {
  plan:        AIPlan | null;
  usage:       AIUsage | null;
  loading:     boolean;
  error:       string | null;
  lastFetched: number | null;

  refresh: () => Promise<void>;
  reset:   () => void;
}

const DEFAULT_FREE_PLAN: AIPlan = {
  code:          "free",
  label:         "Free",
  brandedModel:  "Standard AI",
  model:         "gpt-4o-mini",
  dailyLimit:    30,
  monthlyLimit:  null,
  cooldownSec:   15,
  maxWords:      300,
  maxMessages:   10,
};

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function apiFetch<T>(path: string, token: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(path, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

export const useAIPlanStore = create<AIPlanState>((set, get) => ({
  plan:        null,
  usage:       null,
  loading:     false,
  error:       null,
  lastFetched: null,

  refresh: async () => {
    const { lastFetched, loading } = get();
    if (loading) return;
    if (lastFetched && Date.now() - lastFetched < 30_000) return;

    set({ loading: true, error: null });
    try {
      const token = await getToken();
      if (!token) {
        set({ plan: DEFAULT_FREE_PLAN, usage: null, loading: false, lastFetched: Date.now() });
        return;
      }

      const [planRes, usageRes] = await Promise.allSettled([
        apiFetch<{ plan: AIPlan }>("/api/ai/plan", token),
        apiFetch<{ plan: AIPlan; usage: AIUsage }>("/api/ai/usage", token),
      ]);

      const plan  = planRes.status  === "fulfilled" ? planRes.value.plan   : DEFAULT_FREE_PLAN;
      const usage = usageRes.status === "fulfilled" ? usageRes.value.usage : null;

      set({ plan, usage, loading: false, lastFetched: Date.now() });
    } catch (err) {
      set({
        plan: DEFAULT_FREE_PLAN,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load AI plan",
        lastFetched: Date.now(),
      });
    }
  },

  reset: () => set({ plan: null, usage: null, loading: false, error: null, lastFetched: null }),
}));

/* ── Plan catalog (for UI rendering) ─────────────────────────────── */

export interface AIPlanOption {
  code:           AIPlanCode;
  label:          string;
  brandedModel:   string;
  price_php:      number;
  price_usd:      number;
  period:         string | null;
  dailyLimit:     number | null;
  monthlyLimit:   number | null;
  cooldownSec:    number;
  maxWords:       number;
  features:       string[];
  highlight?:     string;
}

export const AI_PLAN_OPTIONS: AIPlanOption[] = [
  {
    code:          "free",
    label:         "Free",
    brandedModel:  "Standard AI",
    price_php:     0,
    price_usd:     0,
    period:        null,
    dailyLimit:    30,
    monthlyLimit:  null,
    cooldownSec:   15,
    maxWords:      300,
    features: [
      "30 messages per day",
      "Standard AI model",
      "15s cooldown",
      "Image attachments",
    ],
  },
  {
    code:          "premium",
    label:         "Premium",
    brandedModel:  "Advanced AI",
    price_php:     499,
    price_usd:     9.99,
    period:        "month",
    dailyLimit:    150,
    monthlyLimit:  null,
    cooldownSec:   3,
    maxWords:      4000,
    features: [
      "150 messages / day",
      "Advanced AI model",
      "3s soft cooldown",
      "4,000 word messages",
      "All attachments (image, audio, video)",
      "20 AI images + 5 videos / day",
    ],
  },
  {
    code:          "elite",
    label:         "Elite",
    brandedModel:  "Elite AI",
    price_php:     1499,
    price_usd:     24.99,
    period:        "month",
    dailyLimit:    300,
    monthlyLimit:  null,
    cooldownSec:   1,
    maxWords:      8000,
    highlight:     "Most Popular",
    features: [
      "300 messages / day",
      "Elite AI with advanced reasoning",
      "Near-zero cooldown",
      "8,000 word messages",
      "All attachments",
      "50 AI images + 15 videos / day",
      "Deep analysis, coding & research",
    ],
  },
  {
    code:          "super-elite",
    label:         "Super Elite",
    brandedModel:  "Pro Reasoning",
    price_php:     3999,
    price_usd:     69,
    period:        "month",
    dailyLimit:    500,
    monthlyLimit:  null,
    cooldownSec:   0,
    maxWords:      16000,
    highlight:     "Maximum Power",
    features: [
      "500 messages / day",
      "Pro Reasoning — most powerful AI",
      "Instant · zero cooldown",
      "16,000 word messages",
      "All attachments",
      "10 premium images + 5 HD videos / day",
      "Highest queue priority",
      "Ultra-deep reasoning & coding",
    ],
  },
];

export function getPlanOption(code: AIPlanCode): AIPlanOption {
  return AI_PLAN_OPTIONS.find((p) => p.code === code) ?? AI_PLAN_OPTIONS[0]!;
}

/** Submit a subscription request with payment reference. */
export async function subscribeAIPlan(
  planCode: Exclude<AIPlanCode, "free">,
  paymentReference?: string,
): Promise<{ ok: boolean; status?: string; message?: string; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return { ok: false, error: "Not signed in" };

    const res = await fetch("/api/ai/subscribe", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        plan_code:          planCode,
        payment_reference:  paymentReference,
      }),
    });

    const j = await res.json().catch(() => ({})) as Record<string, unknown>;

    if (res.status === 202) {
      // Payment reference required — not an error
      return { ok: true, status: "pending_payment", message: j.message as string };
    }
    if (!res.ok) {
      return { ok: false, error: (j.error as string) ?? `HTTP ${res.status}` };
    }
    return { ok: true, status: j.status as string, message: j.message as string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Subscription failed" };
  }
}

/** Cancel current AI subscription. */
export async function cancelAIPlan(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return { ok: false, error: "Not signed in" };

    const res = await fetch("/api/ai/cancel", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as { error?: string };
      return { ok: false, error: j.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Cancellation failed" };
  }
}
