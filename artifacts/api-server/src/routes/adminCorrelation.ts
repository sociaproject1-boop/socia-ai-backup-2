/**
 * Cross-account fraud correlation engine.
 *
 * GET /admin/correlation/velocity         — users with 3+ submissions in 24 h
 * GET /admin/correlation/coordinated      — submissions within 60 s from different users
 * GET /admin/correlation/amount-clusters  — same amount by 3+ different users
 * GET /admin/correlation/network/:userId  — all linked users for one account
 * GET /admin/correlation/overview         — summary stats for the dashboard card
 */
import { Router } from "express";
import { getServiceClient, requireAdmin } from "../lib/adminAuth.js";
import { logger } from "../lib/logger.js";

const router = Router();

/* ── Helper ───────────────────────────────────────────────────────────── */
const since = (hours: number) =>
  new Date(Date.now() - hours * 3_600_000).toISOString();

/* ── GET /admin/correlation/velocity ─────────────────────────────────── */
router.get("/admin/correlation/velocity", requireAdmin(), async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });

  try {
    const { data } = await sb
      .from("payment_receipts")
      .select("user_id, fraud_score, verification_status, created_at")
      .gte("created_at", since(24))
      .order("created_at", { ascending: false })
      .limit(5000);

    /* Group by user */
    const userMap = new Map<string, {
      total: number; blocked: number; maxScore: number;
      times: string[]; scores: number[];
    }>();

    for (const r of data ?? []) {
      const uid = r.user_id as string;
      if (!userMap.has(uid)) userMap.set(uid, { total: 0, blocked: 0, maxScore: 0, times: [], scores: [] });
      const e = userMap.get(uid)!;
      e.total++;
      if (r.verification_status === "blocked") e.blocked++;
      if ((r.fraud_score as number) > e.maxScore) e.maxScore = r.fraud_score as number;
      e.times.push(r.created_at as string);
      e.scores.push(r.fraud_score as number ?? 0);
    }

    const attackers = [...userMap.entries()]
      .filter(([, v]) => v.total >= 3)
      .map(([userId, v]) => {
        const avgScore = Math.round(v.scores.reduce((a, b) => a + b, 0) / v.scores.length);
        /* Burst detection: time between first and last submission */
        const times = v.times.map((t) => new Date(t).getTime()).sort((a, b) => a - b);
        const burstMs = times.length >= 2 ? (times[times.length - 1]! - times[0]!) : 0;
        const burstMinutes = Math.round(burstMs / 60_000);
        return {
          user_id:       userId,
          submissions:   v.total,
          blocked:       v.blocked,
          avg_score:     avgScore,
          max_score:     v.maxScore,
          burst_minutes: burstMinutes,
          risk: v.maxScore >= 90 ? "critical" : v.maxScore >= 70 ? "high" : v.blocked >= 2 ? "medium" : "low",
        };
      })
      .sort((a, b) => b.max_score - a.max_score)
      .slice(0, 50);

    return res.json({ attackers, total: attackers.length });
  } catch (err) {
    logger.error({ err }, "correlation velocity failed");
    return res.status(500).json({ code: "DB_ERROR", message: (err as Error).message });
  }
});

