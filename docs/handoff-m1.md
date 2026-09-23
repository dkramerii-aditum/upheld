# Upheld Handoff Note: Milestone 1, Foundation

Date: September 22, 2026
Status: Verified locally on September 22, 2026 on Dennis's Mac (Node 22.20, Postgres 18.6). npm test: 5 files, 41 tests passed. npm run typecheck: clean. npm run isolation:report: all PASS. Browser check: the same email signed in to Test Church North (senior pastor, two factor enforced) saw 1 church, 2 staff, 2 members; signed in to Test Church South (insights only, no two factor) saw 1 church, 2 staff, 3 members. Render deployment: see item 6.

Done-when test (Technical Specification section 13): two test churches exist and cannot see each other's data.

## 1) What was built

A Next.js 15 and TypeScript application with Prisma 6 on Postgres.

Database. All section 5 tables exist. churches, staff_users, and audit_log are complete; the rest are stubs with church_id, protection, and their main fields, finalized in the milestone that uses them. Added for sign in: staff_login_tokens, staff_sessions, support_access_grants. scheduled_jobs is left to pg-boss in M6.

Church isolation, enforced by Postgres:
* The app connects as upheld_app (not superuser, no BYPASSRLS, owns no tables). Its connection string is built from DATABASE_OWNER_URL plus APP_DB_PASSWORD, so it cannot be pointed at the owner by mistake. lib/db refuses to run if the role check fails, and /api/health reports it.
* withChurch(churchId, fn) in lib/db is the only data path. It sets app.church_id for one transaction. Every table has a church_isolation policy; with no church set the app sees zero rows.
* Triggers reject any reference to a row in another church (for every role, including the owner) and make church_id permanent.
* Three SECURITY DEFINER functions are the only cross church reads, used during sign in, and return ids only.

Append only for every role, including the owner: audit_log, consent_events, escalation_steps.

Database rules: care request consent is always true; theme counts below 5 cannot be written; founder support cannot be an account admin; support grants cannot exceed 72 hours; audit action and detail must be short codes.

Staff sign in: email magic link (15 minutes, single use, 5 per hour, hashed at rest, confirmation button so email scanners cannot consume it). Database sessions, 30 minute idle and 12 hour absolute limits. Authenticator app two factor with encrypted secret, replay protection, and session end after 5 wrong codes.

Roles and permissions per spec section 9, with the decision log's account administrator. Audit log writer in lib/audit with a fixed action list. Field encryption (AES-256-GCM) in lib/crypto. Placeholder Today screen showing role screens and what the church can see.

Tests: 41 tests in 5 files covering isolation (reading, writing, cross references, no context, role checks, every table protected), audit rules, permissions and two factor rules, encryption, and code boundaries.

## 2) File tree (all new in M1)

```
.env.example  .gitignore  README.md  next-env.d.ts  next.config.mjs
package.json  render.yaml  tsconfig.json  vitest.config.ts
app/layout.tsx  app/page.tsx  app/globals.css
app/actions/auth.ts
app/sign-in/page.tsx
app/auth/verify/page.tsx
app/auth/two-factor/page.tsx
app/(dashboard)/layout.tsx
app/(dashboard)/today/page.tsx
app/api/health/route.ts
app/api/twilio/README.md
docs/handoff-m1.md
lib/config.ts
lib/db/index.ts  lib/db/url.ts  lib/db/owner.ts
lib/crypto/index.ts
lib/audit/index.ts
lib/auth/permissions.ts  lib/auth/tokens.ts  lib/auth/lookup.ts
lib/auth/magic-link.ts  lib/auth/session.ts  lib/auth/two-factor.ts  lib/auth/request.ts
lib/email/index.ts
lib/http/ip.ts
lib/messaging/README.md  lib/safety/README.md  lib/consent/README.md  lib/ai/README.md
worker/README.md
prisma/schema.prisma
prisma/migrations/migration_lock.toml
prisma/migrations/20260922000000_init/migration.sql   (generated locally by npm run db:init-migration)
prisma/migrations/20260922000100_rls_and_integrity/migration.sql
scripts/setup-env.mjs  scripts/db-create-local.mjs  scripts/db-app-role.mjs
scripts/generate-init-migration.mjs  scripts/test-db-prepare.mjs
scripts/seed.ts  scripts/isolation-report.ts
tests/setup.ts
tests/isolation/church-isolation.test.ts  tests/isolation/code-boundaries.test.ts
tests/unit/permissions.test.ts  tests/unit/audit.test.ts  tests/unit/crypto.test.ts
tests/safety/README.md
```

## 3) Environment variables

