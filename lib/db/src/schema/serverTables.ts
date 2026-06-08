import {
  pgTable, text, integer, numeric, boolean, jsonb, bigint,
  timestamp, uuid, index, check,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull().default("Socia User"),
  username: text("username").notNull().default(""),
  avatarUrl: text("avatar_url").notNull().default(""),
  bio: text("bio").notNull().default(""),
  coverPhotoUrl: text("cover_photo_url"),
  followers: integer("followers").notNull().default(0),
  following: integer("following").notNull().default(0),
  isOwner: boolean("is_owner").notNull().default(false),
  isVerified: boolean("is_verified").notNull().default(false),
  isOnline: boolean("is_online").notNull().default(false),
  isBanned: boolean("is_banned").notNull().default(false),
  isSuspended: boolean("is_suspended").notNull().default(false),
  forceLogoutAt: timestamp("force_logout_at", { withTimezone: true }),
  subscriptionStatus: text("subscription_status").notNull().default("free"),
  planCode: text("plan_code").notNull().default("free"),
  creditsBalance: numeric("credits_balance", { precision: 10, scale: 2 }).notNull().default("0"),
  smartSaver: boolean("smart_saver").notNull().default(false),
  cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
  dailyImageCount: integer("daily_image_count").notNull().default(0),
  dailyVideoCount: integer("daily_video_count").notNull().default(0),
  dailyResetAt: timestamp("daily_reset_at", { withTimezone: true }),
  website: text("website").notNull().default(""),
  location: text("location").notNull().default(""),
  gender: text("gender").notNull().default("Prefer not to say"),
  birthday: text("birthday"),
  relationshipStatus: text("relationship_status").notNull().default("Prefer not to say"),
  work: text("work").notNull().default(""),
  workPrevious: text("work_previous").notNull().default(""),
  school: text("school").notNull().default(""),
  college: text("college").notNull().default(""),
  education: text("education").notNull().default(""),
  publicEmail: text("public_email").notNull().default(""),
  publicPhone: text("public_phone").notNull().default(""),
  socialFacebook: text("social_facebook").notNull().default(""),
  socialInstagram: text("social_instagram").notNull().default(""),
  socialTiktok: text("social_tiktok").notNull().default(""),
  socialX: text("social_x").notNull().default(""),
  socialYoutube: text("social_youtube").notNull().default(""),
  socialLinkedin: text("social_linkedin").notNull().default(""),
  privacySettings: jsonb("privacy_settings"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const studioProjects = pgTable("studio_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled Project"),
  frames: jsonb("frames").notNull().default([]),
  config: jsonb("config").notNull().default({}),
  version: integer("version").default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const renderJobs = pgTable("render_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => studioProjects.id, { onDelete: "set null" }),
  status: text("status").notNull().default("queued"),
  stage: text("stage").notNull().default("queued"),
  progress: numeric("progress", { precision: 5, scale: 2 }).default("0"),
  priority: integer("priority").notNull().default(2),
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),
  failureReason: text("failure_reason"),
  lastError: text("last_error"),
  workerId: text("worker_id"),
  workerHeartbeat: timestamp("worker_heartbeat", { withTimezone: true }),
  renderEngine: text("render_engine").notNull().default("luma"),
  planCode: text("plan_code"),
  outputUrl: text("output_url"),
  thumbnailUrl: text("thumbnail_url"),
  previewStripUrl: text("preview_strip_url"),
  durationSec: numeric("duration_sec", { precision: 8, scale: 2 }),
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
  completedStages: text("completed_stages").array().default([]),
  inputPayload: jsonb("input_payload").notNull().default({}),
  segmentMeta: jsonb("segment_meta").default([]),
  encodingState: jsonb("encoding_state").default({}),
  queuedAt: timestamp("queued_at", { withTimezone: true }).defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("render_jobs_queue_idx").on(t.priority, t.queuedAt),
  index("render_jobs_user_idx").on(t.userId, t.createdAt),
  index("render_jobs_worker_idx").on(t.workerId, t.workerHeartbeat),
]);

export const usageReceipts = pgTable("usage_receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  paymentOrderId: text("payment_order_id"),
  toolUsed: text("tool_used").notNull(),
  modelUsed: text("model_used"),
  generationType: text("generation_type"),
  requestId: text("request_id"),
  estimatedCost: numeric("estimated_cost", { precision: 10, scale: 4 }).notNull().default("0"),
  durationMs: integer("duration_ms"),
  queueTimeMs: integer("queue_time_ms"),
  tokenUsage: jsonb("token_usage"),
  status: text("status").notNull().default("success"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("usage_receipts_user_idx").on(t.userId, t.createdAt),
  index("usage_receipts_status_idx").on(t.status),
]);

export const creditLedger = pgTable("credit_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  action: text("action").notNull(),
  reason: text("reason"),
  ref: text("ref"),
  balanceAfter: numeric("balance_after", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sociaGptMemory = pgTable("socia_gpt_memory", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  profile: text("profile").notNull(),
  summary: text("summary").notNull(),
  turnCount: integer("turn_count").notNull().default(0),
  snapshotAtTurn: integer("snapshot_at_turn").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("socia_gpt_memory_user_profile_idx").on(t.userId, t.profile),
]);

export const adminAuditLog = pgTable("admin_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminId: text("admin_id"),
  username: text("username"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  meta: jsonb("meta"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const superAdmins = pgTable("super_admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("admin"),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type RenderJob = typeof renderJobs.$inferSelect;
export type InsertRenderJob = typeof renderJobs.$inferInsert;
export type StudioProject = typeof studioProjects.$inferSelect;
export type UsageReceipt = typeof usageReceipts.$inferSelect;
export type SociaGptMemory = typeof sociaGptMemory.$inferSelect;
export type SuperAdmin = typeof superAdmins.$inferSelect;