/* ── GET /admin/correlation/coordinated ──────────────────────────────── */
router.get("/admin/correlation/coordinated", requireAdmin(), async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });

  try {
    /* Submissions in last 48 h from high-risk users */
    const { data } = await sb
      .from("payment_receipts")
      .select("user_id, fraud_score, manual_reference, amount, created_at")
      .gte("fraud_score", 40)
      .gte("created_at", since(48))
      .order("created_at", { ascending: true })
      .limit(2000);

    const rows = (data ?? []) as Array<{
      user_id: string; fraud_score: number;
      manual_reference: string | null; amount: number | null; created_at: string;
    }>;

    /* Find pairs of different users submitting within 60 s */
    const pairs: Array<{
      user_a: string; user_b: string;
      time_diff_s: number; avg_score: number; ts: string;
    }> = [];

    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i]!; const b = rows[j]!;
        if (a.user_id === b.user_id) continue;
        const diff = Math.abs(
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        if (diff > 60_000) break; // rows are sorted by time
        pairs.push({
          user_a:     a.user_id,
          user_b:     b.user_id,
          time_diff_s: Math.round(diff / 1_000),
          avg_score:  Math.round((a.fraud_score + b.fraud_score) / 2),
          ts:         a.created_at,
        });
        if (pairs.length >= 50) break;
      }
      if (pairs.length >= 50) break;
    }

    /* Same-reference-number cross-user detection */
    const refMap = new Map<string, string[]>();
    for (const r of rows) {
      const ref = r.manual_reference;
      if (!ref) continue;
      if (!refMap.has(ref)) refMap.set(ref, []);
      const users = refMap.get(ref)!;
      if (!users.includes(r.user_id)) users.push(r.user_id);
    }
    const sharedRefs = [...refMap.entries()]
      .filter(([, users]) => users.length > 1)
      .map(([ref, users]) => ({ reference: ref, users, user_count: users.length }))
      .sort((a, b) => b.user_count - a.user_count)
      .slice(0, 20);

    return res.json({ coordinated_pairs: pairs, shared_references: sharedRefs });
  } catch (err) {
    logger.error({ err }, "correlation coordinated failed");
    return res.status(500).json({ code: "DB_ERROR", message: (err as Error).message });
  }
});

/* ── GET /admin/correlation/amount-clusters ──────────────────────────── */
router.get("/admin/correlation/amount-clusters", requireAdmin(), async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });

  try {
    const { data } = await sb
      .from("payment_receipts")
      .select("user_id, amount, fraud_score, verification_status, created_at")
      .not("amount", "is", null)
      .gte("created_at", since(30 * 24))
      .order("amount")
      .limit(3000);

    const amountMap = new Map<number, { users: Set<string>; maxScore: number; blocked: number; count: number }>();
    for (const r of data ?? []) {
      const amt = r.amount as number;
      if (!amountMap.has(amt)) amountMap.set(amt, { users: new Set(), maxScore: 0, blocked: 0, count: 0 });
      const e = amountMap.get(amt)!;
      e.users.add(r.user_id as string);
      e.count++;
      if ((r.fraud_score as number) > e.maxScore) e.maxScore = r.fraud_score as number;
      if (r.verification_status === "blocked") e.blocked++;
    }

    const clusters = [...amountMap.entries()]
      .filter(([, v]) => v.users.size >= 3)
      .map(([amount, v]) => ({
        amount,
        unique_users: v.users.size,
        total_submissions: v.count,
        max_score: v.maxScore,
        blocked: v.blocked,
        risk: v.maxScore >= 80 ? "critical" : v.users.size >= 10 ? "high" : "medium",
      }))
      .sort((a, b) => b.unique_users - a.unique_users)
      .slice(0, 30);

    return res.json({ clusters, total: clusters.length });
  } catch (err) {
    logger.error({ err }, "correlation amount-clusters failed");
    return res.status(500).json({ code: "DB_ERROR", message: (err as Error).message });
  }
});

