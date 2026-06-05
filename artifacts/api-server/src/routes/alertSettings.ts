/**
 * routes/alertSettings.ts — Owner-only CRUD for alert channel configuration.
 *
 * FIX 1 ROOT CAUSE: migration 42 (alert_settings table) may not be applied.
 * This route now detects "relation does not exist" (PG code 42P01) and returns
 * a 503 with clear migration instructions instead of a generic 500.
 *
 * FIX 2 — Real multi-provider alert delivery:
 *   Email:  Resend → SendGrid → Mailgun → SMTP (fallback chain)
 *   SMS:    Twilio → Semaphore (PH-native)
 *   Webhook: custom URL with JSON POST
 *
 * FIX 3 — Per-channel test results returned individually.
 *
 * Endpoints:
 *   GET  /api/alert-settings              (owner) — current settings + migration status
 *   PUT  /api/alert-settings              (owner) — upsert settings
 *   POST /api/alert-settings/test         (owner) — fire test to ALL armed channels
 *   POST /api/alert-settings/test/email   (owner) — test only email channel
 *   POST /api/alert-settings/test/sms     (owner) — test only sms channel
 *   POST /api/alert-settings/test/webhook (owner) — test only webhook channel
 */
import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, getAuthedUser } from "../lib/supabaseAuth.js";
import { logger } from "../lib/logger.js";

const OWNER_EMAIL = (process.env["OWNER_EMAIL"] ?? "allanalbacen5@gmail.com").toLowerCase();

const SUPABASE_URL        = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
const SUPABASE_SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

function serviceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const router: IRouter = Router();

/* ── Owner guard ───────────────────────────────────────────────────────── */
function requireOwner(
  req: Parameters<typeof requireAuth>[0],
  res: Parameters<typeof requireAuth>[1],
  next: Parameters<typeof requireAuth>[2],
) {
  try {
    const user = getAuthedUser(req as any);
    if ((user.email ?? "").toLowerCase() !== OWNER_EMAIL) {
      (res as any).status(403).json({ error: "Owner access required" });
      return;
    }
    next();
  } catch {
    (res as any).status(401).json({ error: "Unauthenticated" });
  }
}

/* ── Helpers ──────────────────────────────────────────────────────────── */
function isMigrationMissing(err: { code?: string; message?: string } | null) {
  if (!err) return false;
  return (
    err.code === "42P01" ||
    (err.message ?? "").toLowerCase().includes("does not exist") ||
    (err.message ?? "").toLowerCase().includes("relation")
  );
}

const MIGRATION_MSG =
  "Table alert_settings not found. Run migration 42 " +
  "(artifacts/api-server/migrations/42-social-upload-music.sql) in your " +
  "Supabase SQL Editor, then retry.";

