/**
 * PayMongo Checkout integration.
 *
 *   POST /api/paymongo/checkout-session   (authed)
 *      Creates a PayMongo checkout session for a paid plan and inserts a
 *      pending row in paymongo_payments. Returns { checkout_url, ref }.
 *
 *   POST /api/paymongo/webhook            (public, HMAC-verified, raw body)
 *      PayMongo posts payment events here. Signature is HMAC-SHA256 over
 *      `${timestamp}.${rawBody}` with PAYMONGO_WEBHOOK_SECRET. Verified with
 *      crypto.timingSafeEqual. Replay window: 300s. On `checkout_session
 *      .payment.paid` (or `payment.paid`), grants the plan atomically:
 *      UPDATE ... WHERE status <> 'paid' RETURNING — duplicate deliveries
 *      cannot double-grant. processed_event_ids tracks delivered events as
 *      a secondary guard.
 *
 *   GET  /api/paymongo/payment/:ref       (authed)
 *      Polled by the success page. Returns the current status of one
 *      paymongo_payments row (scoped to the caller's user_id).
 *
 * Plan catalogue:
 *   premium      ₱499  / 4,500 credits  / 30 days   (chat)
 *   elite        ₱1499 / 9,000 credits  / 30 days   (chat)
 *   super_elite  ₱3999 / 15,000 credits / 30 days   (chat)
 *   cinematic    ₱3000 / 10 scenes      / 30 days   (parallel add-on)
 *
 * Chat plans grant credits + extend plan_expires_at (stacking on existing
 * expiry). Cinematic grants scene quota + extends cinematic_expires_at on
 * a separate parallel track so users can hold both at once.
 *
 * Env required:
 *   PAYMONGO_SECRET_KEY      (sk_live_... or sk_test_...)
 *   PAYMONGO_WEBHOOK_SECRET  (whsk_...)  — used for HMAC verification only
 */

import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { requireAuth, getAuthedUser } from "../lib/supabaseAuth.js";
import { getServiceClient } from "../lib/adminAuth.js";
import { logger } from "../lib/logger.js";

const router = Router();

/* ── Plan catalogue — server-side source of truth ─────────────────────── */
type PlanCode = "premium" | "elite" | "super_elite" | "cinematic";
type PlanKind = "chat" | "cinematic";

interface PlanDef {
  code: PlanCode;
  name: string;
  amount_centavos: number;
  duration_days: number;
  kind: PlanKind;
  /** Chat plans: credits granted. Cinematic: scenes granted. */
  credits: number;        // chat-plan credit grant (0 for cinematic)
  scenes: number;         // cinematic scene grant (0 for chat plans)
  /** users.plan_code value to set (chat plans only). */
  plan_code_db: string | null;
}

const PLANS: Record<PlanCode, PlanDef> = {
  premium:     { code: "premium",     name: "Socia Premium",          amount_centavos:  49_900, duration_days: 30, kind: "chat",      credits:  4_500, scenes:  0, plan_code_db: "premium" },
  elite:       { code: "elite",       name: "Socia Elite",            amount_centavos: 149_900, duration_days: 30, kind: "chat",      credits:  9_000, scenes:  0, plan_code_db: "elite" },
  super_elite: { code: "super_elite", name: "Socia Super Elite",      amount_centavos: 399_900, duration_days: 30, kind: "chat",      credits: 15_000, scenes:  0, plan_code_db: "super_elite" },
  cinematic:   { code: "cinematic",   name: "AI Cinematic Studio",    amount_centavos: 300_000, duration_days: 30, kind: "cinematic", credits:      0, scenes: 10, plan_code_db: null },
};

function isPlanCode(v: unknown): v is PlanCode {
  return v === "premium" || v === "elite" || v === "super_elite" || v === "cinematic";
}

/* ── PayMongo HTTP helper ─────────────────────────────────────────────── */
const PAYMONGO_API = "https://api.paymongo.com/v1";

