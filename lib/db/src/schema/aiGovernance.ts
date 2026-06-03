import {
  pgTable,
  serial,
  text,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * ai_governance_config — single owner-editable configuration row that overlays
 * the static config-truth in `aiTopology.ts`. An ABSENT row (or empty config)
 * means "permissive defaults" — i.e. the pipeline behaves exactly as it did
 * before governance existed. The config jsonb holds provider/model/feature
 * enable flags, ordered per-feature routing chains with failover, per-scope
 * budgets, and the global flags (kill switch / auto-pause / auto-throttle).
 *
 * Stored as a single jsonb blob (not relational) so that a save is atomic and
 * trivially versioned/validated as one unit, and so adding new governance
 * dimensions never requires a migration. Read/written through the service-role
 * Supabase client by owner-gated routes only.
 */
export const aiGovernanceConfig = pgTable("ai_governance_config", {
  id: text("id").primaryKey(), // always the literal "singleton"
  config: jsonb("config").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedBy: text("updated_by"),
});

/**
 * ai_enforcement_events — append-only audit log of every governance action:
 * runtime enforcement (block / kill-switch / budget-pause / throttle /
 * failover) and owner config changes. Surfaced in the AI Activity feed.
 */
export const aiEnforcementEvents = pgTable("ai_enforcement_events", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  // 'block' | 'kill_switch' | 'budget_pause' | 'throttle' | 'failover' | 'config_change'
  eventType: text("event_type").notNull(),
  feature: text("feature"), // usage_receipts.tool_used
  fromProvider: text("from_provider"),
  toProvider: text("to_provider"),
  model: text("model"),
  reason: text("reason").notNull(),
  // 'global' | 'feature' | 'provider' | 'model'
  scope: text("scope"),
  actor: text("actor"), // owner email for config_change, 'system' for runtime
  meta: jsonb("meta"),
});

export type AiGovernanceConfigRow = typeof aiGovernanceConfig.$inferSelect;
export type AiEnforcementEventRow = typeof aiEnforcementEvents.$inferSelect;
