-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "church_status" AS ENUM ('onboarding', 'pilot', 'active', 'cancelling', 'closed');

-- CreateEnum
CREATE TYPE "plan_tier" AS ENUM ('tier_under_100', 'tier_100_249', 'tier_250_499', 'tier_500_999', 'tier_1000_plus');

-- CreateEnum
CREATE TYPE "bible_translation" AS ENUM ('web', 'nlt', 'niv', 'other_requested');

-- CreateEnum
CREATE TYPE "staff_role" AS ENUM ('senior_pastor', 'care_pastor', 'care_staff', 'insights_only', 'founder_support');

-- CreateEnum
CREATE TYPE "audit_actor_type" AS ENUM ('staff', 'founder_support', 'system');

-- CreateEnum
CREATE TYPE "member_status" AS ENUM ('enrolling', 'active', 'quiet', 'monthly', 'paused', 'private', 'opted_out');

-- CreateEnum
CREATE TYPE "standing_permission" AS ENUM ('yes', 'ask', 'no');

-- CreateEnum
CREATE TYPE "message_direction" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "message_type" AS ENUM ('check_in', 'devotional', 'follow_up', 'recap', 'reply', 'command', 'safety', 'system');

-- CreateEnum
CREATE TYPE "delivery_status" AS ENUM ('received', 'queued', 'sent', 'delivered', 'failed');

-- CreateEnum
CREATE TYPE "prayer_status" AS ENUM ('open', 'answered', 'closed');

-- CreateEnum
CREATE TYPE "care_request_status" AS ENUM ('open', 'snoozed', 'closed');

-- CreateEnum
CREATE TYPE "care_consent_basis" AS ENUM ('care_request', 'standing_permission', 'standing_permission_asked');

-- CreateEnum
CREATE TYPE "nudge_status" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "safety_category" AS ENUM ('self_harm', 'abuse', 'domestic_violence', 'threat', 'severe_distress', 'possible_minor');

-- CreateEnum
CREATE TYPE "detection_source" AS ENUM ('phrase_list', 'classifier', 'both', 'staff_report');

-- CreateEnum
CREATE TYPE "safety_flag_review" AS ENUM ('pending', 'confirmed', 'false_positive');

-- CreateEnum
CREATE TYPE "escalation_status" AS ENUM ('open', 'acknowledged', 'resolved');

-- CreateEnum
CREATE TYPE "escalation_step_type" AS ENUM ('member_response', 'call', 'text', 'timeout', 'acknowledged', 'final_member_message', 'critical_incident', 'senior_pastor_email');

-- CreateEnum
CREATE TYPE "content_verdict" AS ENUM ('approved', 'flagged', 'edited');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('trialing', 'active', 'past_due', 'cancelled');

-- CreateTable
CREATE TABLE "churches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "keyword" TEXT,
    "phone_number" TEXT,
    "zip" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "tradition" TEXT,
    "translation" "bible_translation" NOT NULL DEFAULT 'web',
    "tone" TEXT,
    "statement_of_faith" TEXT,
    "sermon_series" TEXT,
    "senior_pastor_name" TEXT,
    "plan_tier" "plan_tier",
    "status" "church_status" NOT NULL DEFAULT 'onboarding',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "churches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "staff_role" NOT NULL,
    "is_account_admin" BOOLEAN NOT NULL DEFAULT false,
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "two_factor_secret_ciphertext" TEXT,
    "two_factor_last_step" INTEGER,
    "last_login_at" TIMESTAMPTZ(6),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_login_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "staff_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_login_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "staff_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "two_factor_verified_at" TIMESTAMPTZ(6),
    "failed_two_factor_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_access_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "granted_by_staff_id" UUID NOT NULL,
    "support_staff_user_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "support_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "actor_type" "audit_actor_type" NOT NULL,
    "actor_staff_id" UUID,
    "action" TEXT NOT NULL,
    "target_table" TEXT,
    "target_id" UUID,
    "detail" TEXT,
    "ip_address" INET,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "phone_ciphertext" TEXT NOT NULL,
    "phone_hash" TEXT NOT NULL,
    "preferred_name" TEXT,
    "checkin_window" TEXT,
    "status" "member_status" NOT NULL DEFAULT 'enrolling',
    "enrollment_state" TEXT,
    "enrollment_source" TEXT,
    "small_group" TEXT,
    "age_confirmed_at" TIMESTAMPTZ(6),
    "safety_hold" BOOLEAN NOT NULL DEFAULT false,
    "dv_suppressed" BOOLEAN NOT NULL DEFAULT false,
    "enrolled_at" TIMESTAMPTZ(6),
    "last_inbound_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "care_requests" BOOLEAN NOT NULL DEFAULT true,
    "standing_permission" "standing_permission" NOT NULL DEFAULT 'no',
    "quiet_after_hardship" BOOLEAN NOT NULL DEFAULT false,
    "event_invitations" BOOLEAN NOT NULL DEFAULT false,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "next_reconfirmation_at" TIMESTAMPTZ(6),

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT NOT NULL,
    "message_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "direction" "message_direction" NOT NULL,
    "type" "message_type" NOT NULL,
    "body_ciphertext" TEXT,
    "twilio_sid" TEXT,
    "delivery_status" "delivery_status" NOT NULL DEFAULT 'queued',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "life_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "summary_ciphertext" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "event_date" TIMESTAMPTZ(6),
    "heavy" BOOLEAN NOT NULL DEFAULT false,
    "source_message_id" UUID,
    "follow_up_status" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "life_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prayer_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "summary_ciphertext" TEXT NOT NULL,
    "status" "prayer_status" NOT NULL DEFAULT 'open',
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMPTZ(6),

    CONSTRAINT "prayer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "shared_text_ciphertext" TEXT,
    "consent_basis" "care_consent_basis" NOT NULL,
    "status" "care_request_status" NOT NULL DEFAULT 'open',
    "assigned_staff_id" UUID,
    "snoozed_until" TIMESTAMPTZ(6),
    "outcome_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "care_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkin_nudges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "reason_code" TEXT NOT NULL,
    "status" "nudge_status" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkin_nudges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_flags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "category" "safety_category" NOT NULL,
    "detection_source" "detection_source" NOT NULL,
    "triggering_message_id" UUID,
    "review" "safety_flag_review" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safety_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "safety_flag_id" UUID NOT NULL,
    "status" "escalation_status" NOT NULL DEFAULT 'open',
    "outcome" TEXT,
    "resolved_by_staff_id" UUID,
    "messages_paused" BOOLEAN NOT NULL DEFAULT true,
    "critical_incident" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "escalations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalation_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "escalation_id" UUID NOT NULL,
    "step_type" "escalation_step_type" NOT NULL,
    "target_staff_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escalation_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reporting_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "state" TEXT,
    "designated_reporter" TEXT,
    "counsel_contact" TEXT,
    "preservation_rules" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reporting_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "readiness" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "care_contact_trained_at" TIMESTAMPTZ(6),
    "backup_trained_at" TIMESTAMPTZ(6),
    "protocol_version_signed" TEXT,
    "last_drill_passed_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "readiness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "message_id" UUID,
    "reviewer_staff_id" UUID,
    "verdict" "content_verdict" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "theme_counts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "theme" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "theme_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollment_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "church_id" UUID NOT NULL,
    "tier" "plan_tier" NOT NULL,
    "status" "subscription_status" NOT NULL,
    "current_period_start" TIMESTAMPTZ(6),
    "current_period_end" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "churches_keyword_key" ON "churches"("keyword");

