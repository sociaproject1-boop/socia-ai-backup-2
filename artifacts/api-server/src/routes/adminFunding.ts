/**
 * Admin — Community Funding routes.
 *
 * GET  /admin/funding/stats              — totals snapshot
 * GET  /admin/funding/donations          — list (filterable by status)
 * POST /admin/funding/donations/:id/approve  — approve + update totals
 * POST /admin/funding/donations/:id/reject   — reject with notes
 * POST /admin/funding/goal               — update target / unlock_phase
 */

import { Router } from "express";
import { requireAdmin, getServiceClient, getAdminClaims, audit } from "../lib/adminAuth.js";

const router   = Router();
const GLOBAL_ID = "00000000-0000-0000-0000-000000000001";

function sb() {
  const c = getServiceClient();
  if (!c) throw Object.assign(new Error("Admin DB unavailable"), { status: 503 });
  return c;
}

/* ── GET /admin/funding/stats ─────────────────────────────────────── */
router.get("/admin/funding/stats", requireAdmin(), async (req, res): Promise<void> => {
  try {
    const client = sb();
    const [fundRow, pending, approved, rejected, total] = await Promise.all([
      client.from("community_funding").select("*").eq("id", GLOBAL_ID).maybeSingle(),
      client.from("funding_donations").select("id", { count: "exact", head: true }).eq("status", "pending"),
      client.from("funding_donations").select("id", { count: "exact", head: true }).eq("status", "approved"),
      client.from("funding_donations").select("id", { count: "exact", head: true }).eq("status", "rejected"),
      client.from("funding_donations").select("id", { count: "exact", head: true }),
    ]);
    res.json({
      funding:  fundRow.data,
      pending:  pending.count  ?? 0,
      approved: approved.count ?? 0,
      rejected: rejected.count ?? 0,
      total:    total.count    ?? 0,
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ code: "SERVER_ERROR", message: (err as Error).message });
  }
});

/* ── GET /admin/funding/donations ────────────────────────────────── */
router.get("/admin/funding/donations", requireAdmin(), async (req, res): Promise<void> => {
  try {
    const client  = sb();
    const status  = String(req.query["status"] ?? "pending");
    const limit   = Math.min(Number(req.query["limit"] ?? 100), 200);

    let q = client
      .from("funding_donations")
      .select(`
        id, user_id, amount, payment_method, reference_no, screenshot_url,
        status, admin_notes, created_at, approved_at,
        profiles:user_id ( username, display_name, email )
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status !== "all") q = q.eq("status", status);

    const { data, error } = await q;
    if (error) throw error;
    res.json({ donations: data ?? [] });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ code: "SERVER_ERROR", message: (err as Error).message });
  }
});

/* ── POST /admin/funding/donations/:id/approve ───────────────────── */
router.post("/admin/funding/donations/:id/approve", requireAdmin(["super_admin", "admin"]), async (req, res): Promise<void> => {
  try {
    const client   = sb();
    const c        = getAdminClaims(req)!;
    const donId    = String(req.params["id"]);
    const notes    = String(req.body?.notes ?? "").trim();

    /* Fetch donation */
    const { data: don, error: donErr } = await client
      .from("funding_donations")
      .select("id,user_id,amount,status")
      .eq("id", donId)
      .single();
    if (donErr || !don) { res.status(404).json({ code: "NOT_FOUND" }); return; }
    if (don.status !== "pending") { res.status(409).json({ code: "ALREADY_DECIDED", message: "Donation already reviewed." }); return; }

    /* Approve the donation */
    const { error: updErr } = await client
      .from("funding_donations")
      .update({ status: "approved", admin_notes: notes || null, approved_at: new Date().toISOString() })
      .eq("id", donId);
    if (updErr) throw updErr;

    /* Increment current_amount and supporters_count */
    const { data: fund } = await client
      .from("community_funding")
      .select("current_amount,supporters_count,target_amount")
      .eq("id", GLOBAL_ID)
      .single();

    if (fund) {
      const newAmount = Number(fund.current_amount) + Number(don.amount);
      const newCount  = Number(fund.supporters_count) + 1;
      await client
        .from("community_funding")
        .update({
          current_amount:   newAmount,
          supporters_count: newCount,
          is_goal_reached:  newAmount >= Number(fund.target_amount),
        })
        .eq("id", GLOBAL_ID);
    }

    await audit(c, "funding.approve", {
      req,
      targetType: "funding_donation",
      targetId:   donId,
      meta:       { amount: don.amount, notes },
    });

    res.json({ ok: true });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ code: "SERVER_ERROR", message: (err as Error).message });
  }
});

/* ── POST /admin/funding/donations/:id/reject ────────────────────── */
router.post("/admin/funding/donations/:id/reject", requireAdmin(["super_admin", "admin"]), async (req, res): Promise<void> => {
  try {
    const client = sb();
    const c      = getAdminClaims(req)!;
    const donId  = String(req.params["id"]);
    const notes  = String(req.body?.notes ?? "").trim();

    const { data: don, error: donErr } = await client
      .from("funding_donations")
      .select("id,status")
      .eq("id", donId)
      .single();
    if (donErr || !don) { res.status(404).json({ code: "NOT_FOUND" }); return; }
    if (don.status !== "pending") { res.status(409).json({ code: "ALREADY_DECIDED" }); return; }

    await client
      .from("funding_donations")
      .update({ status: "rejected", admin_notes: notes || null })
      .eq("id", donId);

    await audit(c, "funding.reject", {
      req,
      targetType: "funding_donation",
      targetId:   donId,
      meta:       { notes },
    });

    res.json({ ok: true });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ code: "SERVER_ERROR", message: (err as Error).message });
  }
});

/* ── POST /admin/funding/goal ─────────────────────────────────────── */
router.post("/admin/funding/goal", requireAdmin(["super_admin"]), async (req, res): Promise<void> => {
  try {
    const client = sb();
    const c      = getAdminClaims(req)!;
    const allowed = ["target_amount", "unlock_phase", "is_goal_reached"];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) {
      if (req.body?.[k] !== undefined) patch[k] = req.body[k];
    }
    if (Object.keys(patch).length === 0) { res.status(400).json({ code: "NO_CHANGES" }); return; }

    await client.from("community_funding").update(patch).eq("id", GLOBAL_ID);
    await audit(c, "funding.goal_update", { req, targetType: "community_funding", targetId: GLOBAL_ID, meta: patch });
    res.json({ ok: true });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ code: "SERVER_ERROR", message: (err as Error).message });
  }
});

export default router;
