-- Upheld Milestone 1: church isolation, append only tables, and integrity.
--
-- Applies after 20260922000000_init (the tables, generated from
-- prisma/schema.prisma). Everything here is enforced by Postgres itself, so
-- an application bug cannot cross churches.
--
-- Model:
--   * The migration owner owns every table and is used only for migrations
--     and owner scripts.
--   * The app connects as upheld_app: not superuser, not BYPASSRLS, owns
--     nothing. Row level security therefore always applies to it.
--   * Each app transaction sets app.church_id with set_config(..., true).
--     With no church set, every policy matches zero rows (fail closed).

-- ------------------------------------------------------------------ role

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'upheld_app') THEN
    -- Created without login here so no password lives in code.
    -- scripts/db-app-role.mjs enables login with APP_DB_PASSWORD.
    CREATE ROLE upheld_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO upheld_app;

-- ------------------------------------------------------------------ church context

CREATE FUNCTION app_current_church_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.church_id', true), '')::uuid
$$;

-- ------------------------------------------------------------------ generic triggers

-- church_id never changes after a row is written.
CREATE FUNCTION prevent_church_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.church_id IS DISTINCT FROM OLD.church_id THEN
    RAISE EXCEPTION 'church_id is immutable on %', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END
$$;

-- Append only tables reject UPDATE, DELETE, and TRUNCATE for every role,
-- including the owner.
CREATE FUNCTION prevent_modification() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append only', TG_TABLE_NAME;
END
$$;

-- A reference to another table must point at a row in the same church.
-- TG_ARGV[0] is the referenced table, TG_ARGV[1] the referencing column.
-- Runs as the calling role, so for upheld_app the lookup is itself limited
-- by row level security.
CREATE FUNCTION enforce_same_church() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ref_table text := TG_ARGV[0];
  ref_col   text := TG_ARGV[1];
  ref_id    uuid;
  ok        boolean;
BEGIN
  EXECUTE format('SELECT ($1).%I', ref_col) INTO ref_id USING NEW;
  IF ref_id IS NULL THEN
    RETURN NEW;
  END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND church_id = $2)', ref_table)
    INTO ok USING ref_id, NEW.church_id;
  IF NOT ok THEN
    RAISE EXCEPTION 'cross church reference rejected on %.%', TG_TABLE_NAME, ref_col;
  END IF;
  RETURN NEW;
END
$$;

-- ------------------------------------------------------------------ churches

ALTER TABLE churches ENABLE ROW LEVEL SECURITY;
CREATE POLICY church_isolation ON churches
  USING (id = app_current_church_id())
  WITH CHECK (id = app_current_church_id());
-- The app may read and update its own church. Creating churches happens in
-- onboarding (M8) through a dedicated function, not a table grant.
GRANT SELECT, UPDATE ON churches TO upheld_app;

-- ------------------------------------------------------------------ church scoped tables

DO $$
DECLARE
  t text;
  scoped text[] := ARRAY[
    'staff_users', 'staff_login_tokens', 'staff_sessions', 'support_access_grants',
    'audit_log', 'members', 'consents', 'consent_events', 'messages',
    'life_events', 'prayer_items', 'care_requests', 'checkin_nudges',
    'safety_flags', 'escalations', 'escalation_steps', 'reporting_settings',
    'readiness', 'content_reviews', 'theme_counts', 'enrollment_sources',
    'subscriptions'
  ];
  append_only text[] := ARRAY['audit_log', 'consent_events', 'escalation_steps'];
BEGIN
  FOREACH t IN ARRAY scoped LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY church_isolation ON %I USING (church_id = app_current_church_id()) WITH CHECK (church_id = app_current_church_id())',
      t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_church_change()',
      t || '_church_immutable', t);

    IF t = ANY (append_only) THEN
      EXECUTE format('GRANT SELECT, INSERT ON %I TO upheld_app', t);
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_modification()',
        t || '_append_only', t);
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION prevent_modification()',
        t || '_no_truncate', t);
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO upheld_app', t);
    END IF;
  END LOOP;
END
$$;

