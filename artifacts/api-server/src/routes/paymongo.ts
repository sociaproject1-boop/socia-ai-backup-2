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
 * Plan catalogue (creator system — daily soft quotas + monthly credit pool):
 *   premium      ₱499  / 30 days   150 chat / 20 img / 5 vid daily   tier 1
 *   elite        ₱999  / 30 days   300 chat / 50 img / 10 vid daily  tier 2
 *   super_elite  ₱1999 / 30 days   500 chat / 100 img / 20 vid daily tier 3
 *   cinematic    ₱2499 / 30 days   10 cinematic projects/mo (add-on)
 *
 * Chat plans grant: monthly credit pool + daily quotas (chat/image/video)
 * + priority_tier (0=free, 1/2/3=paid). Cinematic grants project quota on a
 * separate parallel track so users can hold any chat plan + cinematic.
 *
 * Daily quotas are SOFT limits. When exceeded, the render pipeline runs in
 * "economy mode" (lower quality, lower queue priority) instead of blocking
 * the user — see consume_usage() SQL function for the status contract.
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
  /** Chat plans: monthly credit pool. Cinematic: monthly project quota. */
  credits: number;        // chat-plan credit grant (0 for cinematic)
  projects: number;       // cinematic monthly project quota (0 for chat plans)
  /** Daily soft quotas (chat plans only). */
  daily_chat: number;
  daily_image: number;
  daily_video: number;
  /** Render queue priority. 0=free, 1=premium, 2=elite, 3=super_elite. */
  priority_tier: number;
  /** users.plan_code value to set (chat plans only). */
  plan_code_db: string | null;
}

