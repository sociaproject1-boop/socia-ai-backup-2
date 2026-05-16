/**
 * Admin Socket.IO namespace — real-time fraud intelligence channel.
 *
 * Namespace: /admin
 * Auth:      Bearer JWT in socket.handshake.auth.token
 *
 * Server → client events:
 *   history        FraudEvent[]         – last 50 events on connect
 *   reviewers      ReviewerPresence[]   – current active admin list on connect
 *   fraud:alert    FraudEvent           – new high-risk event
 *   audit:event    FraudEvent           – admin action event
 *   reviewer:joined ReviewerPresence
 *   reviewer:left  { socketId }
 *   reviewer:update ReviewerPresence
 *
 * Client → server events:
 *   reviewing      string               – current view the admin is on
 */
import type { Server, Namespace, Socket } from "socket.io";
import { verifyAdminToken, type AdminClaims } from "./adminAuth.js";
import { logger } from "./logger.js";

/* ── Types ────────────────────────────────────────────────────────────── */

export interface FraudEvent {
  id: string;
  type:
    | "fraud_detected"
    | "receipt_blocked"
    | "duplicate_found"
    | "tamper_detected"
    | "high_score"
    | "admin_action"
    | "admin_login"
    | "suspicious"
    | "refund_decision"
    | "funding_decision"
    | "system";
  severity: "critical" | "high" | "medium" | "low" | "info";
  message: string;
  details?: Record<string, unknown>;
  userId?:       string;
  username?:     string;
  adminUsername?: string;
  score?:        number;
  reference?:    string;
  amount?:       number;
  ts: string;
}

export interface ReviewerPresence {
  socketId:     string;
  username:     string;
  role:         string;
  currentView?: string;
  connectedAt:  string;
}

type AdminSocket = Socket & { adminClaims: AdminClaims };

/* ── State ────────────────────────────────────────────────────────────── */

const MAX_EVENTS = 200;
const recentEvents: FraudEvent[] = [];
const reviewers    = new Map<string, ReviewerPresence>();
let   adminNs: Namespace | null  = null;

/* ── Surge detection ──────────────────────────────────────────────────── */
const SURGE_WINDOW    = 60_000; // 1 minute
const SURGE_THRESHOLD = 4;     // critical+high events
const surgeTimes: number[] = [];
let   surgeActive = false;

function checkSurge(event: FraudEvent): void {
  if (event.severity !== "critical" && event.severity !== "high") return;
  const now = Date.now();
  surgeTimes.push(now);
  while (surgeTimes.length > 0 && now - (surgeTimes[0] ?? 0) > SURGE_WINDOW) {
    surgeTimes.shift();
  }
  if (!surgeActive && surgeTimes.length >= SURGE_THRESHOLD) {
    surgeActive = true;
    adminNs?.emit("fraud:surge", {
      count:          surgeTimes.length,
      window_seconds: SURGE_WINDOW / 1_000,
      ts:             new Date().toISOString(),
    });
    // Auto-clear surge flag after 90 s
    setTimeout(() => { surgeActive = false; }, 90_000);
  }
}

/* ── Event batching ───────────────────────────────────────────────────── */
let   batchTimer: ReturnType<typeof setTimeout> | null = null;
const batchBuffer: FraudEvent[] = [];

function queueBatch(event: FraudEvent): void {
  batchBuffer.push(event);
  if (!batchTimer) {
    batchTimer = setTimeout(() => {
      if (batchBuffer.length > 0) adminNs?.emit("fraud:batch", [...batchBuffer]);
      batchBuffer.length = 0;
      batchTimer = null;
    }, 16); // 1 frame — coalesce rapid events
  }
}

/* ── Setup ────────────────────────────────────────────────────────────── */

export function setupAdminSocket(io: Server): void {
  adminNs = io.of("/admin");

  /* JWT auth middleware */
  adminNs.use((socket, next) => {
    const token = (socket.handshake.auth as { token?: string }).token;
    if (!token) { next(new Error("UNAUTHENTICATED")); return; }
    const claims = verifyAdminToken(token);
    if (!claims) { next(new Error("INVALID_TOKEN"));   return; }
    (socket as AdminSocket).adminClaims = claims;
    next();
  });

  adminNs.on("connection", (rawSocket) => {
    const socket = rawSocket as AdminSocket;
    const { username, role } = socket.adminClaims;

    logger.info({ username, socketId: socket.id }, "[admin-socket] reviewer connected");

    /* Track presence */
    const presence: ReviewerPresence = {
      socketId:    socket.id,
      username,
      role,
      connectedAt: new Date().toISOString(),
    };
    reviewers.set(socket.id, presence);

    /* Send current state */
    socket.emit("history",   recentEvents.slice(-50));
    socket.emit("reviewers", Array.from(reviewers.values()));

    /* Notify others */
    socket.broadcast.emit("reviewer:joined", presence);

    /* Reviewer updates current view */
    socket.on("reviewing", (view: unknown) => {
      if (typeof view !== "string") return;
      const r = reviewers.get(socket.id);
      if (r) {
        r.currentView = view;
        adminNs!.emit("reviewer:update", r);
      }
    });

    socket.on("disconnect", () => {
      reviewers.delete(socket.id);
      adminNs!.emit("reviewer:left", { socketId: socket.id });
      logger.info({ username, socketId: socket.id }, "[admin-socket] reviewer disconnected");
    });

    /* Broadcast login event */
    broadcastAuditEvent({
      type:          "admin_login",
      severity:      "info",
      message:       `Admin "${username}" connected`,
      adminUsername: username,
    });
  });
}

/* ── Broadcasters (callable from routes) ──────────────────────────────── */

function pushEvent(event: FraudEvent): void {
  recentEvents.push(event);
  if (recentEvents.length > MAX_EVENTS) recentEvents.shift();
}

export function broadcastFraudEvent(
  event: Omit<FraudEvent, "id" | "ts">,
): void {
  const full: FraudEvent = {
    ...event,
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
  };
  pushEvent(full);
  adminNs?.emit("fraud:alert", full);
  queueBatch(full);
  checkSurge(full);
}

export function broadcastAuditEvent(
  event: Omit<FraudEvent, "id" | "ts">,
): void {
  const full: FraudEvent = {
    ...event,
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
  };
  pushEvent(full);
  adminNs?.emit("audit:event", full);
}

export function broadcastTransactionEvent(event: {
  orderId?:      string;
  userId?:       string;
  username?:     string;
  amount?:       number;
  action:        "order_created" | "order_approved" | "order_rejected" | "topup" | "subscription";
  fraudScore?:   number;
  reference?:    string;
}): void {
  broadcastFraudEvent({
    type:      "system",
    severity:  (event.fraudScore ?? 0) >= 70 ? "high" : "info",
    message:   `Transaction ${event.action.replace("_", " ")}${event.amount ? ` — ₱${event.amount.toLocaleString()}` : ""}`,
    userId:    event.userId,
    username:  event.username,
    reference: event.reference,
    score:     event.fraudScore,
    amount:    event.amount,
    details:   { orderId: event.orderId, action: event.action },
  });
}

export function getRecentEvents(): FraudEvent[] {
  return [...recentEvents];
}

export function getActiveReviewers(): ReviewerPresence[] {
  return Array.from(reviewers.values());
}