| Name | Purpose |
| --- | --- |
| DATABASE_OWNER_URL | Owner connection. Migrations and scripts only. |
| APP_DB_PASSWORD | Password for upheld_app, 24 characters or more. |
| FIELD_ENCRYPTION_KEY | 32 bytes, hex or base64. Back it up; losing it loses encrypted data. |
| APP_BASE_URL | Base of sign in links. |
| EMAIL_PROVIDER | console (development only), resend, or disabled. |
| EMAIL_FROM, RESEND_API_KEY | Needed when EMAIL_PROVIDER is resend. |
| SESSION_IDLE_MINUTES | Default 30, capped at 60. |
| SESSION_MAX_HOURS | Default 12. |
| ANTHROPIC_API_KEY | Unused until M5. |
| SEED_STAFF_EMAIL | Development seed only. |

.env and .env.test are written by npm run setup:env and are ignored by git.

## 4) Commands

```
npm install
npm run setup:env -- --pg-user NAME [--pg-password PASS] --email YOU@EXAMPLE.COM
npm run db:create-local
npm run db:app-role
npm run db:init-migration      (once, in M1 only)
npm run db:migrate
npm run db:seed
npm run isolation:report
npm test
npm run typecheck
npm run dev
```

Render: start command npm run start:render runs db-app-role, prisma migrate deploy, then next start. Health check at /api/health.

## 5) Decisions made in this chat that are not in the decision log

1. Staff sign in is a small custom magic link and session implementation instead of Auth.js (spec section 4). Reason: Auth.js's database tables are not church scoped and its lookups would need to bypass row level security, and two factor would be custom anyway. Security review in M9 should cover lib/auth.
2. Two database roles: owner for migrations, upheld_app for the running app. Sign in uses three narrow SECURITY DEFINER lookups.
3. The onboarding point of contact is modeled as is_account_admin on staff_users and receives Settings and staff, and Plan and billing, whatever their role (decision log over spec section 9, which gives these only to the senior pastor). The senior pastor keeps them too.
4. Two factor is required for senior pastor, care pastor, care staff, founder support, and any account administrator. Insights only staff who are not administrators do not need it.
5. Founder support never sees member content: escalation status only, aggregates only, content review, all only during an active church grant of at most 72 hours. Open question for Dennis below.
6. Escalation step types follow the decision log (three church contacts, final member message, critical incident, senior pastor email). No founder step.
7. consents includes event_invitations (decision log; missing from spec section 5).
8. members has phone_hash, a keyed blind index for matching inbound numbers. M2 defines the key and algorithm; the seed uses placeholder hashes prefixed seed:.
9. Audit entries never contain free text: actions come from a fixed list and detail is a short code, checked in code and in the database.
10. Tests run against a separate upheld_test database that is reset on every npm test.
11. pg-boss tables (M6) sit outside row level security; job payloads must carry ids only, never content.

## 6) Known issues and shortcuts to revisit

* The Today screen is a Milestone 1 placeholder showing role screens and row counts. M7 replaces it with the design in upheld-dashboard-v2.html.
* npm install reports 7 dependency vulnerabilities (3 moderate, 4 high). Do not run npm audit fix blindly; review in M9.
* otplib is pinned at 12.0.1 (deprecated warnings are expected); version 13 changed its interface. Revisit in M9.
* Prisma is pinned at 6.x. Ignore the prompt to upgrade to a major pre-release.
* Local Postgres is 18.6; Render is set to Postgres 16 in render.yaml. Tests pass locally; keep an eye on version specific SQL.
* next.config.mjs pins outputFileTracingRoot because a stray package-lock.json in Dennis's home folder confused Next.js.
* Next.js collects anonymous telemetry by default. Turn it off with npx next telemetry disable (optional, local only).
* No way to reset a lost authenticator yet. M8 adds an administrator reset; until then it needs a manual database change.
* Sign in requests are limited per staff account, not per IP address.
* Email is disabled on Render until a Resend account and sending domain exist, so staff cannot sign in on Render yet.
* The app cannot create churches yet; M8 onboarding needs a dedicated database function.
* Staff phone numbers for escalation calls and the care team contact order are not in the schema yet (M3).
* Consent records must be kept five years even after DELETE (Safety and Legal Review, C). The consent and member foreign keys use Restrict; M4 must design DELETE around this.
* Render's database owner must be allowed to create roles. If npm run start:render fails at db-app-role, stop and decide with Dennis.
* The Render generated FIELD_ENCRYPTION_KEY must be copied into a password manager.
* No ESLint yet. Next.js may add small changes to tsconfig.json and next-env.d.ts on first run.

## 7) What M2 should start with

Upload handoff-m1.md, filetree.txt, and prisma/schema.prisma, per the build kit. M2 should: define the phone blind index key (new env variable) and use it for members.phone_hash; add the Twilio webhook under app/api/twilio with signature verification; store inbound messages encrypted with lib/crypto before any processing; route all member data through withChurch; add a definer lookup function for inbound number to church, following the pattern of the auth lookups; and add audit actions to lib/audit/index.ts as needed.

Open question for Dennis: the spec gives founder support access to escalations and content review, while the decision log says the founder is never part of the care chain. M1 keeps founder support but without member content. Should founder support exist at all before the alpha review question (Safety and Legal Review item 5) is answered?