const PLANS: Record<PlanCode, PlanDef> = {
  premium:     { code: "premium",     name: "Socia Premium",       amount_centavos:  49_900, duration_days: 30, kind: "chat",      credits:  4_500, projects:  0, daily_chat: 150, daily_image:  20, daily_video:  5, priority_tier: 1, plan_code_db: "premium" },
  elite:       { code: "elite",       name: "Socia Elite",         amount_centavos:  99_900, duration_days: 30, kind: "chat",      credits:  9_000, projects:  0, daily_chat: 300, daily_image:  50, daily_video: 10, priority_tier: 2, plan_code_db: "elite" },
  super_elite: { code: "super_elite", name: "Socia Super Elite",   amount_centavos: 199_900, duration_days: 30, kind: "chat",      credits: 15_000, projects:  0, daily_chat: 500, daily_image: 100, daily_video: 20, priority_tier: 3, plan_code_db: "super_elite" },
  cinematic:   { code: "cinematic",   name: "AI Cinematic Studio", amount_centavos: 249_900, duration_days: 30, kind: "cinematic", credits:      0, projects: 10, daily_chat:   0, daily_image:   0, daily_video:  0, priority_tier: 0, plan_code_db: null },
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
 * POST /api/paymongo/support-checkout
 *
 * Community-support contribution. Variable amount (min ₱50). Inserts a
 * pending row in community_support, creates a PayMongo checkout session,
 * and returns the hosted checkout URL. The webhook (below) finalizes the
 * row + atomically increments community_funding totals.
 * ───────────────────────────────────────────────────────────────────── */
const SUPPORT_MIN_CENTAVOS = 5_000;       //  ₱50
const SUPPORT_MAX_CENTAVOS = 1_000_000;   //  ₱10,000 — safety ceiling per tx

router.post("/paymongo/support-checkout", requireAuth, async (req: Request, res: Response) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "DB_UNAVAILABLE" });
  if (!process.env["PAYMONGO_SECRET_KEY"]) {
    return res.status(503).json({ code: "PAYMONGO_NOT_CONFIGURED" });
  }

  const user = getAuthedUser(req);
  if (!user?.id) return res.status(401).json({ code: "UNAUTHENTICATED" });

  // Server-side amount validation — never trust client totals.
  const amountCentavos = Number(req.body?.amount_centavos);
  if (!Number.isFinite(amountCentavos) || !Number.isInteger(amountCentavos)) {
    return res.status(400).json({ code: "INVALID_AMOUNT" });
  }
  if (amountCentavos < SUPPORT_MIN_CENTAVOS) {
    return res.status(400).json({ code: "AMOUNT_BELOW_MIN", min: SUPPORT_MIN_CENTAVOS });
  }
  if (amountCentavos > SUPPORT_MAX_CENTAVOS) {
    return res.status(400).json({ code: "AMOUNT_ABOVE_MAX", max: SUPPORT_MAX_CENTAVOS });
  }

  // 1. Pending row first so we always have a DB record.
  const { data: row, error: insErr } = await sb
    .from("community_support")
    .insert({
      user_id: user.id,
      amount_centavos: amountCentavos,
      status: "pending",
    })
    .select("id")
    .single();

  if (insErr || !row) {
    // Map common Supabase error shapes to actionable user-facing codes so the
    // modal can show a clean toast instead of a generic 500. We include the
    // PostgREST error code + message in the server log for diagnostics.
    const pgCode = (insErr as { code?: string } | null)?.code ?? "";
    const pgMsg  = (insErr as { message?: string } | null)?.message ?? "";
    logger.error(
      { err: insErr, pgCode, pgMsg, userId: user.id, amountCentavos },
      "[paymongo/support] failed to insert pending row",
    );

    // PGRST205 = "Could not find the table 'public.community_support' in the
    // schema cache" — migration 36 has not been applied to this Supabase
    // project yet. Surface this clearly so the user knows what to do.
    if (pgCode === "PGRST205" || /community_support/i.test(pgMsg) && /not find|schema cache/i.test(pgMsg)) {
      return res.status(503).json({
        code:    "SUPPORT_NOT_READY",
        message: "Community support is being set up. Please try again in a moment.",
      });
    }
    // 23503 = foreign-key violation (user_id not in auth.users)
    if (pgCode === "23503") {
      return res.status(401).json({
        code:    "SESSION_EXPIRED",
        message: "Your session has expired. Please sign in again to continue.",
      });
    }
    // 23514 = check constraint (amount below floor, even though we already validated)
    if (pgCode === "23514") {
      return res.status(400).json({
        code:    "AMOUNT_BELOW_MIN",
        message: "Minimum contribution is ₱50.",
      });
    }
    return res.status(500).json({
      code:    "SUPPORT_INSERT_FAILED",
      message: "We couldn't start your contribution. Please try again.",
    });
  }

  const ref = row.id as string;
  const origin = appOrigin(req);
  const successUrl = `${origin}/support/success?ref=${encodeURIComponent(ref)}`;
  const cancelUrl  = `${origin}/support/cancelled?ref=${encodeURIComponent(ref)}`;

  // 2. Create PayMongo checkout session.
  const payload = {
    data: {
      attributes: {
        send_email_receipt: false,
        show_description:   false,
        show_line_items:    true,
        cancel_url:  cancelUrl,
        success_url: successUrl,
        line_items: [{
          currency: "PHP",
          amount:   amountCentavos,
          name:     "Socia Community Support",
          quantity: 1,
        }],
        payment_method_types: ["gcash", "paymaya", "card"],
        description: "Socia community support contribution",
        reference_number: ref,
        metadata: {
          ref,
          user_id: user.id,
          kind:    "community_support",
        },
      },
    },
  };

  let pmRes: Awaited<ReturnType<typeof fetch>>;
  try {
    pmRes = await paymongoFetch("/checkout_sessions", {
      method: "POST",
      body:   JSON.stringify(payload),
    });
  } catch (err) {
    logger.error({ err }, "[paymongo/support] network error creating checkout session");
    await sb.from("community_support").update({ status: "failed" }).eq("id", ref);
    return res.status(502).json({ code: "PAYMONGO_UNREACHABLE" });
  }

  const pmJson: unknown = await pmRes.json().catch(() => null);
  if (!pmRes.ok || !pmJson || typeof pmJson !== "object") {
    logger.error({ status: pmRes.status, body: pmJson }, "[paymongo/support] create session non-2xx");
    await sb.from("community_support").update({ status: "failed" }).eq("id", ref);
    return res.status(502).json({ code: "PAYMONGO_ERROR" });
  }

  const session = (pmJson as { data?: { id?: string; attributes?: { checkout_url?: string } } }).data;
  const sessionId   = session?.id;
  const checkoutUrl = session?.attributes?.checkout_url;
  if (!sessionId || !checkoutUrl) {
    logger.error({ pmJson }, "[paymongo/support] missing session id or checkout_url");
    await sb.from("community_support").update({ status: "failed" }).eq("id", ref);
    return res.status(502).json({ code: "PAYMONGO_BAD_RESPONSE" });
  }

  await sb
    .from("community_support")
    .update({ paymongo_session_id: sessionId, raw_session: pmJson as object })
    .eq("id", ref);

  return res.json({ ok: true, ref, checkout_url: checkoutUrl });
});

