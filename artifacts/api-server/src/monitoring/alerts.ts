/**
 * monitoring/alerts.ts — proactive owner notifications (email / SMS / webhook)
 * for provider incidents detected by the background monitor.
 *
 * Design contract (mirrors the rest of the monitoring subsystem):
 *   - FULLY ISOLATED: imports only the store (de-dupe memory), the registry
 *     (owner email + provider links) and the logger. It NEVER touches
 *     checkout / subscription / auth / AI-gen code.
 *   - FAILSAFE: every dispatch is wrapped so a notification failure can never
 *     throw into the sweep loop or affect checkout. The worst a broken channel
 *     can do is log a warning.
 *   - DE-DUPED: one alert per incident (not per 5-min sweep), plus a single
 *     recovery notice when the provider returns to ONLINE. The de-dupe memory
 *     lives in the store and is persisted across restarts.
 *   - DEPENDENCY-FREE: channels are plain HTTPS calls (Resend for email,
 *     Twilio for SMS, a generic JSON webhook for Slack/Discord/custom), so no
 *     new packages are added and each channel is opt-in via env.
 */
import { logger } from "../lib/logger.js";
import { OWNER_EMAIL, PROVIDERS } from "./registry.js";
import {
  clearAlertIncident,
  getAlertIncident,
  setAlertIncident,
} from "./store.js";
import type { AlertIncident, ProviderHealth, StatusLevel } from "./types.js";

/** Hard timeout for any single notification HTTP call (ms). */
const ALERT_TIMEOUT_MS = 10_000;

/** Statuses that constitute an "incident" worth alerting the owner about. */
function isAlerting(status: StatusLevel): boolean {
  return status === "MAINTENANCE" || status === "OUTAGE";
}

/* ── Channel configuration (all opt-in via env) ────────────────────────────*/

interface AlertConfig {
  enabled: boolean;
  email: { apiKey: string; to: string; from: string } | null;
  sms: { sid: string; token: string; from: string; to: string } | null;
  webhook: { url: string } | null;
}

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * Read the alert configuration from the environment on each dispatch. A channel
 * is active only when ALL of its required vars are present, so partial config
 * silently no-ops instead of throwing. Set ALERTS_ENABLED=false to mute every
 * channel without removing the credentials.
 */
export function getAlertConfig(): AlertConfig {
  const enabled = env("ALERTS_ENABLED").toLowerCase() !== "false";

  const resendKey = env("ALERT_RESEND_API_KEY") || env("RESEND_API_KEY");
  const emailTo = env("ALERT_EMAIL_TO") || OWNER_EMAIL;
  const emailFrom = env("ALERT_EMAIL_FROM") || "Socia Monitor <onboarding@resend.dev>";
  const email = resendKey && emailTo ? { apiKey: resendKey, to: emailTo, from: emailFrom } : null;

  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  const smsFrom = env("TWILIO_SMS_FROM") || env("TWILIO_FROM");
  const smsTo = env("ALERT_SMS_TO");
  const sms = sid && token && smsFrom && smsTo ? { sid, token, from: smsFrom, to: smsTo } : null;

  const webhookUrl = env("ALERT_WEBHOOK_URL");
  const webhook = webhookUrl ? { url: webhookUrl } : null;

  return { enabled, email, sms, webhook };
}

/** True when at least one channel is configured (used for diagnostics). */
export function alertsConfigured(): boolean {
  const c = getAlertConfig();
  return c.enabled && Boolean(c.email || c.sms || c.webhook);
}

