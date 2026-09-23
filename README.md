# Upheld

Text message pastoral care service for churches. This repository holds the
web application (pastor dashboard and Twilio webhooks), and from M6 the
background worker.

Sources of truth, highest first: Upheld_Decision_Log.md, the latest handoff
note (docs/handoff-mN.md), the Technical Specification, then everything else.

## Church isolation in one paragraph

The app connects to Postgres as upheld_app, a role that is not superuser,
cannot bypass row level security, and owns no tables. All church data is read
and written through withChurch() in lib/db, which sets the church for one
transaction. Every church scoped table has a policy that matches only that
church, so with no church set the app sees nothing. Triggers reject any row
that points at another church's records and make church_id permanent. The
audit log, consent history, and escalation steps are append only for every
role, including the owner.

## Commands

| Task | Command |
| --- | --- |
| Write .env and .env.test | npm run setup:env -- --pg-user NAME [--pg-password PASS] --email YOU@EXAMPLE.COM |
| Create local databases | npm run db:create-local |
| Create or update the app role | npm run db:app-role |
| Apply migrations | npm run db:migrate |
| Seed the two test churches | npm run db:seed |
| Show what each church can see | npm run isolation:report |
| Run all tests (resets upheld_test) | npm test |
| Run unit tests only | npm run test:unit |
| Type check | npm run typecheck |
| Run the app | npm run dev, then visit http://localhost:3000 |

In development, sign in emails print in the terminal running npm run dev.

## Secrets

Secrets live only in .env and .env.test (both ignored by git) and in Render's
environment settings. FIELD_ENCRYPTION_KEY cannot be recovered if lost; keep a
copy in a password manager.