function paymongoAuthHeader(): string {
  const key = process.env["PAYMONGO_SECRET_KEY"];
  if (!key) throw new Error("PAYMONGO_SECRET_KEY not configured");
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

async function paymongoFetch(path: string, init: RequestInit = {}): ReturnType<typeof fetch> {
  return fetch(`${PAYMONGO_API}${path}`, {
    ...init,
    headers: {
      "Authorization": paymongoAuthHeader(),
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...(init.headers || {}),
    },
  });
}

/* ── Origin helper for success/cancel URLs ────────────────────────────── */
function appOrigin(req: Request): string {
  const domains = (process.env["REPLIT_DOMAINS"] ?? "").split(",").map((d) => d.trim()).filter(Boolean);
  if (domains[0]) return `https://${domains[0]}`;
  const dev = process.env["REPLIT_DEV_DOMAIN"];
  if (dev) return `https://${dev}`;
  const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0] ?? "https";
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  return `${proto}://${host}`;
}

/* ─────────────────────────────────────────────────────────────────────────
 * POST /api/paymongo/checkout-session
 * ───────────────────────────────────────────────────────────────────── */
router.post("/paymongo/checkout-session", requireAuth, async (req: Request, res: Response) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "DB_UNAVAILABLE" });
  if (!process.env["PAYMONGO_SECRET_KEY"]) {
    return res.status(503).json({ code: "PAYMONGO_NOT_CONFIGURED" });
  }

  const planCode = String(req.body?.plan ?? "").trim();
  if (!isPlanCode(planCode)) return res.status(400).json({ code: "INVALID_PLAN" });
  const plan = PLANS[planCode];

  const user = getAuthedUser(req);
  if (!user?.id) return res.status(401).json({ code: "UNAUTHENTICATED" });

  // 1. Insert pending row first so we always have a DB record even if the
  //    PayMongo API call fails.
  const { data: row, error: insErr } = await sb
    .from("paymongo_payments")
    .insert({
      user_id: user.id,
      plan_code: plan.code,
      amount_centavos: plan.amount_centavos,
      status: "pending",
    })
    .select("id")
    .single();

  if (insErr || !row) {
    logger.error({ err: insErr }, "[paymongo] failed to insert pending row");
    return res.status(500).json({ code: "DB_INSERT_FAILED" });
  }

  const ref = row.id as string;
  const origin = appOrigin(req);
  const successUrl = `${origin}/billing/success?ref=${encodeURIComponent(ref)}`;
  const cancelUrl  = `${origin}/billing/cancelled?ref=${encodeURIComponent(ref)}`;

  // 2. Create PayMongo checkout session.
  const payload = {
    data: {
      attributes: {
        send_email_receipt: false,
        show_description: false,
        show_line_items: true,
        cancel_url: cancelUrl,
        success_url: successUrl,
        line_items: [
          {
            currency: "PHP",
            amount: plan.amount_centavos,
            name: plan.name,
            quantity: 1,
          },
        ],
        payment_method_types: ["gcash", "paymaya", "card"],
        description: `Socia ${plan.name}`,
        reference_number: ref,
        metadata: {
          ref,
          user_id: user.id,
          plan_code: plan.code,
        },
      },
    },
  };

  let pmRes: Awaited<ReturnType<typeof fetch>>;
  try {
    pmRes = await paymongoFetch("/checkout_sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (err) {
    logger.error({ err }, "[paymongo] network error creating checkout session");
    await sb.from("paymongo_payments").update({ status: "failed" }).eq("id", ref);
    return res.status(502).json({ code: "PAYMONGO_UNREACHABLE" });
  }

  const pmJson: unknown = await pmRes.json().catch(() => null);
  if (!pmRes.ok || !pmJson || typeof pmJson !== "object") {
    logger.error({ status: pmRes.status, body: pmJson }, "[paymongo] create session non-2xx");
    await sb.from("paymongo_payments").update({ status: "failed" }).eq("id", ref);
    return res.status(502).json({ code: "PAYMONGO_ERROR" });
  }

  const session = (pmJson as { data?: { id?: string; attributes?: { checkout_url?: string } } }).data;
  const sessionId = session?.id;
  const checkoutUrl = session?.attributes?.checkout_url;
  if (!sessionId || !checkoutUrl) {
    logger.error({ pmJson }, "[paymongo] missing session id or checkout_url in response");
    await sb.from("paymongo_payments").update({ status: "failed" }).eq("id", ref);
    return res.status(502).json({ code: "PAYMONGO_BAD_RESPONSE" });
  }

  // 3. Persist the session id + raw response so the webhook can reconcile.
  await sb
    .from("paymongo_payments")
    .update({ paymongo_session_id: sessionId, raw_session: pmJson as object })
    .eq("id", ref);

  return res.json({ ok: true, ref, checkout_url: checkoutUrl });
});

