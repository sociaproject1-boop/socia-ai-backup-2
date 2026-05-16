/**
 * AI Plan client — completely separate from creator billing.
 *
 * Fetches the user's AI subscription plan and usage stats from the API,
 * and exposes them via a Zustand store for use in SociaGPT components.
 */
import { create } from "zustand";
import { supabase } from "./supabase";

export type AIPlanCode = "free" | "premium" | "ultra";

export interface AIPlan {
  code:         AIPlanCode;
  label:        string;
  model:        string;
  dailyLimit:   number | null;
  monthlyLimit: number | null;
  cooldownSec:  number;
  maxWords:     number;
  maxMessages:  number;
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
  code:         "free",
  label:        "Free AI",
  model:        "gpt-4o-mini",
  dailyLimit:   15,
  monthlyLimit: null,
  cooldownSec:  20,
  maxWords:     300,
  maxMessages:  1,
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
    // Debounce: don't re-fetch if we fetched within 30 seconds
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

/* ── Plan catalog (for UI rendering without API call) ─────────────────── */

export interface AIPlanOption {
  code:        AIPlanCode;
  label:       string;
  price_php:   number;
  period:      string | null;
  model:       string;
  dailyLimit:  number | null;
  monthlyLimit: number | null;
  cooldownSec: number;
  maxWords:    number;
  features:    string[];
  badge:       string;
  gradient:    string;
}

export const AI_PLAN_OPTIONS: AIPlanOption[] = [
  {
    code:         "free",
    label:        "Free AI",
    price_php:    0,
    period:       null,
    model:        "GPT-4o Mini",
    dailyLimit:   15,
    monthlyLimit: null,
    cooldownSec:  20,
    maxWords:     300,
    features: [
      "15 messages per day",
      "GPT-4o Mini model",
      "20-second cooldown",
      "Max 300 words per message",
      "Basic conversations",
      "Image attachments",
    ],
    badge:    "Free AI",
    gradient: "from-white/10 to-white/5",
  },
  {
    code:         "premium",
    label:        "Premium AI",
    price_php:    299,
    period:       "month",
    model:        "GPT-4o",
    dailyLimit:   null,
    monthlyLimit: 300,
    cooldownSec:  8,
    maxWords:     4000,
    features: [
      "300 messages per month",
      "GPT-4o model",
      "8-second cooldown",
      "Max 4,000 words per message",
      "Image, audio & video attachments",
      "Faster responses",
      "Medium queue priority",
    ],
    badge:    "Premium AI",
    gradient: "from-fuchsia-600/30 to-pink-600/20",
  },
  {
    code:         "ultra",
    label:        "Ultra Pro",
    price_php:    999,
    period:       "month",
    model:        "o1-mini",
    dailyLimit:   null,
    monthlyLimit: 120,
    cooldownSec:  20,
    maxWords:     8000,
    features: [
      "120 ultra requests per month",
      "o1-mini reasoning model",
      "Advanced reasoning & analysis",
      "Max 8,000 words per message",
      "Image, audio & video attachments",
      "Business & coding workflows",
      "Top queue priority",
    ],
    badge:    "Ultra Pro",
    gradient: "from-violet-600/30 to-indigo-600/20",
  },
];

export function getPlanOption(code: AIPlanCode): AIPlanOption {
  return AI_PLAN_OPTIONS.find((p) => p.code === code) ?? AI_PLAN_OPTIONS[0]!;
}

/** Subscribe to an AI plan (mock — wire to real payment in prod). */
export async function subscribeAIPlan(
  planCode: "premium" | "ultra",
  paymentMethod = "mock",
): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = await getToken();
    if (!token) return { ok: false, error: "Not signed in" };

    const res = await fetch("/api/ai/subscribe", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ plan_code: planCode, payment_method: paymentMethod }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as { error?: string };
      return { ok: false, error: j.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Subscription failed" };
  }
}

/** Cancel current AI subscription. */
export async function cancelAIPlan(): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = await getToken();
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