/* ─────────────────────────────────────────────────────────────────────────
 * GET /api/paymongo/support/:ref      — status poll for the support success page
 * ───────────────────────────────────────────────────────────────────── */
router.get("/paymongo/support/:ref", requireAuth, async (req: Request, res: Response) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "DB_UNAVAILABLE" });
  const user = getAuthedUser(req);
  if (!user?.id) return res.status(401).json({ code: "UNAUTHENTICATED" });

  const ref = String(req.params["ref"] ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(ref)) return res.status(400).json({ code: "INVALID_REF" });

  const { data, error } = await sb
    .from("community_support")
    .select("id, status, amount_centavos, payment_method, paid_at")
    .eq("id", ref)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return res.status(500).json({ code: "DB_ERROR" });
  if (!data) return res.status(404).json({ code: "NOT_FOUND" });
  return res.json({ payment: data });
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

  // Two payment surfaces share this webhook: plan subscriptions (paymongo_payments)
  // and community-support contributions (community_support). PayMongo retry
  // events sometimes strip metadata, so we CANNOT rely on metadata.kind alone.
  // We probe both tables by session_id (and ref as a fallback) and dispatch
  // by whichever row exists. metadata.kind is used as a fast-path hint only.
  const metaKind = String((innerAttrs.metadata?.["kind"] as string | undefined) ?? "");

  if (!sessionId && !refFromMeta) {
    logger.warn({ eventId, eventType }, "[paymongo/webhook] no session id or ref in event");
    return res.json({ ok: true, ignored: "no_ref" });
  }

  // Resolve which table owns this session by probing both. Run in parallel.
  const planQuery = sessionId
    ? sb.from("paymongo_payments").select("*").eq("paymongo_session_id", sessionId).maybeSingle()
    : sb.from("paymongo_payments").select("*").eq("id", refFromMeta!).maybeSingle();
  const supportQuery = sessionId
    ? sb.from("community_support").select("*").eq("paymongo_session_id", sessionId).maybeSingle()
    : sb.from("community_support").select("*").eq("id", refFromMeta!).maybeSingle();

  const [planRes, supportRes] = await Promise.all([planQuery, supportQuery]);

  // ANY lookup error must trigger a retry — otherwise an error on one table
  // combined with an empty result on the other would silently drop a real
  // payable event as "row_not_found". PayMongo's retry will re-deliver and
  // we'll succeed once both queries return cleanly.
  if (planRes.error || supportRes.error) {
    logger.error(
      { planErr: planRes.error, supportErr: supportRes.error },
      "[paymongo/webhook] lookup error — returning 500 so PayMongo retries"
    );
    return res.status(500).json({ code: "DB_ERROR" });
  }

  const supportRowFound = !!supportRes.data;
  const planRowFound    = !!planRes.data;
  // If both tables somehow contain the same session id (should be impossible
  // given separate insert paths), prefer the explicit metadata.kind hint;
  // otherwise prefer support since it's the newer surface.
  const isSupportEvent = supportRowFound && (!planRowFound || metaKind === "community_support");

  // ── Support path ────────────────────────────────────────────────────────
  if (isSupportEvent) {
    const srow = supportRes.data!;

    if (eventId && Array.isArray(srow.processed_event_ids) && srow.processed_event_ids.includes(eventId)) {
      return res.json({ ok: true, ignored: "duplicate_event" });
    }

    if (isFailure) {
      await sb.from("community_support").update({
        status: "failed",
        raw_event: event,
        processed_event_ids: eventId ? [...(srow.processed_event_ids ?? []), eventId] : srow.processed_event_ids,
      }).eq("id", srow.id).neq("status", "paid");
      return res.json({ ok: true, marked: "support_failed" });
    }

    // SUCCESS path — atomic finalize (status flip + community_funding increment).
    const { data: sFinResult, error: sFinErr } = await sb.rpc("paymongo_finalize_support", {
      p_payment_id:          srow.id,
      p_paymongo_payment_id: paymentId ?? null,
      p_event_id:            eventId  ?? null,
      p_event:               event as object,
    });

    if (sFinErr) {
      logger.error({ err: sFinErr, paymentId: srow.id }, "[paymongo/webhook] support finalize failed — will be retried");
      return res.status(500).json({ code: "FINALIZE_FAILED" });
    }
    const sOutcome = (sFinResult as { result?: string } | null)?.result ?? "unknown";
    logger.info({ userId: srow.user_id, outcome: sOutcome }, "[paymongo/webhook] support finalize complete");
    return res.json({ ok: true, kind: "support", outcome: sOutcome });
  }

  // ── Plan path ───────────────────────────────────────────────────────────
  const row = planRes.data;
  if (!row) {
    logger.warn({ eventId, sessionId, refFromMeta }, "[paymongo/webhook] row not found in either table");
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

  // SUCCESS path. Status flip + entitlement grant happen in a SINGLE
  // Postgres transaction via paymongo_finalize_{chat,cinematic}(). If grant
  // fails for any reason the whole TX rolls back, the row stays pending,
  // and PayMongo's automatic retry will re-attempt cleanly. This eliminates
  // the previous failure mode where a Node crash between two separate
  // statements could leave a row "paid" with no entitlement granted.
  //
  // Idempotency lives inside the function (locks the row FOR UPDATE, checks
  // processed_event_ids + status='paid'), so duplicate deliveries are safe.
  const rowPlan: unknown = row.plan_code;
  if (!isPlanCode(rowPlan)) {
    logger.error({ id: row.id, plan: row.plan_code }, "[paymongo/webhook] unknown plan_code");
    return res.status(500).json({ code: "UNKNOWN_PLAN" });
  }
  const plan = PLANS[rowPlan];

  const finalize = plan.kind === "chat" && plan.plan_code_db
    ? sb.rpc("paymongo_finalize_chat", {
        p_payment_id:          row.id,
        p_paymongo_payment_id: paymentId ?? null,
        p_event_id:            eventId ?? null,
        p_event:               event as object,
        p_plan_code_db:        plan.plan_code_db,
        p_credits:             plan.credits,
        p_duration_days:       plan.duration_days,
        p_daily_chat:          plan.daily_chat,
        p_daily_image:         plan.daily_image,
        p_daily_video:         plan.daily_video,
        p_priority_tier:       plan.priority_tier,
      })
    : sb.rpc("paymongo_finalize_cinematic", {
        p_payment_id:          row.id,
        p_paymongo_payment_id: paymentId ?? null,
        p_event_id:            eventId ?? null,
        p_event:               event as object,
        p_projects:            plan.projects,
        p_duration_days:       plan.duration_days,
      });

  const { data: finalizeResult, error: finalizeErr } = await finalize;
  if (finalizeErr) {
    // TX rolled back. Surface 500 so PayMongo retries — do NOT 200 here.
    logger.error({ err: finalizeErr, paymentId: row.id }, "[paymongo/webhook] finalize failed — will be retried");
    return res.status(500).json({ code: "FINALIZE_FAILED" });
  }

  const outcome = (finalizeResult as { result?: string } | null)?.result ?? "unknown";
  logger.info({ userId: row.user_id, plan: plan.code, outcome }, "[paymongo/webhook] finalize complete");
  return res.json({ ok: true, outcome });
});

export default router;