-- ------------------------------------------------------------------ same church references

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('staff_login_tokens',    'staff_user_id',         'staff_users'),
      ('staff_sessions',        'staff_user_id',         'staff_users'),
      ('support_access_grants', 'granted_by_staff_id',   'staff_users'),
      ('support_access_grants', 'support_staff_user_id', 'staff_users'),
      ('audit_log',             'actor_staff_id',        'staff_users'),
      ('consents',              'member_id',             'members'),
      ('consent_events',        'member_id',             'members'),
      ('consent_events',        'message_id',            'messages'),
      ('messages',              'member_id',             'members'),
      ('life_events',           'member_id',             'members'),
      ('life_events',           'source_message_id',     'messages'),
      ('prayer_items',          'member_id',             'members'),
      ('care_requests',         'member_id',             'members'),
      ('care_requests',         'assigned_staff_id',     'staff_users'),
      ('checkin_nudges',        'member_id',             'members'),
      ('safety_flags',          'member_id',             'members'),
      ('safety_flags',          'triggering_message_id', 'messages'),
      ('escalations',           'safety_flag_id',        'safety_flags'),
      ('escalations',           'resolved_by_staff_id',  'staff_users'),
      ('escalation_steps',      'escalation_id',         'escalations'),
      ('escalation_steps',      'target_staff_id',       'staff_users'),
      ('content_reviews',       'message_id',            'messages'),
      ('content_reviews',       'reviewer_staff_id',     'staff_users')
    ) AS v(tbl, col, ref)
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION enforce_same_church(%L, %L)',
      r.tbl || '_' || r.col || '_same_church', r.tbl, r.ref, r.col);
  END LOOP;
END
$$;

-- ------------------------------------------------------------------ data rules

-- Care requests are always on (decision log).
ALTER TABLE consents ADD CONSTRAINT consents_care_requests_always_on CHECK (care_requests = true);

-- Rows below the anonymity threshold of five are never written (spec 5).
ALTER TABLE theme_counts ADD CONSTRAINT theme_counts_anonymity_threshold CHECK (count >= 5);

-- Founder support can never administer a church account.
ALTER TABLE staff_users ADD CONSTRAINT staff_users_founder_not_admin
  CHECK (NOT (role = 'founder_support' AND is_account_admin));

-- Staff email is stored lower case and trimmed.
ALTER TABLE staff_users ADD CONSTRAINT staff_users_email_normalized
  CHECK (email = lower(btrim(email)) AND position('@' in email) > 1);

-- Audit detail is a short code, never free text or message content.
ALTER TABLE audit_log ADD CONSTRAINT audit_log_detail_is_code
  CHECK (detail IS NULL OR detail ~ '^[a-z0-9_.:-]{1,64}$');
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_is_code
  CHECK (action ~ '^[a-z0-9_.]{3,64}$');

-- Founder support grants expire after at most 72 hours (spec 9).
ALTER TABLE support_access_grants ADD CONSTRAINT support_grants_max_72_hours
  CHECK (expires_at > granted_at AND expires_at <= granted_at + interval '72 hours');

-- ------------------------------------------------------------------ sign in lookups
--
-- Sign in must find a staff member before the church is known. These three
-- functions are the only paths that read across churches. Each returns the
-- minimum needed to open a church scoped transaction, and nothing else.
-- They run as the owner (SECURITY DEFINER) with a fixed search_path.

CREATE FUNCTION auth_find_active_staff_by_email(p_email text)
RETURNS TABLE (staff_id uuid, church_id uuid, church_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.church_id, c.name
  FROM staff_users s
  JOIN churches c ON c.id = s.church_id
  WHERE s.email = lower(btrim(p_email))
    AND s.active
    AND c.status <> 'closed'
$$;

CREATE FUNCTION auth_login_token_church(p_token_hash text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT church_id FROM staff_login_tokens
  WHERE token_hash = p_token_hash AND used_at IS NULL AND expires_at > now()
$$;

CREATE FUNCTION auth_session_church(p_token_hash text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT church_id FROM staff_sessions
  WHERE token_hash = p_token_hash AND ended_at IS NULL
$$;

REVOKE ALL ON FUNCTION auth_find_active_staff_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_login_token_church(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_session_church(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_find_active_staff_by_email(text) TO upheld_app;
GRANT EXECUTE ON FUNCTION auth_login_token_church(text) TO upheld_app;
GRANT EXECUTE ON FUNCTION auth_session_church(text) TO upheld_app;