-- CreateIndex
CREATE UNIQUE INDEX "churches_phone_number_key" ON "churches"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "staff_users_church_id_email_key" ON "staff_users"("church_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "staff_login_tokens_token_hash_key" ON "staff_login_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "staff_login_tokens_staff_user_id_created_at_idx" ON "staff_login_tokens"("staff_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "staff_sessions_token_hash_key" ON "staff_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "audit_log_church_id_created_at_idx" ON "audit_log"("church_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "members_church_id_phone_hash_key" ON "members"("church_id", "phone_hash");

-- CreateIndex
CREATE UNIQUE INDEX "consents_member_id_key" ON "consents"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_twilio_sid_key" ON "messages"("twilio_sid");

-- CreateIndex
CREATE INDEX "messages_member_id_created_at_idx" ON "messages"("member_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reporting_settings_church_id_key" ON "reporting_settings"("church_id");

-- CreateIndex
CREATE UNIQUE INDEX "readiness_church_id_key" ON "readiness"("church_id");

-- CreateIndex
CREATE UNIQUE INDEX "theme_counts_church_id_month_theme_key" ON "theme_counts"("church_id", "month", "theme");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_sources_church_id_label_key" ON "enrollment_sources"("church_id", "label");

-- AddForeignKey
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_login_tokens" ADD CONSTRAINT "staff_login_tokens_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_login_tokens" ADD CONSTRAINT "staff_login_tokens_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_granted_by_staff_id_fkey" FOREIGN KEY ("granted_by_staff_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_support_staff_user_id_fkey" FOREIGN KEY ("support_staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_staff_id_fkey" FOREIGN KEY ("actor_staff_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "life_events" ADD CONSTRAINT "life_events_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "life_events" ADD CONSTRAINT "life_events_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "life_events" ADD CONSTRAINT "life_events_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prayer_items" ADD CONSTRAINT "prayer_items_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prayer_items" ADD CONSTRAINT "prayer_items_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_requests" ADD CONSTRAINT "care_requests_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_requests" ADD CONSTRAINT "care_requests_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_requests" ADD CONSTRAINT "care_requests_assigned_staff_id_fkey" FOREIGN KEY ("assigned_staff_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_nudges" ADD CONSTRAINT "checkin_nudges_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_nudges" ADD CONSTRAINT "checkin_nudges_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_flags" ADD CONSTRAINT "safety_flags_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_flags" ADD CONSTRAINT "safety_flags_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_flags" ADD CONSTRAINT "safety_flags_triggering_message_id_fkey" FOREIGN KEY ("triggering_message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_safety_flag_id_fkey" FOREIGN KEY ("safety_flag_id") REFERENCES "safety_flags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_resolved_by_staff_id_fkey" FOREIGN KEY ("resolved_by_staff_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalation_steps" ADD CONSTRAINT "escalation_steps_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalation_steps" ADD CONSTRAINT "escalation_steps_escalation_id_fkey" FOREIGN KEY ("escalation_id") REFERENCES "escalations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalation_steps" ADD CONSTRAINT "escalation_steps_target_staff_id_fkey" FOREIGN KEY ("target_staff_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_settings" ADD CONSTRAINT "reporting_settings_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "readiness" ADD CONSTRAINT "readiness_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reviews" ADD CONSTRAINT "content_reviews_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reviews" ADD CONSTRAINT "content_reviews_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reviews" ADD CONSTRAINT "content_reviews_reviewer_staff_id_fkey" FOREIGN KEY ("reviewer_staff_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theme_counts" ADD CONSTRAINT "theme_counts_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_sources" ADD CONSTRAINT "enrollment_sources_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

