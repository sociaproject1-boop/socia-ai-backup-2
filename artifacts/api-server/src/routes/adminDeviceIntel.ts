/**
 * Device & IP Intelligence routes
 *
 * GET /admin/device-intel/overview   – repeat submitters, image hash collisions, timing clusters
 * GET /admin/device-intel/user/:id   – per-user device risk profile
 * GET /admin/ip-intel                – IP patterns from audit log
 */
import { Router } from "express";
import { getServiceClient, requireAdmin } from "../lib/adminAuth.js";
import { logger } from "../lib/logger.js";

const router = Router();

/* ── GET /admin/device-intel/overview ────────────────────────────────── */
router.get("/admin/device-intel/overview", requireAdmin(), async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });

  try {
    /* 1. Image hash collisions — same image submitted by multiple users */
    const { data: hashRows } = await sb
      .from("payment_receipts")
      .select("image_hash, user_id, fraud_score, verification_status, created_at")
      .not("image_hash", "is", null)
      .order("created_at", { ascending: false })
      .limit(2000);

    const hashMap = new Map<string, { user_id: string; fraud_score: number | null; ts: string }[]>();
    for (const r of hashRows ?? []) {
      const h = r.image_hash as string;
      if (!hashMap.has(h)) hashMap.set(h, []);
      hashMap.get(h)!.push({ user_id: r.user_id as string, fraud_score: r.fraud_score as number | null, ts: r.created_at as string });
    }
    const collisions = [...hashMap.entries()]
      .filter(([, v]) => v.length > 1)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 20)
      .map(([hash, submissions]) => ({
        hash:        hash.slice(0, 16) + "…",
        count:       submissions.length,
        unique_users: [...new Set(submissions.map((s) => s.user_id))].length,
        max_score:   Math.max(...submissions.map((s) => s.fraud_score ?? 0)),
        latest:      submissions[0]?.ts ?? "",
      }));

    /* 2. High-risk repeat submitters */
    const { data: repeatRows } = await sb
      .from("payment_receipts")
      .select("user_id, fraud_score, verification_status, review_status, created_at")
      .gte("fraud_score", 50)
      .order("created_at", { ascending: false })
      .limit(3000);

    const userMap = new Map<string, { total: number; blocked: number; flagged: number; scores: number[] }>();
    for (const r of repeatRows ?? []) {
      const uid = r.user_id as string;
      if (!userMap.has(uid)) userMap.set(uid, { total: 0, blocked: 0, flagged: 0, scores: [] });
      const entry = userMap.get(uid)!;
      entry.total++;
      if (r.verification_status === "blocked")  entry.blocked++;
      if ((r.fraud_score as number) >= 80)       entry.flagged++;
      entry.scores.push(r.fraud_score as number);
    }
    const repeatOffenders = [...userMap.entries()]
      .filter(([, v]) => v.total >= 2)
      .sort((a, b) => b[1].blocked - a[1].blocked)
      .slice(0, 30)
      .map(([userId, stats]) => ({
        user_id:   userId,
        total:     stats.total,
        blocked:   stats.blocked,
        flagged:   stats.flagged,
        avg_score: Math.round(stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length),
        max_score: Math.max(...stats.scores),
        risk:      stats.blocked >= 3 ? "critical" : stats.blocked >= 2 ? "high" : stats.flagged >= 2 ? "medium" : "low",
      }));

    /* 3. Time-of-day fraud distribution */
    const { data: timeRows } = await sb
      .from("payment_receipts")
      .select("created_at, fraud_score")
      .gte("fraud_score", 50)
      .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
      .limit(500);

    const hourBuckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
    for (const r of timeRows ?? []) {
      const h = new Date(r.created_at as string).getHours();
      hourBuckets[h]!.count++;
    }

    /* 4. Recent blocked count for stat summary */
    const { count: blockedTotal } = await sb
      .from("payment_receipts")
      .select("id", { count: "exact", head: true })
      .eq("verification_status", "blocked");

    const { count: suspiciousTotal } = await sb
      .from("payment_receipts")
      .select("id", { count: "exact", head: true })
      .gte("fraud_score", 50);

    return res.json({
      summary: {
        hash_collisions:  collisions.length,
        repeat_offenders: repeatOffenders.length,
        blocked_total:    blockedTotal ?? 0,
        suspicious_total: suspiciousTotal ?? 0,
      },
      collisions,
      repeat_offenders: repeatOffenders,
      hourly_fraud: hourBuckets,
    });
  } catch (err) {
    logger.error({ err }, "device-intel overview failed");
    return res.status(500).json({ code: "DB_ERROR", message: (err as Error).message });
  }
});

/* ── GET /admin/ip-intel ──────────────────────────────────────────────── */
router.get("/admin/ip-intel", requireAdmin(), async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });

  try {
    const { data: auditRows } = await sb
      .from("admin_audit_log")
      .select("ip, username, action, created_at, user_agent")
      .not("ip", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000);

    const ipMap = new Map<string, { logins: number; users: Set<string>; actions: string[]; latest: string; ua: string }>();
    for (const r of auditRows ?? []) {
      const ip = r.ip as string;
      if (!ipMap.has(ip)) ipMap.set(ip, { logins: 0, users: new Set(), actions: [], latest: "", ua: "" });
      const entry = ipMap.get(ip)!;
      if (r.action === "login") entry.logins++;
      if (r.username) entry.users.add(r.username as string);
      entry.actions.push(r.action as string);
      if (!entry.latest || r.created_at > entry.latest) {
        entry.latest = r.created_at as string;
        entry.ua = (r.user_agent as string) ?? "";
      }
    }

    const ipProfiles = [...ipMap.entries()]
      .sort((a, b) => b[1].logins - a[1].logins)
      .slice(0, 50)
      .map(([ip, stats]) => ({
        ip,
        logins:        stats.logins,
        unique_admins: stats.users.size,
        admins:        [...stats.users].slice(0, 5),
        latest:        stats.latest,
        risk:          stats.users.size > 2 ? "high" : stats.logins > 10 ? "medium" : "low",
        user_agent:    stats.ua.slice(0, 80),
        is_suspicious: stats.users.size > 2 || stats.logins > 15,
      }));

    /* Fraud score heatmap by region (time-zone proxy via hour patterns) */
    const { data: receiptRows } = await sb
      .from("payment_receipts")
      .select("created_at, fraud_score")
      .gte("fraud_score", 50)
      .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
      .limit(1000);

    /* Aggregate daily fraud pattern */
    const dayBuckets: Record<string, number> = {};
    for (const r of receiptRows ?? []) {
      const day = (r.created_at as string).slice(0, 10);
      dayBuckets[day] = (dayBuckets[day] ?? 0) + 1;
    }

    return res.json({
      ip_profiles: ipProfiles,
      summary: {
        unique_ips:     ipMap.size,
        suspicious_ips: ipProfiles.filter((p) => p.is_suspicious).length,
        total_logins:   auditRows?.filter((r) => r.action === "login").length ?? 0,
      },
      daily_fraud_pattern: Object.entries(dayBuckets)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-30)
        .map(([date, count]) => ({ date, count })),
    });
  } catch (err) {
    logger.error({ err }, "ip-intel failed");
    return res.status(500).json({ code: "DB_ERROR", message: (err as Error).message });
  }
});

export default router;