/* ── Low-level senders (each failsafe) ─────────────────────────────────────*/

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ALERT_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function sendEmail(cfg: NonNullable<AlertConfig["email"]>, subject: string, body: string): Promise<void> {
  const res = await timedFetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: cfg.from,
      to: cfg.to.split(",").map((s) => s.trim()).filter(Boolean),
      subject,
      text: body,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend responded ${res.status}`);
  }
}

async function sendSms(cfg: NonNullable<AlertConfig["sms"]>, body: string): Promise<void> {
  const auth = Buffer.from(`${cfg.sid}:${cfg.token}`).toString("base64");
  const form = new URLSearchParams({ To: cfg.to, From: cfg.from, Body: body.slice(0, 1500) });
  const res = await timedFetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.sid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    },
  );
  if (!res.ok) {
    throw new Error(`Twilio responded ${res.status}`);
  }
}

async function sendWebhook(cfg: NonNullable<AlertConfig["webhook"]>, subject: string, body: string, alert: AlertPayload): Promise<void> {
  const text = `${subject}\n${body}`;
  const res = await timedFetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // `text` works for Slack, `content` for Discord; the structured fields let a
    // custom endpoint render its own message. Unknown fields are ignored.
    body: JSON.stringify({ text, content: text, ...alert }),
  });
  if (!res.ok) {
    throw new Error(`Webhook responded ${res.status}`);
  }
}

/* ── Public dispatch ───────────────────────────────────────────────────────*/

export interface AlertPayload {
  kind: "down" | "change" | "recovery";
  /** Whether this alert is about a status transition or a balance threshold. */
  topic: "status" | "balance";
  providerId: string;
  label: string;
  status: StatusLevel;
  message: string;
  at: string;
}

/** Outcome of a dispatch — used by the incident bookkeeping to decide retries. */
export interface DispatchResult {
  /** Channels that accepted the alert. */
  delivered: number;
  /** Channels that were configured + attempted (0 = nothing to retry). */
  attempted: number;
}

function severityEmoji(kind: AlertPayload["kind"], status: StatusLevel): string {
  if (kind === "recovery") return "✅";
  return status === "OUTAGE" ? "🔴" : "🟠";
}

function providerLinks(providerId: string): string {
  const def = PROVIDERS.find((p) => p.id === providerId);
  const links = def?.links;
  if (!links) return "";
  const lines: string[] = [];
  if (links.dashboard) lines.push(`Dashboard: ${links.dashboard}`);
  if (links.topUp) lines.push(`Top up: ${links.topUp}`);
  if (links.status) lines.push(`Status page: ${links.status}`);
  return lines.length ? `\n\n${lines.join("\n")}` : "";
}

function renderMessage(alert: AlertPayload): { subject: string; body: string } {
  if (alert.topic === "balance") {
    if (alert.kind === "recovery") {
      return {
        subject: `✅ Socia: ${alert.label} balance restored`,
        body: `${alert.label} balance is back above the alert threshold.\nDetail: ${alert.message}\nTime: ${alert.at}`,
      };
    }
    return {
      subject: `💸 Socia: ${alert.label} balance low`,
      body: `${alert.label} is running low on balance.\nDetail: ${alert.message}\nTime: ${alert.at}${providerLinks(alert.providerId)}`,
    };
  }

  const icon = severityEmoji(alert.kind, alert.status);
  const verb =
    alert.kind === "recovery"
      ? "recovered"
      : alert.kind === "change"
        ? `changed to ${alert.status}`
        : `is ${alert.status}`;
  const subject = `${icon} Socia: ${alert.label} ${verb}`;
  const body =
    `${alert.label} ${verb}.\n` +
    `Detail: ${alert.message}\n` +
    `Time: ${alert.at}` +
    (alert.kind === "recovery" ? "" : providerLinks(alert.providerId));
  return { subject, body };
}

/**
 * Fan out a single alert to every configured channel. Returns how many channels
 * accepted it and how many were attempted. NEVER throws — each channel is
 * independently isolated so one broken integration can't suppress the others or
 * the sweep loop.
 */
export async function dispatchAlert(alert: AlertPayload): Promise<DispatchResult> {
  const cfg = getAlertConfig();
  if (!cfg.enabled) {
    logger.info({ provider: alert.providerId, kind: alert.kind }, "[alerts] muted (ALERTS_ENABLED=false)");
    return { delivered: 0, attempted: 0 };
  }
  if (!cfg.email && !cfg.sms && !cfg.webhook) {
    logger.warn(
      { provider: alert.providerId, status: alert.status, kind: alert.kind },
      "[alerts] incident detected but NO channel configured — set ALERT_WEBHOOK_URL / RESEND_API_KEY / Twilio vars",
    );
    return { delivered: 0, attempted: 0 };
  }

  const { subject, body } = renderMessage(alert);
  const tasks: Array<{ name: string; run: () => Promise<void> }> = [];
  if (cfg.email) tasks.push({ name: "email", run: () => sendEmail(cfg.email!, subject, body) });
  if (cfg.sms) tasks.push({ name: "sms", run: () => sendSms(cfg.sms!, `${subject}\n${body}`) });
  if (cfg.webhook) tasks.push({ name: "webhook", run: () => sendWebhook(cfg.webhook!, subject, body, alert) });

  const results = await Promise.allSettled(tasks.map((t) => t.run()));
  let ok = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      ok += 1;
    } else {
      logger.warn(
        { channel: tasks[i]!.name, err: (r.reason as Error)?.message, provider: alert.providerId },
        "[alerts] channel send failed (ignored)",
      );
    }
  });
  logger.info(
    { provider: alert.providerId, topic: alert.topic, status: alert.status, kind: alert.kind, channels: ok, attempted: tasks.length },
    "[alerts] dispatched",
  );
  return { delivered: ok, attempted: tasks.length };
}

/* ── Incident evaluation (the de-dupe brain) ───────────────────────────────*/

/**
 * A notification is considered "settled" (won't be retried) when either nothing
 * was attempted (no channel configured — not a transient failure) OR at least
 * one channel accepted it. A settled send stamps `notifiedAt`; an unsettled one
 * leaves it empty so a later sweep retries WITHOUT re-opening or duplicating the
 * incident — preventing a single transient outage of the alert channel from
 * permanently suppressing the alert.
 */
function settled(res: DispatchResult): boolean {
  return res.attempted === 0 || res.delivered > 0;
}

/** Parse the low-balance threshold for a provider (per-provider env wins). */
function balanceThreshold(providerId: string): number | null {
  const raw =
    env(`ALERT_BALANCE_MIN_${providerId.toUpperCase()}`) || env("ALERT_BALANCE_MIN");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * Status-transition lifecycle. Driven purely by the persisted incident (not the
 * prior in-memory status) so it is correct across restarts:
 *   - Enters MAINTENANCE/OUTAGE, no open incident → DOWN alert + open it.
 *   - MAINTENANCE↔OUTAGE level change → CHANGE alert + update.
 *   - Same alerting level already notified → de-duped (silent).
 *   - Previous send failed (notifiedAt empty) → retried next sweep.
 *   - Returns to ONLINE → RECOVERY alert, cleared once the notice settles.
 *   - DEGRADED / UNKNOWN while open → kept open, silent (UNKNOWN ≠ recovery).
 */
async function evaluateStatus(next: ProviderHealth, now: string): Promise<void> {
  const key = `${next.id}:status`;
  const open = getAlertIncident(key);

  if (isAlerting(next.status)) {
    const sameLevel = open?.level === next.status;
    if (open && sameLevel && open.notifiedAt) return; // de-duped
    const kind: AlertPayload["kind"] = open && !sameLevel ? "change" : "down";
    const res = await dispatchAlert({
      kind,
      topic: "status",
      providerId: next.id,
      label: next.label,
      status: next.status,
      message: next.message,
      at: now,
    });
    setAlertIncident(key, {
      providerId: next.id,
      label: next.label,
      kind: "status",
      level: next.status,
      message: next.message,
      openedAt: open?.openedAt ?? now,
      notifiedAt: settled(res) ? now : "",
    });
    return;
  }

  // Not alerting. Only a confirmed return to ONLINE clears + notifies.
  if (open && next.status === "ONLINE") {
    const res = await dispatchAlert({
      kind: "recovery",
      topic: "status",
      providerId: next.id,
      label: next.label,
      status: next.status,
      message: next.message,
      at: now,
    });
    // If the recovery notice failed to send, keep the incident open so the next
    // sweep retries it; clear only once the owner has actually been told.
    if (settled(res)) clearAlertIncident(key);
  }
  // DEGRADED / UNKNOWN with an open incident → keep it open, stay silent.
}

/**
 * Low-balance lifecycle for providers that expose a REAL queryable balance
 * (next.balance.supported === true). Requires a configured threshold via
 * `ALERT_BALANCE_MIN` (or per-provider `ALERT_BALANCE_MIN_<ID>`); without one
 * there is no balance alerting at all (no false alarms).
 *   - Balance ≤ threshold, no open incident → LOW alert + open it.
 *   - Already alerted → de-duped; previous failure → retried.
 *   - Balance back above threshold → RECOVERY alert, cleared once it settles.
 *   - Balance not exposed / probe failed (supported false) → existing incident
 *     kept open, silent (never a false recovery).
 */
async function evaluateBalance(next: ProviderHealth, now: string): Promise<void> {
  const threshold = balanceThreshold(next.id);
  if (threshold === null) return; // balance alerting not configured

  const bal = next.balance;
  if (!bal || !bal.supported || typeof bal.amount !== "number") return; // unknown → silent

  const key = `${next.id}:balance`;
  const open = getAlertIncident(key);
  const unit = bal.currency ?? "credits";

  if (bal.amount <= threshold) {
    if (open && open.notifiedAt) return; // de-duped
    const message = `${fmt(bal.amount)} ${unit} remaining (alert threshold ${fmt(threshold)} ${unit}).`;
    const res = await dispatchAlert({
      kind: "down",
      topic: "balance",
      providerId: next.id,
      label: next.label,
      status: next.status,
      message,
      at: now,
    });
    setAlertIncident(key, {
      providerId: next.id,
      label: next.label,
      kind: "balance",
      level: next.status,
      message,
      openedAt: open?.openedAt ?? now,
      notifiedAt: settled(res) ? now : "",
    });
    return;
  }

  // Balance is healthy again.
  if (open) {
    const message = `${fmt(bal.amount)} ${unit} remaining (alert threshold ${fmt(threshold)} ${unit}).`;
    const res = await dispatchAlert({
      kind: "recovery",
      topic: "balance",
      providerId: next.id,
      label: next.label,
      status: next.status,
      message,
      at: now,
    });
    if (settled(res)) clearAlertIncident(key);
  }
}

/**
 * Evaluate both incident lifecycles (status + balance) for a provider's latest
 * health and dispatch any warranted notification. NEVER throws — each lifecycle
 * is independently wrapped so one failing path can't block the other or the
 * sweep loop / checkout.
 */
export async function evaluateAndDispatch(next: ProviderHealth): Promise<void> {
  const now = next.lastChecked ?? new Date().toISOString();
  try {
    await evaluateStatus(next, now);
  } catch (err) {
    logger.warn({ err: (err as Error).message, provider: next.id }, "[alerts] status evaluation failed (ignored)");
  }
  try {
    await evaluateBalance(next, now);
  } catch (err) {
    logger.warn({ err: (err as Error).message, provider: next.id }, "[alerts] balance evaluation failed (ignored)");
  }
}