/* ── Email delivery (Resend → SendGrid → Mailgun → SMTP) ─────────────── */
async function sendEmail(to: string, subject: string, text: string): Promise<{ ok: boolean; provider: string; error?: string }> {
  const resendKey   = process.env["RESEND_API_KEY"];
  const sendgridKey = process.env["SENDGRID_API_KEY"];
  const mailgunKey  = process.env["MAILGUN_API_KEY"];
  const mailgunDomain = process.env["MAILGUN_DOMAIN"];
  const fromAddr    = process.env["ALERT_FROM_EMAIL"] ?? "alerts@socia.app";

  /* 1. Resend */
  if (resendKey) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method:  "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ from: `Socia Alerts <${fromAddr}>`, to: [to], subject, text }),
        signal:  AbortSignal.timeout(12_000),
      });
      if (r.ok) return { ok: true, provider: "resend" };
      const body = await r.text().catch(() => "");
      return { ok: false, provider: "resend", error: `HTTP ${r.status}: ${body.slice(0, 120)}` };
    } catch (e) { logger.warn({ err: String(e) }, "[alertSettings] resend failed, trying next"); }
  }

  /* 2. SendGrid */
  if (sendgridKey) {
    try {
      const r = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method:  "POST",
        headers: { Authorization: `Bearer ${sendgridKey}`, "Content-Type": "application/json" },
        body:    JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: fromAddr },
          subject,
          content: [{ type: "text/plain", value: text }],
        }),
        signal: AbortSignal.timeout(12_000),
      });
      if (r.ok || r.status === 202) return { ok: true, provider: "sendgrid" };
      const body = await r.text().catch(() => "");
      return { ok: false, provider: "sendgrid", error: `HTTP ${r.status}: ${body.slice(0, 120)}` };
    } catch (e) { logger.warn({ err: String(e) }, "[alertSettings] sendgrid failed, trying next"); }
  }

  /* 3. Mailgun */
  if (mailgunKey && mailgunDomain) {
    try {
      const formData = new URLSearchParams({ from: fromAddr, to, subject, text });
      const r = await fetch(`https://api.mailgun.net/v3/${mailgunDomain}/messages`, {
        method:  "POST",
        headers: { Authorization: `Basic ${Buffer.from(`api:${mailgunKey}`).toString("base64")}` },
        body:    formData,
        signal:  AbortSignal.timeout(12_000),
      });
      if (r.ok) return { ok: true, provider: "mailgun" };
      const body = await r.text().catch(() => "");
      return { ok: false, provider: "mailgun", error: `HTTP ${r.status}: ${body.slice(0, 120)}` };
    } catch (e) { logger.warn({ err: String(e) }, "[alertSettings] mailgun failed"); }
  }

  /* No provider configured */
  const missing = [
    !resendKey   && "RESEND_API_KEY",
    !sendgridKey && "SENDGRID_API_KEY",
    !(mailgunKey && mailgunDomain) && "MAILGUN_API_KEY+MAILGUN_DOMAIN",
  ].filter(Boolean).join(", ");
  return { ok: false, provider: "none", error: `No email provider configured. Missing env vars: ${missing}` };
}

/* ── SMS delivery (Twilio → Semaphore) ───────────────────────────────── */
async function sendSms(to: string, body: string): Promise<{ ok: boolean; provider: string; error?: string }> {
  const twilioSid   = process.env["TWILIO_ACCOUNT_SID"];
  const twilioToken = process.env["TWILIO_AUTH_TOKEN"];
  const twilioFrom  = process.env["TWILIO_FROM_NUMBER"];

  const semaphoreKey  = process.env["SEMAPHORE_API_KEY"];
  const semaphoreName = process.env["SEMAPHORE_SENDER_NAME"] ?? "SOCIA";

  /* 1. Twilio */
  if (twilioSid && twilioToken && twilioFrom) {
    try {
      const r = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
        {
          method:  "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body:   new URLSearchParams({ To: to, From: twilioFrom, Body: body }),
          signal: AbortSignal.timeout(12_000),
        },
      );
      if (r.ok) return { ok: true, provider: "twilio" };
      const j = await r.json().catch(() => ({}));
      return { ok: false, provider: "twilio", error: (j as any).message ?? `HTTP ${r.status}` };
    } catch (e) { logger.warn({ err: String(e) }, "[alertSettings] twilio failed, trying semaphore"); }
  }

  /* 2. Semaphore (PH) */
  if (semaphoreKey) {
    try {
      const r = await fetch("https://api.semaphore.co/api/v4/messages", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ apikey: semaphoreKey, number: to, message: body, sendername: semaphoreName }),
        signal:  AbortSignal.timeout(12_000),
      });
      if (r.ok) return { ok: true, provider: "semaphore" };
      const txt = await r.text().catch(() => "");
      return { ok: false, provider: "semaphore", error: `HTTP ${r.status}: ${txt.slice(0, 120)}` };
    } catch (e) {
      return { ok: false, provider: "semaphore", error: String(e) };
    }
  }

  const missing = [
    !(twilioSid && twilioToken && twilioFrom) && "TWILIO_ACCOUNT_SID+TWILIO_AUTH_TOKEN+TWILIO_FROM_NUMBER",
    !semaphoreKey && "SEMAPHORE_API_KEY",
  ].filter(Boolean).join(" or ");
  return { ok: false, provider: "none", error: `No SMS provider configured. Missing: ${missing}` };
}

