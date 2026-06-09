---
name: heliumdb schema types
description: All ID columns in heliumdb are text (not uuid); FK columns referencing users.id must also be text. Social schema (59 tables) now fully migrated.
---

## Rule
`users.id` in heliumdb is type `text` (not `uuid`). Any new table with a FK to `users(id)` MUST declare that column as `text`, not `uuid`. All primary key `id` columns should use `DEFAULT gen_random_uuid()::text`.

**Why:** The migration from Supabase used custom email/password auth that stores IDs as plain text strings (UUIDs formatted as text). PostgreSQL won't allow a `uuid FK` → `text PK` relationship and throws "cannot be implemented" error.

**How to apply:** Whenever creating new tables that join to users, posts, comments, or any other social table, use `text` for all FK columns. Use `gen_random_uuid()::text` as the default for PK columns.

## Schema state (59 tables in public schema)
All social tables are now present in heliumdb. Full list:
admin_audit_log, ai_abuse_flags, ai_billing_history, ai_cooldowns, ai_enforcement_events,
ai_governance_config, ai_requests, ai_subscriptions, ai_usage_tracking, alert_settings,
chat_group_members, chat_group_messages, chat_group_reads, chat_groups, comments,
community_funding (with global row 00000000-0000-0000-0000-000000000001),
community_support, conversations, creator_star_ledger, creator_star_transactions,
creator_star_wallets, credit_ledger, follows, fraud_flags, funding_donations, hashtags,
likes, messages, payment_receipts, paymongo_payments, post_hashtags, post_media,
post_notifications, post_views, posts, pulse_reactions, pulse_reports, pulse_views, pulses,
refund_decisions, refund_messages, refund_notifications, refund_requests, render_jobs,
reports, saves, shares, socia_gpt_memory, sound_usage, sounds, stream_comments,
stream_reactions, stream_sessions, stream_viewers, studio_projects, super_admins,
usage_receipts, user_notification_prefs, users

## gen_random_bytes unavailable
`gen_random_bytes()` (pgcrypto) is NOT available in heliumdb. Use `md5(gen_random_uuid()::text)` instead for random hex strings (e.g. stream_key default).