/* ── GET /admin/correlation/network/:userId ──────────────────────────── */
router.get("/admin/correlation/network/:userId", requireAdmin(), async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });

  const { userId } = req.params;

  try {
    /* Get this user's receipts */
    const { data: myReceipts } = await sb
      .from("payment_receipts")
      .select("image_hash, manual_reference, amount, fraud_score, created_at")
      .eq("user_id", userId)
      .limit(100);

    if (!myReceipts?.length) {
      return res.json({ user_id: userId, linked_users: [], signals: [] });
    }

    const myHashes = (myReceipts as Array<{ image_hash: string | null }>)
      .map((r) => r.image_hash).filter(Boolean) as string[];
    const myRefs   = (myReceipts as Array<{ manual_reference: string | null }>)
      .map((r) => r.manual_reference).filter(Boolean) as string[];
    const myAmts   = [...new Set((myReceipts as Array<{ amount: number | null }>)
      .map((r) => r.amount).filter(Boolean) as number[])];

    /* Find users sharing any of these signals */
    const linkedMap = new Map<string, { signals: string[]; shared_count: number; max_score: number }>();

    /* Hash matches */
    if (myHashes.length > 0) {
      const { data: hashMatches } = await sb
        .from("payment_receipts")
        .select("user_id, image_hash, fraud_score")
        .in("image_hash", myHashes)
        .neq("user_id", userId)
        .limit(200);
      for (const r of hashMatches ?? []) {
        const uid = r.user_id as string;
        if (!linkedMap.has(uid)) linkedMap.set(uid, { signals: [], shared_count: 0, max_score: 0 });
        const e = linkedMap.get(uid)!;
        if (!e.signals.includes("shared_image")) e.signals.push("shared_image");
        e.shared_count++;
        if ((r.fraud_score as number) > e.max_score) e.max_score = r.fraud_score as number;
      }
    }

    /* Ref matches */
    if (myRefs.length > 0) {
      const { data: refMatches } = await sb
        .from("payment_receipts")
        .select("user_id, manual_reference, fraud_score")
        .in("manual_reference", myRefs)
        .neq("user_id", userId)
        .limit(200);
      for (const r of refMatches ?? []) {
        const uid = r.user_id as string;
        if (!linkedMap.has(uid)) linkedMap.set(uid, { signals: [], shared_count: 0, max_score: 0 });
        const e = linkedMap.get(uid)!;
        if (!e.signals.includes("shared_reference")) e.signals.push("shared_reference");
        e.shared_count++;
        if ((r.fraud_score as number) > e.max_score) e.max_score = r.fraud_score as number;
      }
    }

    /* Amount cluster matches */
    if (myAmts.length > 0) {
      const { data: amtMatches } = await sb
        .from("payment_receipts")
        .select("user_id, amount, fraud_score")
        .in("amount", myAmts.slice(0, 10))
        .neq("user_id", userId)
        .gte("fraud_score", 50)
        .limit(200);
      for (const r of amtMatches ?? []) {
        const uid = r.user_id as string;
        if (!linkedMap.has(uid)) linkedMap.set(uid, { signals: [], shared_count: 0, max_score: 0 });
        const e = linkedMap.get(uid)!;
        if (!e.signals.includes("same_amount")) e.signals.push("same_amount");
        e.shared_count++;
        if ((r.fraud_score as number) > e.max_score) e.max_score = r.fraud_score as number;
      }
    }

    const linked_users = [...linkedMap.entries()]
      .map(([uid, v]) => ({
        user_id:      uid,
        signals:      v.signals,
        shared_count: v.shared_count,
        max_score:    v.max_score,
        risk: v.signals.length >= 2 ? "critical" : v.max_score >= 70 ? "high" : "medium",
      }))
      .sort((a, b) => b.shared_count - a.shared_count)
      .slice(0, 20);

    return res.json({
      user_id:      userId,
      linked_users,
      signal_count: myHashes.length + myRefs.length,
      network_size: linked_users.length,
    });
  } catch (err) {
    logger.error({ err }, "correlation network failed");
    return res.status(500).json({ code: "DB_ERROR", message: (err as Error).message });
  }
});

/* ── GET /admin/correlation/overview ─────────────────────────────────── */
router.get("/admin/correlation/overview", requireAdmin(), async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });

  try {
    const [velRes, hashRes] = await Promise.allSettled([
      sb.from("payment_receipts").select("user_id", { count: "exact", head: true })
        .gte("created_at", since(24)),
      sb.from("payment_receipts").select("image_hash")
        .not("image_hash", "is", null)
        .gte("fraud_score", 50)
        .gte("created_at", since(48))
        .limit(2000),
    ]);

    const totalSubmissions = velRes.status === "fulfilled" ? (velRes.value.count ?? 0) : 0;
    const hashRows = hashRes.status === "fulfilled" ? (hashRes.value.data ?? []) : [];
    const hashCounts = new Map<string, number>();
    for (const r of hashRows) {
      const h = r.image_hash as string;
      hashCounts.set(h, (hashCounts.get(h) ?? 0) + 1);
    }
    const hashCollisions = [...hashCounts.values()].filter((c) => c > 1).length;

    return res.json({
      submissions_24h:     totalSubmissions,
      hash_collisions_48h: hashCollisions,
      velocity_suspects:   0, // populated by /velocity endpoint
    });
  } catch (err) {
    logger.error({ err }, "correlation overview failed");
    return res.status(500).json({ code: "DB_ERROR", message: (err as Error).message });
  }
});

export default router;