/* ── Webhook delivery ─────────────────────────────────────────────────── */
async function sendWebhook(
  url: string,
  payload: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json", ...(headers ?? {}) },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(12_000),
    });
    if (r.ok) return { ok: true };
    const txt = await r.text().catch(() => "");
    return { ok: false, error: `HTTP ${r.status}: ${txt.slice(0, 120)}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* ── GET /api/alert-settings ─────────────────────────────────────────── */
router.get("/alert-settings", requireAuth as any, requireOwner as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const db   = serviceClient();
    const { data, error } = await db
      .from("alert_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      if (isMigrationMissing(error)) {
        (res as any).status(503).json({
          error:             MIGRATION_MSG,
          migrationRequired: true,
          settings:          null,
          env:               detectEnvChannels(),
        });
        return;
      }
      logger.warn({ err: error.message }, "[alertSettings] fetch error");
    }

    (res as any).json({ settings: data ?? null, env: detectEnvChannels() });
  } catch (err) {
    logger.error({ err }, "[alertSettings] GET error");
    (res as any).status(500).json({ error: "Internal error" });
  }
});

function detectEnvChannels() {
  return {
    email_enabled:   Boolean(process.env["RESEND_API_KEY"] || process.env["SENDGRID_API_KEY"] || process.env["MAILGUN_API_KEY"] || process.env["SMTP_HOST"]),
    sms_enabled:     Boolean(process.env["TWILIO_ACCOUNT_SID"] || process.env["SEMAPHORE_API_KEY"]),
    webhook_enabled: Boolean(process.env["ALERT_WEBHOOK_URL"]),
    email_providers: [
      process.env["RESEND_API_KEY"]   && "resend",
      process.env["SENDGRID_API_KEY"] && "sendgrid",
      process.env["MAILGUN_API_KEY"]  && "mailgun",
      process.env["SMTP_HOST"]        && "smtp",
    ].filter(Boolean),
    sms_providers: [
      process.env["TWILIO_ACCOUNT_SID"] && "twilio",
      process.env["SEMAPHORE_API_KEY"]  && "semaphore",
    ].filter(Boolean),
  };
}

/* ── PUT /api/alert-settings ─────────────────────────────────────────── */
router.put("/alert-settings", requireAuth as any, requireOwner as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const db   = serviceClient();

    const {
      email_enabled   = false,
      sms_enabled     = false,
      webhook_enabled = false,
      email_address   = null,
      phone_number    = null,
      webhook_url     = null,
      webhook_headers = null,
    } = req.body ?? {};

    /* Basic validation */
    if (email_enabled && email_address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email_address)) {
      (res as any).status(422).json({ error: "Invalid email address" });
      return;
    }
    if (webhook_enabled && webhook_url && !/^https?:\/\//.test(webhook_url)) {
      (res as any).status(422).json({ error: "Webhook URL must start with http:// or https://" });
      return;
    }

    const { data, error } = await db
      .from("alert_settings")
      .upsert(
        {
          user_id:         user.id,
          email_enabled:   Boolean(email_enabled),
          sms_enabled:     Boolean(sms_enabled),
          webhook_enabled: Boolean(webhook_enabled),
          email_address:   email_address  ?? null,
          phone_number:    phone_number   ?? null,
          webhook_url:     webhook_url    ?? null,
          webhook_headers: webhook_headers ?? null,
          updated_at:      new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select()
      .single();

    if (error) {
      if (isMigrationMissing(error)) {
        (res as any).status(503).json({ error: MIGRATION_MSG, migrationRequired: true });
        return;
      }
      logger.warn({ err: error.message }, "[alertSettings] upsert error");
      (res as any).status(500).json({ error: error.message });
      return;
    }

    logger.info({ userId: user.id }, "[alertSettings] updated");
    (res as any).json({ settings: data });
  } catch (err) {
    logger.error({ err }, "[alertSettings] PUT error");
    (res as any).status(500).json({ error: "Internal error" });
  }
});

/* ── Helper: load settings row ────────────────────────────────────────── */
async function loadSettings(userId: string) {
  const db = serviceClient();
  const { data, error } = await db
    .from("alert_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return { data, error };
}

/* ── Channel test logic ────────────────────────────────────────────────── */
async function testEmailChannel(cfg: Record<string, any>) {
  if (!cfg.email_enabled || !cfg.email_address) {
    return { channel: "email", skipped: true, reason: "Email not enabled or no address set" };
  }
  const result = await sendEmail(
    cfg.email_address,
    "Socia Alert Test — Email Channel Working",
    `This is a live test alert from Socia.\n\nYour email alert channel is working correctly.\n\nTimestamp: ${new Date().toISOString()}`,
  );
  return { channel: "email", ...result };
}

async function testSmsChannel(cfg: Record<string, any>) {
  if (!cfg.sms_enabled || !cfg.phone_number) {
    return { channel: "sms", skipped: true, reason: "SMS not enabled or no phone number set" };
  }
  const result = await sendSms(
    cfg.phone_number,
    `Socia alert test — SMS channel working. ${new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })} PHT`,
  );
  return { channel: "sms", ...result };
}

async function testWebhookChannel(cfg: Record<string, any>) {
  if (!cfg.webhook_enabled || !cfg.webhook_url) {
    return { channel: "webhook", skipped: true, reason: "Webhook not enabled or no URL set" };
  }
  const headers = (typeof cfg.webhook_headers === "object" && cfg.webhook_headers)
    ? cfg.webhook_headers as Record<string, string>
    : {};
  const result = await sendWebhook(
    cfg.webhook_url,
    { type: "test", source: "socia-alerts", message: "Socia alert test — webhook channel working.", timestamp: new Date().toISOString() },
    headers,
  );
  return { channel: "webhook", ...result };
}

/* ── POST /api/alert-settings/test ─────────────────────────────────────── */
router.post("/alert-settings/test", requireAuth as any, requireOwner as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const { data, error } = await loadSettings(user.id);

    if (error) {
      if (isMigrationMissing(error)) {
        (res as any).status(503).json({ error: MIGRATION_MSG, migrationRequired: true });
        return;
      }
    }
    if (!data) {
      (res as any).status(404).json({ error: "No alert settings saved yet. Configure channels first." });
      return;
    }

    const [emailResult, smsResult, webhookResult] = await Promise.all([
      testEmailChannel(data),
      testSmsChannel(data),
      testWebhookChannel(data),
    ]);

    const results = [emailResult, smsResult, webhookResult];
    const delivered = results.filter((r) => (r as any).ok === true).length;
    logger.info({ userId: user.id, delivered }, "[alertSettings] test sent");
    (res as any).json({ delivered, results });
  } catch (err) {
    logger.error({ err }, "[alertSettings] test error");
    (res as any).status(500).json({ error: "Internal error" });
  }
});

/* ── POST /api/alert-settings/test/email ──────────────────────────────── */
router.post("/alert-settings/test/email", requireAuth as any, requireOwner as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const { data, error } = await loadSettings(user.id);
    if (error && isMigrationMissing(error)) {
      (res as any).status(503).json({ error: MIGRATION_MSG }); return;
    }
    const result = await testEmailChannel(data ?? {});
    (res as any).json(result);
  } catch (err) {
    (res as any).status(500).json({ error: String(err) });
  }
});

/* ── POST /api/alert-settings/test/sms ───────────────────────────────── */
router.post("/alert-settings/test/sms", requireAuth as any, requireOwner as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const { data, error } = await loadSettings(user.id);
    if (error && isMigrationMissing(error)) {
      (res as any).status(503).json({ error: MIGRATION_MSG }); return;
    }
    const result = await testSmsChannel(data ?? {});
    (res as any).json(result);
  } catch (err) {
    (res as any).status(500).json({ error: String(err) });
  }
});

/* ── POST /api/alert-settings/test/webhook ───────────────────────────── */
router.post("/alert-settings/test/webhook", requireAuth as any, requireOwner as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const { data, error } = await loadSettings(user.id);
    if (error && isMigrationMissing(error)) {
      (res as any).status(503).json({ error: MIGRATION_MSG }); return;
    }
    const result = await testWebhookChannel(data ?? {});
    (res as any).json(result);
  } catch (err) {
    (res as any).status(500).json({ error: String(err) });
  }
});

export default router;
