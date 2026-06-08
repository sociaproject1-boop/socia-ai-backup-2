CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_enforcement_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_type" text NOT NULL,
	"feature" text,
	"from_provider" text,
	"to_provider" text,
	"model" text,
	"reason" text NOT NULL,
	"scope" text,
	"actor" text,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "ai_governance_config" (
	"id" text PRIMARY KEY NOT NULL,
	"config" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" text,
	"username" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"meta" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"action" text NOT NULL,
	"reason" text,
	"ref" text,
	"balance_after" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "render_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"project_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"stage" text DEFAULT 'queued' NOT NULL,
	"progress" numeric(5, 2) DEFAULT '0',
	"priority" integer DEFAULT 2 NOT NULL,
	"retry_count" integer DEFAULT 0,
	"max_retries" integer DEFAULT 3,
	"failure_reason" text,
	"last_error" text,
	"worker_id" text,
	"worker_heartbeat" timestamp with time zone,
	"render_engine" text DEFAULT 'luma' NOT NULL,
	"plan_code" text,
	"output_url" text,
	"thumbnail_url" text,
	"preview_strip_url" text,
	"duration_sec" numeric(8, 2),
	"file_size_bytes" bigint,
	"completed_stages" text[] DEFAULT '{}',
	"input_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"segment_meta" jsonb DEFAULT '[]'::jsonb,
	"encoding_state" jsonb DEFAULT '{}'::jsonb,
	"queued_at" timestamp with time zone DEFAULT now(),
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "socia_gpt_memory" (
	"user_id" text NOT NULL,
	"profile" text NOT NULL,
	"summary" text NOT NULL,
	"turn_count" integer DEFAULT 0 NOT NULL,
	"snapshot_at_turn" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'Untitled Project' NOT NULL,
	"frames" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "super_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "super_admins_username_unique" UNIQUE("username"),
	CONSTRAINT "super_admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "usage_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"payment_order_id" text,
	"tool_used" text NOT NULL,
	"model_used" text,
	"generation_type" text,
	"request_id" text,
	"estimated_cost" numeric(10, 4) DEFAULT '0' NOT NULL,
	"duration_ms" integer,
	"queue_time_ms" integer,
	"token_usage" jsonb,
	"status" text DEFAULT 'success' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT 'Socia User' NOT NULL,
	"username" text DEFAULT '' NOT NULL,
	"avatar_url" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"cover_photo_url" text,
	"followers" integer DEFAULT 0 NOT NULL,
	"following" integer DEFAULT 0 NOT NULL,
	"is_owner" boolean DEFAULT false NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	"is_banned" boolean DEFAULT false NOT NULL,
	"is_suspended" boolean DEFAULT false NOT NULL,
	"force_logout_at" timestamp with time zone,
	"subscription_status" text DEFAULT 'free' NOT NULL,
	"plan_code" text DEFAULT 'free' NOT NULL,
	"credits_balance" numeric(10, 2) DEFAULT '0' NOT NULL,
	"smart_saver" boolean DEFAULT false NOT NULL,
	"cooldown_until" timestamp with time zone,
	"daily_image_count" integer DEFAULT 0 NOT NULL,
	"daily_video_count" integer DEFAULT 0 NOT NULL,
	"daily_reset_at" timestamp with time zone,
	"website" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"gender" text DEFAULT 'Prefer not to say' NOT NULL,
	"birthday" text,
	"relationship_status" text DEFAULT 'Prefer not to say' NOT NULL,
	"work" text DEFAULT '' NOT NULL,
	"work_previous" text DEFAULT '' NOT NULL,
	"school" text DEFAULT '' NOT NULL,
	"college" text DEFAULT '' NOT NULL,
	"education" text DEFAULT '' NOT NULL,
	"public_email" text DEFAULT '' NOT NULL,
	"public_phone" text DEFAULT '' NOT NULL,
	"social_facebook" text DEFAULT '' NOT NULL,
	"social_instagram" text DEFAULT '' NOT NULL,
	"social_tiktok" text DEFAULT '' NOT NULL,
	"social_x" text DEFAULT '' NOT NULL,
	"social_youtube" text DEFAULT '' NOT NULL,
	"social_linkedin" text DEFAULT '' NOT NULL,
	"privacy_settings" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_project_id_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."studio_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "socia_gpt_memory" ADD CONSTRAINT "socia_gpt_memory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_projects" ADD CONSTRAINT "studio_projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_receipts" ADD CONSTRAINT "usage_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "render_jobs_queue_idx" ON "render_jobs" USING btree ("priority","queued_at");--> statement-breakpoint
CREATE INDEX "render_jobs_user_idx" ON "render_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "render_jobs_worker_idx" ON "render_jobs" USING btree ("worker_id","worker_heartbeat");--> statement-breakpoint
CREATE INDEX "socia_gpt_memory_user_profile_idx" ON "socia_gpt_memory" USING btree ("user_id","profile");--> statement-breakpoint
CREATE INDEX "usage_receipts_user_idx" ON "usage_receipts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_receipts_status_idx" ON "usage_receipts" USING btree ("status");