/* ─────────────────────────────────────────────────────────────────────────
 * GET /api/paymongo/payment/:ref     — status poll for success page
 * ───────────────────────────────────────────────────────────────────── */
router.get("/paymongo/payment/:ref", requireAuth, async (req: Request, res: Response) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "DB_UNAVAILABLE" });
  const user = getAuthedUser(req);
  if (!user?.id) return res.status(401).json({ code: "UNAUTHENTICATED" });

  const ref = String(req.params["ref"] ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(ref)) return res.status(400).json({ code: "INVALID_REF" });

  const { data, error } = await sb
    .from("paymongo_payments")
    .select("id, status, plan_code, credits_added, amount_centavos, paid_at")
    .eq("id", ref)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return res.status(500).json({ code: "DB_ERROR" });
  if (!data) return res.status(404).json({ code: "NOT_FOUND" });
  return res.json({ payment: data });
});

/* ─────────────────────────────────────────────────────────────────────────
 * POST /api/paymongo/webhook          — HMAC-verified, idempotent
 * ───────────────────────────────────────────────────────────────────── */
const REPLAY_WINDOW_SEC = 300; // 5 minutes

function verifyPaymongoSignature(rawBody: Buffer, sigHeader: string | undefined, secret: string): boolean {
  if (!sigHeader) return false;
  const parts = sigHeader.split(",").map((p) => p.trim());
  const map: Record<string, string> = {};
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq > 0) map[part.slice(0, eq)] = part.slice(eq + 1);
  }
  const ts = Number(map["t"]);
  const sigLive = map["li"];
  const sigTest = map["te"];
  if (!ts || (!sigLive && !sigTest)) return false;
  const ageSec = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (ageSec > REPLAY_WINDOW_SEC) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${ts}.${rawBody.toString("utf8")}`)
    .digest("hex");

  for (const candidate of [sigLive, sigTest]) {
    if (!candidate) continue;
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(candidate, "utf8");
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

router.post("/paymongo/webhook", async (req: Request, res: Response) => {
  const secret = process.env["PAYMONGO_WEBHOOK_SECRET"];
  if (!secret) {
    logger.error("[paymongo/webhook] PAYMONGO_WEBHOOK_SECRET not configured");
    return res.status(503).json({ code: "WEBHOOK_NOT_CONFIGURED" });
  }

  const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  const sigHeader = req.headers["paymongo-signature"];
  const sigStr = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;

  if (!verifyPaymongoSignature(rawBody, sigStr, secret)) {
    return res.status(401).json({ code: "INVALID_SIGNATURE" });
  }

  let event: {
    data?: {
      id?: string;
      attributes?: {
        type?: string;
        data?: {
          id?: string;
          attributes?: {
            payment_intent_id?: string;
            payments?: Array<{ id?: string; attributes?: { status?: string } }>;
            reference_number?: string;
            metadata?: Record<string, unknown>;
          };
        };
      };
    };
  };
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ code: "INVALID_JSON" });
  }

  const eventId = event.data?.id;
  const eventType = event.data?.attributes?.type ?? "";
  const inner = event.data?.attributes?.data;
  const innerAttrs = inner?.attributes ?? {};
  const sessionId = inner?.id;
  const refFromMeta = (innerAttrs.metadata?.["ref"] as string | undefined) || innerAttrs.reference_number;
  const paymentId = innerAttrs.payments?.[0]?.id;

  const isSuccess = eventType === "checkout_session.payment.paid" || eventType === "payment.paid";
  const isFailure = eventType === "payment.failed";

  if (!isSuccess && !isFailure) {
    return res.json({ ok: true, ignored: eventType });
  }

  const sb = getServiceClient();
  if (!sb) {
    logger.error("[paymongo/webhook] service client unavailable");
    return res.status(503).json({ code: "DB_UNAVAILABLE" });
  }

  const lookup = sessionId
    ? sb.from("paymongo_payments").select("*").eq("paymongo_session_id", sessionId).maybeSingle()
    : refFromMeta
      ? sb.from("paymongo_payments").select("*").eq("id", refFromMeta).maybeSingle()
      : null;

  if (!lookup) {
    logger.warn({ eventId, eventType }, "[paymongo/webhook] no session id or ref in event");
    return res.json({ ok: true, ignored: "no_ref" });
  }

  const { data: row, error: lookErr } = await lookup;
  if (lookErr) {
    logger.error({ err: lookErr }, "[paymongo/webhook] lookup error");
    return res.status(500).json({ code: "DB_ERROR" });
  }
  if (!row) {
    logger.warn({ eventId, sessionId, refFromMeta }, "[paymongo/webhook] row not found");
    return res.json({ ok: true, ignored: "row_not_found" });
  }

  if (eventId && Array.isArray(row.processed_event_ids) && row.processed_event_ids.includes(eventId)) {
    return res.json({ ok: true, ignored: "duplicate_event" });
  }

  if (isFailure) {
    // Guard: never downgrade a paid row back to failed (out-of-order events
    // from PayMongo retries can deliver payment.failed AFTER payment.paid).
    await sb.from("paymongo_payments").update({
      status: "failed",
      raw_event: event,
      processed_event_ids: eventId ? [...(row.processed_event_ids ?? []), eventId] : row.processed_event_ids,
    }).eq("id", row.id).neq("status", "paid");
    return res.json({ ok: true, marked: "failed" });
  }

  // SUCCESS path. Idempotent flip: only one webhook can move pending → paid.
  const rowPlan: unknown = row.plan_code;
  if (!isPlanCode(rowPlan)) {
    logger.error({ id: row.id, plan: row.plan_code }, "[paymongo/webhook] unknown plan_code");
    return res.status(500).json({ code: "UNKNOWN_PLAN" });
  }
  const plan = PLANS[rowPlan];

  const { data: claimed, error: claimErr } = await sb
    .from("paymongo_payments")
    .update({
      status: "paid",
      paymongo_payment_id: paymentId ?? row.paymongo_payment_id,
      credits_added: plan.kind === "chat" ? plan.credits : plan.scenes,
      paid_at: new Date().toISOString(),
      raw_event: event,
      processed_event_ids: eventId ? [...(row.processed_event_ids ?? []), eventId] : row.processed_event_ids,
    })
    .eq("id", row.id)
    .neq("status", "paid")
    .select("id")
    .maybeSingle();

  if (claimErr) {
    logger.error({ err: claimErr }, "[paymongo/webhook] claim update failed");
    return res.status(500).json({ code: "DB_ERROR" });
  }
  if (!claimed) {
    return res.json({ ok: true, ignored: "already_paid" });
  }

  // Grant: chat plans add credits + extend plan_expires_at; cinematic adds
  // scenes + extends cinematic_expires_at on a parallel track. The grant is
  // executed by a SECURITY DEFINER SQL function that does an atomic relative
  // update (`credits = credits + N`, `expires_at = GREATEST(now, current) +
  // interval`). This guarantees that two paid webhooks for the same user
  // processed concurrently (different refs) cannot lose credits/scenes via
  // interleaved baseline reads — Postgres takes a row lock during UPDATE.
  //
  // We swallow grant errors after the status flip so a partial grant does
  // not trigger a webhook retry that would re-flip the row — raw_event jsonb
  // gives admin a full audit trail to reconcile manually if needed.
  try {
    if (plan.kind === "chat" && plan.plan_code_db) {
      const { error: grantErr } = await sb.rpc("grant_paymongo_chat_plan", {
        p_user_id:       row.user_id,
        p_plan_code:     plan.plan_code_db,
        p_credits:       plan.credits,
        p_duration_days: plan.duration_days,
      });
      if (grantErr) {
        logger.error({ err: grantErr, paymentId: row.id }, "[paymongo/webhook] chat grant failed — admin reconcile needed");
      } else {
        logger.info({ userId: row.user_id, plan: plan.code, credits: plan.credits }, "[paymongo/webhook] chat plan granted");
      }
    } else if (plan.kind === "cinematic") {
      const { error: grantErr } = await sb.rpc("grant_paymongo_cinematic", {
        p_user_id:       row.user_id,
        p_scenes:        plan.scenes,
        p_duration_days: plan.duration_days,
      });
      if (grantErr) {
        logger.error({ err: grantErr, paymentId: row.id }, "[paymongo/webhook] cinematic grant failed — admin reconcile needed");
      } else {
        logger.info({ userId: row.user_id, plan: plan.code, scenes: plan.scenes }, "[paymongo/webhook] cinematic plan granted");
      }
    }
  } catch (err) {
    logger.error({ err, paymentId: row.id }, "[paymongo/webhook] grant crashed — admin reconcile needed");
  }

  return res.json({ ok: true, granted: true });
});

export default router;
