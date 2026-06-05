/**
 * routes/alertSettings.ts — Owner-only CRUD for alert channel configuration.
 *
 * Endpoints:
 *   GET  /api/alert-settings        (owner) — current settings
 *   PUT  /api/alert-settings        (owner) — save / update settings
 *   POST /api/alert-settings/test   (owner) — send test alert to configured channels
 *
 * The alert settings stored here complement the env-var defaults.
 * When DB settings exist they override the env-var values.
 */
import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, getAuthedUser } from "../lib/supabaseAuth.js";
import { logger } from "../lib/logger.js";

const OWNER_EMAIL = (process.env["OWNER_EMAIL"] ?? "allanalbacen5@gmail.com").toLowerCase();

const SUPABASE_URL = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
const SUPABASE_SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

function serviceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const router: IRouter = Router();

function requireOwner(req: Parameters<typeof requireAuth>[0], res: Parameters<typeof requireAuth>[1], next: Parameters<typeof requireAuth>[2]) {
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

/* GET /api/alert-settings */
router.get("/alert-settings", requireAuth as any, requireOwner as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const db = serviceClient();
    const { data, error } = await db
      .from("alert_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      logger.warn({ err: error.message }, "[alertSettings] fetch error");
    }

    const env = {
      email_enabled:   Boolean(process.env["RESEND_API_KEY"] || process.env["SENDGRID_API_KEY"] || process.env["SMTP_HOST"]),
      sms_enabled:     Boolean(process.env["TWILIO_ACCOUNT_SID"] || process.env["SEMAPHORE_API_KEY"]),
      webhook_enabled: Boolean(process.env["ALERT_WEBHOOK_URL"]),
      email_address:   process.env["OWNER_EMAIL"] ?? null,
      phone_number:    process.env["ALERT_PHONE"] ?? null,
      webhook_url:     process.env["ALERT_WEBHOOK_URL"] ?? null,
    };

    res.json({ settings: data ?? null, env });
  } catch (err) {
    logger.error({ err }, "[alertSettings] GET error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* PUT /api/alert-settings */
router.put("/alert-settings", requireAuth as any, requireOwner as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const db = serviceClient();

    const {
      email_enabled   = false,
      sms_enabled     = false,
      webhook_enabled = false,
      email_address   = null,
      phone_number    = null,
      webhook_url     = null,
    } = req.body ?? {};

    const { data, error } = await db
      .from("alert_settings")
      .upsert({
        user_id: user.id,
        email_enabled:   Boolean(email_enabled),
        sms_enabled:     Boolean(sms_enabled),
        webhook_enabled: Boolean(webhook_enabled),
        email_address:   email_address ?? null,
        phone_number:    phone_number ?? null,
        webhook_url:     webhook_url ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" })
      .select()
      .single();

    if (error) {
      logger.warn({ err: error.message }, "[alertSettings] upsert error");
      res.status(500).json({ error: error.message });
      return;
    }

    logger.info({ userId: user.id }, "[alertSettings] updated");
    res.json({ settings: data });
  } catch (err) {
    logger.error({ err }, "[alertSettings] PUT error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* POST /api/alert-settings/test — send a real test to all enabled channels */
router.post("/alert-settings/test", requireAuth as any, requireOwner as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const db = serviceClient();

    const { data } = await db
      .from("alert_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    const results: { channel: string; success: boolean; error?: string }[] = [];

    if (data?.email_enabled && data.email_address) {
      try {
        const resendKey = process.env["RESEND_API_KEY"];
        if (resendKey) {
          const r = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "Socia Alerts <alerts@socia.app>",
              to: [data.email_address],
              subject: "Socia Alert Test — Channel Working",
              text: "This is a test alert from Socia. Your email alert channel is working correctly.",
            }),
            signal: AbortSignal.timeout(10_000),
          });
          results.push({ channel: "email", success: r.ok, error: r.ok ? undefined : `HTTP ${r.status}` });
        } else {
          results.push({ channel: "email", success: false, error: "No email provider configured (RESEND_API_KEY missing)" });
        }
      } catch (e) {
        results.push({ channel: "email", success: false, error: String(e) });
      }
    }

    if (data?.sms_enabled && data.phone_number) {
      const sid = process.env["TWILIO_ACCOUNT_SID"];
      const token = process.env["TWILIO_AUTH_TOKEN"];
      const from = process.env["TWILIO_FROM_NUMBER"];
      if (sid && token && from) {
        try {
          const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ To: data.phone_number, From: from, Body: "Socia alert test — SMS channel working." }),
            signal: AbortSignal.timeout(10_000),
          });
          results.push({ channel: "sms", success: r.ok, error: r.ok ? undefined : `HTTP ${r.status}` });
        } catch (e) {
          results.push({ channel: "sms", success: false, error: String(e) });
        }
      } else {
        results.push({ channel: "sms", success: false, error: "SMS provider not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER missing)" });
      }
    }

    if (data?.webhook_enabled && data.webhook_url) {
      try {
        const r = await fetch(data.webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "test",
            message: "Socia alert test — webhook channel working.",
            timestamp: new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(10_000),
        });
        results.push({ channel: "webhook", success: r.ok, error: r.ok ? undefined : `HTTP ${r.status}` });
      } catch (e) {
        results.push({ channel: "webhook", success: false, error: String(e) });
      }
    }

    const delivered = results.filter((r) => r.success).length;
    res.json({ delivered, results });
  } catch (err) {
    logger.error({ err }, "[alertSettings] test error");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
