-- ============================================================
-- SOCIA — Complete Replit PostgreSQL Migration
-- Converts all Supabase schemas to plain PostgreSQL
-- No RLS policies, no auth.uid() references
-- users.id is TEXT (Supabase UIDs stored as text)
-- ============================================================

-- Enable uuid extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. USERS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                          TEXT        PRIMARY KEY,
  email                       TEXT        NOT NULL DEFAULT '',
  name                        TEXT        NOT NULL DEFAULT 'Socia User',
  username                    TEXT        NOT NULL DEFAULT '',
  avatar_url                  TEXT        NOT NULL DEFAULT '',
  bio                         TEXT        NOT NULL DEFAULT '',
  cover_photo_url             TEXT,
  followers                   INTEGER     NOT NULL DEFAULT 0,
  following                   INTEGER     NOT NULL DEFAULT 0,
  is_owner                    BOOLEAN     NOT NULL DEFAULT false,
  is_verified                 BOOLEAN     NOT NULL DEFAULT false,
  is_online                   BOOLEAN     NOT NULL DEFAULT false,
  is_banned                   BOOLEAN     NOT NULL DEFAULT false,
  is_suspended                BOOLEAN     NOT NULL DEFAULT false,
  force_logout_at             TIMESTAMPTZ,
  subscription_status         TEXT        NOT NULL DEFAULT 'free',
  plan_code                   TEXT        NOT NULL DEFAULT 'free',
  credits_balance             NUMERIC(10,2) NOT NULL DEFAULT 0,
  smart_saver                 BOOLEAN     NOT NULL DEFAULT false,
  cooldown_until              TIMESTAMPTZ,
  daily_image_count           INTEGER     NOT NULL DEFAULT 0,
  daily_video_count           INTEGER     NOT NULL DEFAULT 0,
  daily_reset_at              TIMESTAMPTZ,
  website                     TEXT        NOT NULL DEFAULT '',
  location                    TEXT        NOT NULL DEFAULT '',
  gender                      TEXT        NOT NULL DEFAULT 'Prefer not to say',
  birthday                    TEXT,
  relationship_status         TEXT        NOT NULL DEFAULT 'Prefer not to say',
  work                        TEXT        NOT NULL DEFAULT '',
  work_previous               TEXT        NOT NULL DEFAULT '',
  school                      TEXT        NOT NULL DEFAULT '',
  college                     TEXT        NOT NULL DEFAULT '',
  education                   TEXT        NOT NULL DEFAULT '',
  public_email                TEXT        NOT NULL DEFAULT '',
  public_phone                TEXT        NOT NULL DEFAULT '',
  social_facebook             TEXT        NOT NULL DEFAULT '',
  social_instagram            TEXT        NOT NULL DEFAULT '',
  social_tiktok               TEXT        NOT NULL DEFAULT '',
  social_x                    TEXT        NOT NULL DEFAULT '',
  social_youtube              TEXT        NOT NULL DEFAULT '',
  social_linkedin             TEXT        NOT NULL DEFAULT '',
  privacy_settings            JSONB,
  password_hash               TEXT,
  last_seen                   TIMESTAMPTZ,
  priority_tier               SMALLINT    NOT NULL DEFAULT 0,
  daily_chat_used             INTEGER     NOT NULL DEFAULT 0,
  daily_image_used            INTEGER     NOT NULL DEFAULT 0,
  daily_video_used            INTEGER     NOT NULL DEFAULT 0,
  daily_chat_quota            INTEGER     NOT NULL DEFAULT 20,
  daily_image_quota           INTEGER     NOT NULL DEFAULT 3,
  daily_video_quota           INTEGER     NOT NULL DEFAULT 0,
  cinematic_projects_remaining  INTEGER   NOT NULL DEFAULT 0,
  cinematic_projects_used_month INTEGER   NOT NULL DEFAULT 0,
  headline                    TEXT,
  pronunciation               TEXT,
  interests                   TEXT,
  skills                      TEXT,
  languages                   TEXT,
  timezone                    TEXT,
  mood_emoji                  TEXT,
  mood_status                 TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users(LOWER(username));
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ── 2. MESSAGES (social DMs) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id     TEXT        NOT NULL,
  receiver_id   TEXT        NOT NULL,
  text          TEXT,
  image_url     TEXT,
  audio_url     TEXT,
  seen          BOOLEAN     NOT NULL DEFAULT false,
  seen_at       TIMESTAMPTZ,
  edited        BOOLEAN     NOT NULL DEFAULT false,
  edited_at     TIMESTAMPTZ,
  reply_to_id   UUID        REFERENCES messages(id) ON DELETE SET NULL,
  delivered_at  TIMESTAMPTZ,
  ai_generated  BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_sender   ON messages(sender_id,   created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON messages(reply_to_id) WHERE reply_to_id IS NOT NULL;

-- ── 3. NOTIFICATIONS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL,
  type       TEXT        NOT NULL DEFAULT 'message',
  data       JSONB       NOT NULL DEFAULT '{}',
  read       BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

-- ── 4. FOLLOWS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follows (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  TEXT        NOT NULL,
  following_id TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower  ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

-- ── 5. TYPING STATUS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS typing_status (
  user_id         TEXT        PRIMARY KEY,
  conversation_id TEXT        NOT NULL DEFAULT '',
  is_typing       BOOLEAN     NOT NULL DEFAULT false,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. MESSAGE REACTIONS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_reactions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID        NOT NULL,
  user_id    TEXT        NOT NULL,
  emoji      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_id);

-- ── 7. NICKNAMES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nicknames (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT        NOT NULL,
  target_user_id TEXT        NOT NULL,
  nickname       TEXT        NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, target_user_id)
);

-- ── 8. SUBSCRIPTIONS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id, status);

