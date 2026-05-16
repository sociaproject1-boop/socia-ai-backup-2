interface Quota {
  count: number;
  date: string; // YYYY-MM-DD
}

const store = new Map<string, Quota>();

export const LIMITS: Record<"free" | "premium", number> = {
  free: 10,
  premium: 200, // daily fair-use cap
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function checkQuota(
  userId: string,
  plan: "free" | "premium",
): { allowed: boolean; remaining: number; limit: number } {
  const d = today();
  const q = store.get(userId);
  const used = q?.date === d ? q.count : 0;
  const limit = LIMITS[plan] ?? LIMITS.free;
  return { allowed: used < limit, remaining: Math.max(0, limit - used), limit };
}

export function consumeQuota(userId: string, plan: "free" | "premium"): void {
  const d = today();
  const q = store.get(userId);
  const count = (q?.date === d ? q.count : 0) + 1;
  store.set(userId, { count, date: d });
}
