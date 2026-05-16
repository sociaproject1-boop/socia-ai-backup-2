/**
 * Admin Analytics routes.
 * Aggregates payment_receipts data for the enterprise fraud dashboard.
 *
 * Routes:
 *   GET /admin/analytics/overview — full dashboard payload (cards + charts + alerts)
 */

import { Router, type IRouter } from "express";
import { getServiceClient, requireAdmin } from "../lib/adminAuth.js";

const router: IRouter = Router();

/* ── GET /admin/analytics/overview ───────────────────────────────────── */
router.get("/admin/analytics/overview", requireAdmin(), async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });

  // Fetch last 1000 receipts for aggregation (covers ~30 days of normal volume)
  const { data: rows, error } = await sb
    .from("payment_receipts")
    .select(`
      id, user_id, verification_status, review_status,
      fraud_score, blur_score, tamper_score, tamper_detected,
      ai_detection_score, manual_reference, image_url,
      extracted_amount, extracted_payment_method, created_at, fraud_reasons
    `)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    // 42703 / "does not exist" → migrations not yet applied; return empty scaffold
    if (error.message?.includes("does not exist") || (error as { code?: string }).code === "42703") {
      return res.json({
        _schema_warning: true,
        totals:               { total: 0, verified: 0, suspicious: 0, blocked: 0, pending_review: 0, ai_alerts: 0, duplicates: 0, tampered: 0 },
        dailyTrend:           [],
        scoreDistribution:    [],
        verificationBreakdown: [],
        recentAlerts:         [],
      });
    }
    return res.status(500).json({ code: "DB_ERROR", message: error.message });
  }

  const receipts = (rows ?? []) as {
    id:                  string;
    user_id:             string;
    verification_status: string;
    review_status:       string | null;
    fraud_score:         number | null;
    blur_score:          number | null;
    tamper_score:        number | null;
    tamper_detected:     boolean | null;
    ai_detection_score:  number | null;
    manual_reference:    string | null;
    image_url:           string;
    extracted_amount:    number | null;
    extracted_payment_method: string | null;
    created_at:          string;
    fraud_reasons:       unknown[] | null;
  }[];

  /* ── Totals ──────────────────────────────────────────────────────── */
  const total      = receipts.length;
  const verified   = receipts.filter((r) => r.verification_status === "verified").length;
  const suspicious = receipts.filter((r) => r.verification_status === "suspicious").length;
  const blocked    = receipts.filter((r) => r.verification_status === "blocked").length;
  const pending    = receipts.filter(
    (r) => (r.fraud_score ?? 0) >= 50 && (!r.review_status || r.review_status === "pending"),
  ).length;
  const aiAlerts  = receipts.filter((r) => (r.ai_detection_score ?? 0) >= 60).length;
  const duplicates = receipts.filter((r) =>
    Array.isArray(r.fraud_reasons) &&
    (r.fraud_reasons as { type?: string }[]).some(
      (f) => f.type === "duplicate_image_hash" || f.type === "duplicate_extracted_reference" || f.type === "cross_user_reference",
    ),
  ).length;
  const tampered = receipts.filter((r) => r.tamper_detected === true).length;

  /* ── 7-day daily breakdown ───────────────────────────────────────── */
  const dailyTrend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const label   = d.toLocaleDateString("en", { weekday: "short" });
    const day     = receipts.filter((r) => r.created_at.startsWith(dateStr));
    dailyTrend.push({
      date:       dateStr,
      label,
      total:      day.length,
      verified:   day.filter((r) => r.verification_status === "verified").length,
      suspicious: day.filter((r) => r.verification_status === "suspicious").length,
      blocked:    day.filter((r) => r.verification_status === "blocked").length,
    });
  }

  /* ── Fraud score distribution ────────────────────────────────────── */
  const buckets = [
    { range: "0–19",  min: 0,   max: 20,  count: 0 },
    { range: "20–39", min: 20,  max: 40,  count: 0 },
    { range: "40–59", min: 40,  max: 60,  count: 0 },
    { range: "60–79", min: 60,  max: 80,  count: 0 },
    { range: "80–99", min: 80,  max: 100, count: 0 },
    { range: "100+",  min: 100, max: Infinity, count: 0 },
  ];
  for (const r of receipts) {
    const s = r.fraud_score ?? 0;
    const b = buckets.find((b) => s >= b.min && s < b.max);
    if (b) b.count++;
  }

  /* ── Verification breakdown (pie) ────────────────────────────────── */
  const verificationBreakdown = [
    { name: "Verified",   value: verified,   color: "#10b981" },
    { name: "Suspicious", value: suspicious, color: "#f59e0b" },
    { name: "Blocked",    value: blocked,    color: "#ef4444" },
    { name: "Pending",    value: pending,    color: "#a855f7" },
  ].filter((d) => d.value > 0);

  /* ── Recent fraud alerts (top 15 by fraud score) ─────────────────── */
  const recentAlerts = receipts
    .filter((r) => (r.fraud_score ?? 0) >= 50)
    .slice(0, 15)
    .map((r) => ({
      id:                  r.id,
      user_id:             r.user_id,
      verification_status: r.verification_status,
      fraud_score:         r.fraud_score ?? 0,
      blur_score:          r.blur_score ?? 0,
      tamper_detected:     r.tamper_detected ?? false,
      ai_detection_score:  r.ai_detection_score ?? 0,
      manual_reference:    r.manual_reference,
      image_url:           r.image_url,
      extracted_amount:    r.extracted_amount,
      extracted_payment_method: r.extracted_payment_method,
      created_at:          r.created_at,
    }));

  // Batch-fetch user info for alerts
  const alertUserIds = [...new Set(recentAlerts.map((a) => a.user_id))];
  let userMap: Record<string, { username: string; name: string }> = {};
  if (alertUserIds.length > 0) {
    const { data: users } = await sb
      .from("users")
      .select("id, username, name")
      .in("id", alertUserIds);
    for (const u of users ?? []) userMap[u.id] = { username: u.username, name: u.name };
  }

  const alertsWithUsers = recentAlerts.map((a) => ({
    ...a,
    user: userMap[a.user_id] ?? null,
  }));

  return res.json({
    totals: { total, verified, suspicious, blocked, pending_review: pending, ai_alerts: aiAlerts, duplicates, tampered },
    dailyTrend,
    scoreDistribution: buckets.map(({ range, count }) => ({ range, count })),
    verificationBreakdown,
    recentAlerts: alertsWithUsers,
  });
});

