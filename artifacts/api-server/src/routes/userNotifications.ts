/**
 * routes/userNotifications.ts — User notification preference management.
 *
 * Users (not just owner) can opt-in to receive simplified event notifications
 * via email, SMS, or push. Owner receives full diagnostics via alertSettings.ts.
 *
 * FIX 3 Implementation: phone_number, email_notifications, sms_notifications,
 * push_notifications columns on the users table (migration 43).
 *
 * Endpoints:
 *   GET  /api/user/notification-prefs  — read current prefs (self only)
 *   PUT  /api/user/notification-prefs  — update prefs (self only)
 */
import { Router, type IRouter } from "express";
import { createClient } from "../lib/dbCompat.js";
import { requireAuth, getAuthedUser } from "../lib/replitAuth.js";
import { logger } from "../lib/logger.js";

function serviceClient() {
  const url = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const router: IRouter = Router();

const ALLOWED_COLUMNS = new Set([
  "phone_number",
  "email_notifications",
  "sms_notifications",
  "push_notifications",
  "push_token",
]);

/* ── GET /api/user/notification-prefs ─────────────────────────────────── */
router.get("/user/notification-prefs", requireAuth as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const db   = serviceClient();
    const { data, error } = await db
      .from("users")
      .select("phone_number, email_notifications, sms_notifications, push_notifications, push_token")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      if ((error.message ?? "").toLowerCase().includes("does not exist")) {
        (res as any).status(503).json({
          error: "Migration 43 not yet applied. Run 43-user-notification-prefs.sql in your Supabase SQL Editor.",
          migrationRequired: true,
        });
        return;
      }
      (res as any).status(500).json({ error: error.message });
      return;
    }

    (res as any).json({
      prefs: data ?? {
        phone_number:        null,
        email_notifications: false,
        sms_notifications:   false,
        push_notifications:  false,
        push_token:          null,
      },
    });
  } catch (err) {
    logger.error({ err }, "[userNotifications] GET error");
    (res as any).status(500).json({ error: "Internal error" });
  }
});

/* ── PUT /api/user/notification-prefs ─────────────────────────────────── */
router.put("/user/notification-prefs", requireAuth as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const db   = serviceClient();

    const body = req.body ?? {};

    /* Strip any keys that aren't notification pref columns */
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(body)) {
      if (ALLOWED_COLUMNS.has(key)) patch[key] = body[key];
    }

    /* Validate phone number if provided */
    if ("phone_number" in patch && patch.phone_number !== null) {
      const phone = String(patch.phone_number).trim();
      if (!/^\+?\d{7,15}$/.test(phone)) {
        (res as any).status(422).json({ error: "Invalid phone number. Use E.164 format (+639…)" });
        return;
      }
      patch.phone_number = phone;
    }

    if (Object.keys(patch).length === 0) {
      (res as any).status(422).json({ error: "No valid fields to update" });
      return;
    }

    patch.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from("users")
      .update(patch)
      .eq("id", user.id)
      .select("phone_number, email_notifications, sms_notifications, push_notifications, push_token")
      .single();

    if (error) {
      if ((error.message ?? "").toLowerCase().includes("does not exist")) {
        (res as any).status(503).json({
          error: "Migration 43 not yet applied. Run 43-user-notification-prefs.sql.",
          migrationRequired: true,
        });
        return;
      }
      (res as any).status(500).json({ error: error.message });
      return;
    }

    logger.info({ userId: user.id, patch: Object.keys(patch) }, "[userNotifications] updated");
    (res as any).json({ prefs: data });
  } catch (err) {
    logger.error({ err }, "[userNotifications] PUT error");
    (res as any).status(500).json({ error: "Internal error" });
  }
});

export default router;