-- ── 9. APP CONFIG ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_config (key, value) VALUES ('min_version', '0.0.0') ON CONFLICT (key) DO NOTHING;

-- ── 10. SOUNDS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sounds (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT        NOT NULL,
  cover_image      TEXT,
  audio_url        TEXT        NOT NULL,
  creator_id       TEXT,
  source_type      TEXT        NOT NULL DEFAULT 'original'
                               CHECK (source_type IN ('original', 'remix', 'user_upload')),
  duration_seconds INTEGER,
  usage_count      INTEGER     NOT NULL DEFAULT 0,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sounds_usage_count ON sounds(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_sounds_creator_id  ON sounds(creator_id);

-- ── 11. POSTS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS posts (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id             TEXT        NOT NULL,
  caption               TEXT,
  type                  TEXT        NOT NULL DEFAULT 'photo' CHECK (type IN ('photo','video','multi')),
  view_count            INTEGER     NOT NULL DEFAULT 0,
  cached_like_count     INTEGER     NOT NULL DEFAULT 0,
  cached_comment_count  INTEGER     NOT NULL DEFAULT 0,
  cached_save_count     INTEGER     NOT NULL DEFAULT 0,
  total_watch_ms        BIGINT      NOT NULL DEFAULT 0,
  avg_retention_pct     REAL        NOT NULL DEFAULT 0,
  share_count           INTEGER     NOT NULL DEFAULT 0,
  trending_score        REAL        NOT NULL DEFAULT 0,
  sound_id              UUID        REFERENCES sounds(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_author   ON posts(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_trending ON posts(created_at DESC, trending_score DESC);
CREATE INDEX IF NOT EXISTS idx_posts_sound_id ON posts(sound_id) WHERE sound_id IS NOT NULL;

-- ── 12. POST MEDIA ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_media (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  url        TEXT        NOT NULL,
  type       TEXT        NOT NULL CHECK (type IN ('photo','video')),
  width      INTEGER,
  height     INTEGER,
  duration   INTEGER,
  position   INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_media_post_id ON post_media(post_id);

-- ── 13. COMMENTS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id         TEXT        NOT NULL,
  content           TEXT        NOT NULL,
  parent_comment_id UUID        REFERENCES comments(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_post_id   ON comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS comments_parent_id_idx ON comments(parent_comment_id) WHERE parent_comment_id IS NOT NULL;

-- ── 14. LIKES ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS likes (
  post_id    UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id);
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id);

-- ── 15. SAVES ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saves (
  post_id    UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- ── 16. SHARES ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shares (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 17. SOUND USAGE ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sound_usage (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sound_id   UUID        NOT NULL REFERENCES sounds(id)  ON DELETE CASCADE,
  post_id    UUID        NOT NULL REFERENCES posts(id)   ON DELETE CASCADE,
  user_id    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sound_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_sound_usage_sound_id ON sound_usage(sound_id);
CREATE INDEX IF NOT EXISTS idx_sound_usage_post_id  ON sound_usage(post_id);
CREATE INDEX IF NOT EXISTS idx_sound_usage_user_id  ON sound_usage(user_id);

-- ── 18. POST VIEWS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_views (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id    UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT post_views_unique UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS post_views_post_id_idx ON post_views(post_id);
CREATE INDEX IF NOT EXISTS post_views_user_id_idx ON post_views(user_id);

-- ── 19. POST NOTIFICATIONS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL,
  actor_id   TEXT,
  post_id    UUID        REFERENCES posts(id) ON DELETE CASCADE,
  comment_id UUID        REFERENCES comments(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL CHECK (type IN ('like','comment','reply','follow','mention','stars')),
  metadata   JSONB,
  read       BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS post_notifications_user_id_idx ON post_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS post_notifications_unread_idx  ON post_notifications(user_id, read) WHERE read = false;

-- ── 20. REPORTS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id TEXT        NOT NULL,
  post_id     UUID        REFERENCES posts(id) ON DELETE CASCADE,
  comment_id  UUID        REFERENCES comments(id) ON DELETE CASCADE,
  reason      TEXT        NOT NULL CHECK (reason IN ('spam','inappropriate','harassment','misinformation','other')),
  notes       TEXT,
  status      TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','dismissed','actioned')),
  reviewed_by TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS reports_status_idx  ON reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_post_id_idx ON reports(post_id) WHERE post_id IS NOT NULL;

-- ── 21. ALERT SETTINGS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_settings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT        NOT NULL,
  email_enabled   BOOLEAN     NOT NULL DEFAULT false,
  sms_enabled     BOOLEAN     NOT NULL DEFAULT false,
  webhook_enabled BOOLEAN     NOT NULL DEFAULT false,
  email_address   TEXT,
  phone_number    TEXT,
  webhook_url     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT alert_settings_user_id_unique UNIQUE (user_id)
);

-- ── 22. PULSES ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pulses (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT        NOT NULL,
  type          TEXT        NOT NULL CHECK (type IN ('image', 'video', 'text')),
  media_url     TEXT,
  text_content  TEXT,
  text_bg       TEXT        NOT NULL DEFAULT '#0f0f23',
  text_color    TEXT        NOT NULL DEFAULT '#ffffff',
  music_url     TEXT,
  music_name    TEXT,
  visibility    TEXT        NOT NULL DEFAULT 'public'
                            CHECK (visibility IN ('public', 'followers', 'friends', 'private')),
  is_reported   BOOLEAN     NOT NULL DEFAULT false,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pulses_user_id_idx    ON pulses(user_id);
CREATE INDEX IF NOT EXISTS pulses_expires_at_idx ON pulses(expires_at);

-- ── 23. PULSE VIEWS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pulse_views (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pulse_id   UUID        NOT NULL REFERENCES pulses(id) ON DELETE CASCADE,
  viewer_id  TEXT        NOT NULL,
  viewed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pulse_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS pulse_views_pulse_id_idx ON pulse_views(pulse_id);
CREATE INDEX IF NOT EXISTS pulse_views_viewer_idx   ON pulse_views(viewer_id);

-- ── 24. PULSE REACTIONS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pulse_reactions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pulse_id   UUID        NOT NULL REFERENCES pulses(id) ON DELETE CASCADE,
  user_id    TEXT        NOT NULL,
  emoji      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pulse_id, user_id)
);

-- ── 25. PULSE REPORTS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pulse_reports (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pulse_id    UUID        NOT NULL REFERENCES pulses(id) ON DELETE CASCADE,
  reporter_id TEXT        NOT NULL,
  reason      TEXT        NOT NULL DEFAULT 'Inappropriate content',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pulse_id, reporter_id)
);

-- ── 26. AI SUBSCRIPTIONS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_subscriptions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT        NOT NULL,
  plan_code      TEXT        NOT NULL CHECK (plan_code IN ('free','premium','ultra')),
  status         TEXT        NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active','cancelled','expired')),
  price_php      NUMERIC(10,2),
  period_days    INT,
  expires_at     TIMESTAMPTZ,
  payment_ref    TEXT,
  payment_method TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 27. AI USAGE TRACKING ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_usage_tracking (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT        NOT NULL,
  plan_code       TEXT        NOT NULL,
  period_type     TEXT        NOT NULL CHECK (period_type IN ('daily','monthly')),
  period_key      TEXT        NOT NULL,
  request_count   INT         NOT NULL DEFAULT 0,
  limit_count     INT         NOT NULL DEFAULT 15,
  reset_at        TIMESTAMPTZ NOT NULL,
  last_request_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, plan_code, period_key)
);

-- ── 28. AI REQUESTS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_requests (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT        NOT NULL,
  plan_code        TEXT        NOT NULL,
  model            TEXT        NOT NULL,
  mode             TEXT,
  input_chars      INT,
  output_chars     INT,
  attachment_count INT         DEFAULT 0,
  status           TEXT        DEFAULT 'completed'
                               CHECK (status IN ('completed','error','aborted','rate_limited')),
  error_code       TEXT,
  abuse_score      INT         DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_requests_user ON ai_requests(user_id, created_at DESC);

-- ── 29. AI COOLDOWNS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_cooldowns (
  user_id      TEXT        PRIMARY KEY,
  locked_until TIMESTAMPTZ,
  reason       TEXT,
  created_by   TEXT        DEFAULT 'system',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 30. AI ABUSE FLAGS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_abuse_flags (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT        NOT NULL,
  reason      TEXT        NOT NULL,
  abuse_score INT         DEFAULT 0,
  resolved    BOOLEAN     DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 31. AI BILLING HISTORY ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_billing_history (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT          NOT NULL,
  plan_code      TEXT          NOT NULL,
  amount_php     NUMERIC(10,2) NOT NULL,
  payment_method TEXT,
  payment_ref    TEXT,
  status         TEXT          DEFAULT 'pending'
                               CHECK (status IN ('pending','completed','failed','refunded')),
  notes          TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── 32. PAYMONGO PAYMENTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS paymongo_payments (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT        NOT NULL,
  plan_code            TEXT        NOT NULL,
  paymongo_session_id  TEXT,
  paymongo_payment_id  TEXT,
  amount_centavos      INTEGER     NOT NULL,
  status               TEXT        NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','paid','failed','cancelled','expired')),
  credits_added        INTEGER     NOT NULL DEFAULT 0,
  paid_at              TIMESTAMPTZ,
  processed_event_ids  TEXT[]      NOT NULL DEFAULT '{}',
  raw_session          JSONB,
  raw_event            JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_paymongo_payments_session ON paymongo_payments(paymongo_session_id) WHERE paymongo_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_paymongo_payments_payment ON paymongo_payments(paymongo_payment_id) WHERE paymongo_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_paymongo_payments_user_created   ON paymongo_payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paymongo_payments_status_created ON paymongo_payments(status, created_at DESC);

-- ── 33. REFUND REQUESTS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refund_requests (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  TEXT        NOT NULL,
  subscription_type        TEXT        NOT NULL CHECK (subscription_type IN ('creator','ai')),
  plan_code                TEXT        NOT NULL,
  payment_reference        TEXT,
  payment_amount_php       NUMERIC     NOT NULL DEFAULT 0,
  estimated_used_php       NUMERIC     NOT NULL DEFAULT 0,
  estimated_refundable_php NUMERIC     NOT NULL DEFAULT 0,
  requested_amount_php     NUMERIC,
  credits_total            INTEGER     NOT NULL DEFAULT 0,
  credits_used             INTEGER     NOT NULL DEFAULT 0,
  credits_remaining        INTEGER     NOT NULL DEFAULT 0,
  ai_requests_used         INTEGER     NOT NULL DEFAULT 0,
  ai_requests_limit        INTEGER     NOT NULL DEFAULT 0,
  reason                   TEXT        NOT NULL
                           CHECK (reason IN ('unused','partial','technical','billing_error','other')),
  description              TEXT        NOT NULL,
  screenshot_url           TEXT,
  status                   TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','reviewing','approved','partial','rejected')),
  approved_amount_php      NUMERIC,
  admin_notes              TEXT,
  reviewed_by              TEXT,
  reviewed_at              TIMESTAMPTZ,
  abuse_score              INTEGER     NOT NULL DEFAULT 0,
  is_flagged               BOOLEAN     NOT NULL DEFAULT FALSE,
  flag_reason              TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_user   ON refund_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status, created_at DESC);

-- ── 34. PAYMENT ORDERS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_orders (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT          NOT NULL,
  plan_code        TEXT          NOT NULL,
  amount_php       NUMERIC(10,2) NOT NULL,
  credits          INTEGER       NOT NULL DEFAULT 0,
  status           TEXT          NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending','paid','failed','cancelled','expired','refunded')),
  payment_method   TEXT,
  payment_ref      TEXT,
  paymongo_link_id TEXT,
  metadata         JSONB,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_user   ON payment_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status, created_at DESC);

-- ── 35. PAYMENT RECEIPTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_receipts (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT          NOT NULL,
  order_id         UUID          REFERENCES payment_orders(id) ON DELETE SET NULL,
  amount_php       NUMERIC(10,2) NOT NULL,
  plan_code        TEXT,
  payment_method   TEXT,
  payment_ref      TEXT,
  status           TEXT          NOT NULL DEFAULT 'pending',
  raw_data         JSONB,
  fraud_score      INTEGER       NOT NULL DEFAULT 0,
  is_flagged       BOOLEAN       NOT NULL DEFAULT false,
  flag_reason      TEXT,
  block_code       TEXT,
  reviewed_by      TEXT,
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_user   ON payment_receipts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_status ON payment_receipts(status, created_at DESC);

-- ── 36. USAGE RECEIPTS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_receipts (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT          NOT NULL,
  payment_order_id  UUID          REFERENCES payment_orders(id) ON DELETE SET NULL,
  tool_used         TEXT          NOT NULL,
  model_used        TEXT,
  generation_type   TEXT,
  request_id        TEXT,
  estimated_cost    NUMERIC(10,4) NOT NULL DEFAULT 0,
  duration_ms       INTEGER,
  queue_time_ms     INTEGER,
  token_usage       JSONB,
  status            TEXT          NOT NULL DEFAULT 'success'
    CHECK (status IN ('success','failed','refunded','moderated')),
  metadata          JSONB,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS usage_receipts_user_idx     ON usage_receipts(user_id);
CREATE INDEX IF NOT EXISTS usage_receipts_created_idx  ON usage_receipts(created_at DESC);
CREATE INDEX IF NOT EXISTS usage_receipts_status_idx   ON usage_receipts(status);

-- ── 37. CREDIT LEDGER ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_ledger (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT          NOT NULL,
  amount        NUMERIC(10,2) NOT NULL,
  action        TEXT          NOT NULL,
  reason        TEXT,
  ref           TEXT,
  balance_after NUMERIC(10,2),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user ON credit_ledger(user_id, created_at DESC);

-- ── 38. GENERATION USAGE ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS generation_usage (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT        NOT NULL,
  tool        TEXT        NOT NULL,
  model       TEXT,
  status      TEXT        NOT NULL DEFAULT 'success',
  cost_php    NUMERIC(10,4),
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generation_usage_user ON generation_usage(user_id, created_at DESC);

-- ── 39. FRAUD FLAGS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fraud_flags (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT        NOT NULL,
  flag_type   TEXT        NOT NULL,
  details     JSONB,
  resolved    BOOLEAN     NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_flags_user ON fraud_flags(user_id, created_at DESC);

-- ── 40. ADMIN AUDIT LOG ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    TEXT,
  username    TEXT,
  action      TEXT        NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  details     JSONB,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin   ON admin_audit_log(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at DESC);

-- ── 41. SUPER ADMINS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS super_admins (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL UNIQUE,
  granted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 42. ADMIN SETTINGS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_settings (
  key        TEXT        PRIMARY KEY,
  value      JSONB       NOT NULL DEFAULT '{}',
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 43. ADMIN SUSPICIOUS USERS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_suspicious_users (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL UNIQUE,
  reason     TEXT,
  flagged_by TEXT,
  resolved   BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 44. ADMIN ESCALATIONS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_escalations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT        NOT NULL,
  target_id   TEXT,
  reason      TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'open',
  assigned_to TEXT,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_escalations_status ON admin_escalations(status, created_at DESC);

-- ── 45. ADMIN METRICS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_metrics (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  metric     TEXT        NOT NULL,
  value      NUMERIC,
  metadata   JSONB,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_metrics_metric ON admin_metrics(metric, recorded_at DESC);

-- ── 46. ANOMALY EVENTS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anomaly_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT        NOT NULL,
  severity    TEXT        NOT NULL DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
  user_id     TEXT,
  details     JSONB,
  resolved    BOOLEAN     NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anomaly_events_type     ON anomaly_events(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_events_severity ON anomaly_events(severity, created_at DESC);

-- ── 47. PAYMENT METHODS CONFIG ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_methods_config (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  method     TEXT        NOT NULL UNIQUE,
  enabled    BOOLEAN     NOT NULL DEFAULT true,
  config     JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 48. PAYMENT SETTINGS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_settings (
  key        TEXT        PRIMARY KEY,
  value      JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 49. PLANS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  code           TEXT        PRIMARY KEY,
  name           TEXT        NOT NULL,
  price_php      NUMERIC(10,2) NOT NULL DEFAULT 0,
  credits        INTEGER     NOT NULL DEFAULT 0,
  duration_days  INTEGER     NOT NULL DEFAULT 30,
  features       JSONB       NOT NULL DEFAULT '{}',
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 50. STUDIO PROJECTS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS studio_projects (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL,
  title      TEXT        NOT NULL DEFAULT 'Untitled Project',
  frames     JSONB       NOT NULL DEFAULT '[]',
  config     JSONB       NOT NULL DEFAULT '{}',
  version    INTEGER     DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_projects_user ON studio_projects(user_id, created_at DESC);

-- ── 51. RENDER JOBS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS render_jobs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT        NOT NULL,
  project_id       UUID        REFERENCES studio_projects(id) ON DELETE SET NULL,
  status           TEXT        NOT NULL DEFAULT 'queued',
  stage            TEXT        NOT NULL DEFAULT 'queued',
  progress         NUMERIC(5,2) DEFAULT 0,
  priority         INTEGER     NOT NULL DEFAULT 2,
  retry_count      INTEGER     DEFAULT 0,
  max_retries      INTEGER     DEFAULT 3,
  failure_reason   TEXT,
  last_error       TEXT,
  worker_id        TEXT,
  worker_heartbeat TIMESTAMPTZ,
  render_engine    TEXT        NOT NULL DEFAULT 'luma',
  plan_code        TEXT,
  output_url       TEXT,
  thumbnail_url    TEXT,
  preview_strip_url TEXT,
  duration_sec     NUMERIC(8,2),
  file_size_bytes  BIGINT,
  completed_stages TEXT[]      DEFAULT '{}',
  input_payload    JSONB       NOT NULL DEFAULT '{}',
  segment_meta     JSONB       DEFAULT '[]',
  encoding_state   JSONB       DEFAULT '{}',
  queued_at        TIMESTAMPTZ DEFAULT NOW(),
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS render_jobs_queue_idx  ON render_jobs(priority, queued_at);
CREATE INDEX IF NOT EXISTS render_jobs_user_idx   ON render_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS render_jobs_worker_idx ON render_jobs(worker_id, worker_heartbeat);

-- ── 52. SOCIA GPT MEMORY ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS socia_gpt_memory (
  user_id          TEXT        NOT NULL,
  profile          TEXT        NOT NULL,
  summary          TEXT        NOT NULL,
  turn_count       INTEGER     NOT NULL DEFAULT 0,
  snapshot_at_turn INTEGER     NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  PRIMARY KEY (user_id, profile)
);

CREATE INDEX IF NOT EXISTS socia_gpt_memory_user_profile_idx ON socia_gpt_memory(user_id, profile);

-- ── 53. COMMUNITY FUNDING ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_funding (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  total_raised    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_donors    INTEGER       NOT NULL DEFAULT 0,
  goal_amount     NUMERIC(12,2),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

INSERT INTO community_funding (total_raised, total_donors) VALUES (0, 0) ON CONFLICT DO NOTHING;

-- ── 54. COMMUNITY SUPPORT ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_support (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               TEXT          NOT NULL,
  amount_centavos       INTEGER       NOT NULL CHECK (amount_centavos >= 5000),
  currency              TEXT          NOT NULL DEFAULT 'PHP',
  payment_method        TEXT,
  paymongo_session_id   TEXT,
  paymongo_payment_id   TEXT,
  status                TEXT          NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','paid','failed')),
  raw_session           JSONB,
  raw_event             JSONB,
  processed_event_ids   TEXT[]        NOT NULL DEFAULT '{}',
  paid_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cs_session_unique ON community_support(paymongo_session_id) WHERE paymongo_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cs_payment_unique ON community_support(paymongo_payment_id) WHERE paymongo_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cs_user_created ON community_support(user_id, created_at DESC);

-- ── 55. FUNDING DONATIONS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS funding_donations (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT          NOT NULL,
  amount_php      NUMERIC(10,2) NOT NULL,
  message         TEXT,
  is_anonymous    BOOLEAN       NOT NULL DEFAULT false,
  status          TEXT          NOT NULL DEFAULT 'pending',
  payment_ref     TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_funding_donations_user ON funding_donations(user_id, created_at DESC);

-- ── 56. CREATOR STAR WALLETS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_star_wallets (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT        NOT NULL UNIQUE,
  balance           INTEGER     NOT NULL DEFAULT 0,
  lifetime_received INTEGER     NOT NULL DEFAULT 0,
  lifetime_sent     INTEGER     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT star_wallet_balance_nonneg      CHECK (balance           >= 0),
  CONSTRAINT star_wallet_received_nonneg     CHECK (lifetime_received >= 0),
  CONSTRAINT star_wallet_sent_nonneg         CHECK (lifetime_sent     >= 0)
);

CREATE INDEX IF NOT EXISTS idx_star_wallets_user     ON creator_star_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_star_wallets_received ON creator_star_wallets(lifetime_received DESC);

-- ── 57. CREATOR STAR TRANSACTIONS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_star_transactions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    TEXT,
  receiver_id  TEXT        NOT NULL,
  amount       INTEGER     NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'processing',
  reference_id TEXT        UNIQUE,
  metadata     JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT star_tx_amount_pos   CHECK (amount > 0),
  CONSTRAINT star_tx_status_valid CHECK (status IN ('processing','completed','failed','refunded'))
);

CREATE INDEX IF NOT EXISTS idx_star_tx_sender   ON creator_star_transactions(sender_id,   created_at DESC);
CREATE INDEX IF NOT EXISTS idx_star_tx_receiver ON creator_star_transactions(receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_star_tx_status   ON creator_star_transactions(status);

-- ── 58. CREATOR STAR LEDGER ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_star_ledger (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID        REFERENCES creator_star_transactions(id) ON DELETE SET NULL,
  user_id        TEXT        NOT NULL,
  debit          INTEGER     NOT NULL DEFAULT 0,
  credit         INTEGER     NOT NULL DEFAULT 0,
  balance_after  INTEGER     NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT star_ledger_debit_nonneg    CHECK (debit        >= 0),
  CONSTRAINT star_ledger_credit_nonneg   CHECK (credit       >= 0),
  CONSTRAINT star_ledger_balance_nonneg  CHECK (balance_after >= 0)
);

-- ── 59. GROUP CHAT ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_groups (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  avatar_url  TEXT,
  owner_id    TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_group_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID        NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  user_id    TEXT        NOT NULL,
  role       TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_group_messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID        NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  sender_id    TEXT        NOT NULL,
  content      TEXT,
  attachments  JSONB       NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_group_reads (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id             UUID        NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  user_id              TEXT        NOT NULL,
  last_read_message_id UUID        REFERENCES chat_group_messages(id) ON DELETE SET NULL,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cgm_group  ON chat_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_cgm_user   ON chat_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_cgmsg_grp  ON chat_group_messages(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cgr_gu     ON chat_group_reads(group_id, user_id);

-- ── 60. LIVE STREAMING ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stream_sessions (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id      TEXT        NOT NULL,
  title           TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description     TEXT        CHECK (char_length(description) <= 500),
  category        TEXT        NOT NULL DEFAULT 'general',
  thumbnail_url   TEXT,
  stream_key      TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  status          TEXT        NOT NULL DEFAULT 'live' CHECK (status IN ('live','ended')),
  viewer_count    INTEGER     NOT NULL DEFAULT 0,
  peak_viewers    INTEGER     NOT NULL DEFAULT 0,
  total_viewers   INTEGER     NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stream_comments (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  stream_id  UUID        NOT NULL REFERENCES stream_sessions(id) ON DELETE CASCADE,
  user_id    TEXT        NOT NULL,
  content    TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 300),
  is_muted   BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stream_reactions (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  stream_id  UUID        NOT NULL REFERENCES stream_sessions(id) ON DELETE CASCADE,
  user_id    TEXT        NOT NULL,
  type       TEXT        NOT NULL CHECK (type IN ('heart','like','fire','clap')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stream_viewers (
  id        UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  stream_id UUID        NOT NULL REFERENCES stream_sessions(id) ON DELETE CASCADE,
  user_id   TEXT        NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at   TIMESTAMPTZ,
  UNIQUE (stream_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_stream_sessions_status_started ON stream_sessions(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_stream_sessions_creator        ON stream_sessions(creator_id);

-- ── 61. MESSAGE USAGE ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_usage (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT        NOT NULL,
  period_key  TEXT        NOT NULL,
  count       INTEGER     NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, period_key)
);

-- ── 62. USER NOTIFICATION PREFERENCES ────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_notification_prefs (
  user_id       TEXT        PRIMARY KEY,
  push_enabled  BOOLEAN     NOT NULL DEFAULT true,
  email_enabled BOOLEAN     NOT NULL DEFAULT false,
  prefs         JSONB       NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 63. VOICE TRACKS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_tracks (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL,
  title      TEXT,
  url        TEXT        NOT NULL,
  duration   INTEGER,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_tracks_user ON voice_tracks(user_id, created_at DESC);

-- ── 64. CONVERSATIONS (simple AI chat - lib/db schema) ────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id         SERIAL      PRIMARY KEY,
  title      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 65. CONVERSATION MESSAGES (simple AI chat - lib/db schema) ───────────
-- NOTE: This is DIFFERENT from the social 'messages' table above.
-- This is used by the basic AI chat lib/db schema. We skip it since
-- 'messages' above is the primary messages table.

-- ── UPDATE TRIGGERS ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply updated_at triggers
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'users', 'subscriptions', 'ai_subscriptions', 'ai_usage_tracking',
    'ai_billing_history', 'paymongo_payments', 'refund_requests',
    'payment_orders', 'payment_receipts', 'usage_receipts',
    'community_support', 'chat_groups', 'alert_settings',
    'plans', 'studio_projects', 'render_jobs', 'creator_star_wallets',
    'admin_settings', 'payment_methods_config', 'payment_settings'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I;
       CREATE TRIGGER trg_%s_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
      tbl, tbl, tbl, tbl
    );
  END LOOP;
END $$;

-- ── CACHED COUNT TRIGGERS ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_post_like_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET cached_like_count = cached_like_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET cached_like_count = GREATEST(0, cached_like_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_like_count ON likes;
CREATE TRIGGER trg_sync_like_count
  AFTER INSERT OR DELETE ON likes
  FOR EACH ROW EXECUTE FUNCTION sync_post_like_count();

CREATE OR REPLACE FUNCTION sync_post_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET cached_comment_count = cached_comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET cached_comment_count = GREATEST(0, cached_comment_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_comment_count ON comments;
CREATE TRIGGER trg_sync_comment_count
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION sync_post_comment_count();

CREATE OR REPLACE FUNCTION sync_post_save_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET cached_save_count = cached_save_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET cached_save_count = GREATEST(0, cached_save_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_save_count ON saves;
CREATE TRIGGER trg_sync_save_count
  AFTER INSERT OR DELETE ON saves
  FOR EACH ROW EXECUTE FUNCTION sync_post_save_count();

CREATE OR REPLACE FUNCTION fn_increment_share_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE posts SET share_count = share_count + 1 WHERE id = NEW.post_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_share_count ON shares;
CREATE TRIGGER trg_increment_share_count
  AFTER INSERT ON shares
  FOR EACH ROW EXECUTE FUNCTION fn_increment_share_count();