/* ── GET /admin/analytics/fraud ─────────────────────────────────────── */
router.get("/admin/analytics/fraud", requireAdmin(), async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await sb
    .from("payment_receipts")
    .select("id, created_at, fraud_score, verification_status, review_status, fraud_reasons, tamper_detected, blur_score, ai_detection_score")
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: true });

  if (error) {
    if (error.message?.includes("does not exist") || (error as { code?: string }).code === "42703") {
      return res.json({
        _schema_warning: true,
        daily_trends: [], risk_distribution: { low: 0, medium: 0, high: 0, critical: 0 },
        outcome_distribution: { approved: 0, rejected: 0, suspicious: 0, blocked: 0, pending: 0 },
        top_signals: [], hourly_distribution: Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0, flagged: 0 })),
        summary: { total: 0, auto_blocked: 0, tampered: 0, high_ai_score: 0, fraud_rate: 0, reviewed: 0, review_rate: 0 },
      });
    }
    return res.status(500).json({ code: "DB_ERROR", message: error.message });
  }

  const receipts = (rows ?? []) as {
    id:                  string;
    created_at:          string;
    fraud_score:         number | null;
    verification_status: string;
    review_status:       string | null;
    fraud_reasons:       unknown[] | null;
    tamper_detected:     boolean | null;
    blur_score:          number | null;
    ai_detection_score:  number | null;
  }[];

  /* ── 30-day daily grid (all 30 slots pre-filled) ─────────────────── */
  const now = new Date();
  const dailyMap = new Map<string, {
    date: string; count: number; total_score: number;
    blocked: number; approved: number; rejected: number; suspicious: number; flagged: number;
  }>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    dailyMap.set(dateStr, { date: dateStr, count: 0, total_score: 0, blocked: 0, approved: 0, rejected: 0, suspicious: 0, flagged: 0 });
  }
  for (const r of receipts) {
    const entry = dailyMap.get(r.created_at.slice(0, 10));
    if (!entry) continue;
    entry.count++;
    entry.total_score += r.fraud_score ?? 0;
    if (r.verification_status === "blocked") entry.blocked++;
    if (r.review_status === "approved")      entry.approved++;
    if (r.review_status === "rejected")      entry.rejected++;
    if (r.review_status === "suspicious")    entry.suspicious++;
    if ((r.fraud_score ?? 0) >= 50)          entry.flagged++;
  }
  const daily_trends = Array.from(dailyMap.values()).map((d) => ({
    date:       d.date,
    label:      new Date(d.date + "T12:00:00").toLocaleDateString("en", { month: "short", day: "numeric" }),
    count:      d.count,
    avg_score:  d.count > 0 ? Math.round(d.total_score / d.count) : 0,
    blocked:    d.blocked,
    approved:   d.approved,
    rejected:   d.rejected,
    suspicious: d.suspicious,
    flagged:    d.flagged,
  }));

  /* ── Risk distribution ────────────────────────────────────────────── */
  const risk_distribution = {
    low:      receipts.filter((r) => (r.fraud_score ?? 0) <  25).length,
    medium:   receipts.filter((r) => (r.fraud_score ?? 0) >= 25 && (r.fraud_score ?? 0) < 50).length,
    high:     receipts.filter((r) => (r.fraud_score ?? 0) >= 50 && (r.fraud_score ?? 0) < 100).length,
    critical: receipts.filter((r) => (r.fraud_score ?? 0) >= 100).length,
  };

  /* ── Outcome distribution ─────────────────────────────────────────── */
  const outcome_distribution = {
    approved:   receipts.filter((r) => r.review_status === "approved").length,
    rejected:   receipts.filter((r) => r.review_status === "rejected").length,
    suspicious: receipts.filter((r) => r.review_status === "suspicious").length,
    blocked:    receipts.filter((r) => r.verification_status === "blocked").length,
    pending:    receipts.filter((r) => !r.review_status && r.verification_status !== "blocked").length,
  };

  /* ── Top fraud signals ────────────────────────────────────────────── */
  const signalMap = new Map<string, { type: string; count: number; total_points: number }>();
  for (const r of receipts) {
    if (!Array.isArray(r.fraud_reasons)) continue;
    for (const sig of r.fraud_reasons as { type?: string; points?: number }[]) {
      if (!sig.type) continue;
      const e = signalMap.get(sig.type) ?? { type: sig.type, count: 0, total_points: 0 };
      e.count++;
      e.total_points += sig.points ?? 0;
      signalMap.set(sig.type, e);
    }
  }
  const top_signals = Array.from(signalMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
    .map((s) => ({ type: s.type, count: s.count, avg_points: Math.round(s.total_points / s.count) }));

  /* ── Hourly distribution ──────────────────────────────────────────── */
  const hourly_distribution = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0, flagged: 0 }));
  for (const r of receipts) {
    const h = new Date(r.created_at).getHours();
    hourly_distribution[h].count++;
    if ((r.fraud_score ?? 0) >= 50) hourly_distribution[h].flagged++;
  }

  /* ── Summary metrics ──────────────────────────────────────────────── */
  const reviewed = receipts.filter((r) => r.review_status && !["needs_review", "pending"].includes(r.review_status)).length;
  const summary = {
    total:         receipts.length,
    auto_blocked:  receipts.filter((r) => r.verification_status === "blocked").length,
    tampered:      receipts.filter((r) => r.tamper_detected === true).length,
    high_ai_score: receipts.filter((r) => (r.ai_detection_score ?? 0) >= 60).length,
    fraud_rate:    receipts.length > 0
      ? Math.round((risk_distribution.high + risk_distribution.critical) / receipts.length * 100)
      : 0,
    reviewed,
    review_rate: receipts.length > 0 ? Math.round(reviewed / receipts.length * 100) : 0,
  };

  return res.json({ daily_trends, risk_distribution, outcome_distribution, top_signals, hourly_distribution, summary });
});

export default router;
