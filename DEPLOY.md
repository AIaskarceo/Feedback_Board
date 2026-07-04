# Deploying to Railway

This is a monorepo with two deployable services (`api`, `web`) plus a managed
Postgres — all three live in one Railway project.

## 1. Postgres

Add a Postgres database to the project (Railway dashboard → **New** →
**Database** → **PostgreSQL**, or `railway add --database postgres`). Railway
provisions a `DATABASE_URL` variable on that plugin automatically — nothing to
configure.

## 2. `api` service

Create a service from this repo with **Root Directory** set to the repo root
and **Config File Path** set to [`railway.api.json`](railway.api.json). It
builds and runs `server/` via the npm workspace scripts, applying migrations
on every boot (`runMigration()` is idempotent, per `server/src/db/client.ts`).

Environment variables (see [`server/.env.example`](server/.env.example)):

| Variable                  | Value                                              |
| -------------------------- | --------------------------------------------------- |
| `DATABASE_URL`             | `${{Postgres.DATABASE_URL}}`                        |
| `CLERK_SECRET_KEY`         | from your Clerk dashboard                           |
| `RESEND_API_KEY`           | from your Resend dashboard                          |
| `EMAIL_FROM`               | e.g. `Feedback Board <onboarding@resend.dev>`       |
| `APP_ORIGIN`               | `https://${{web.RAILWAY_PUBLIC_DOMAIN}}`            |

`PORT` is injected by Railway automatically; `server/src/server.ts` already
reads it.

## 3. `web` service

Create a second service from the same repo, also with **Root Directory** set
to the repo root, with **Config File Path** set to
[`railway.web.json`](railway.web.json). It builds the Vite app and serves the
static `web/dist` output with `serve`.

Environment variables (see [`web/.env.example`](web/.env.example)):

| Variable                    | Value                                             |
| ---------------------------- | -------------------------------------------------- |
| `VITE_CLERK_PUBLISHABLE_KEY` | from your Clerk dashboard                          |
| `VITE_API_BASE_URL`          | `https://${{api.RAILWAY_PUBLIC_DOMAIN}}`           |

Note `VITE_*` variables are baked in at build time, so set them before
triggering a build/deploy.

## Verifying a deploy

`npm run verify` (root) runs the same migration + integration test suite used
in CI: `npm run migrate --workspace=server && npm run test --workspace=server`.
It expects `DATABASE_URL` (and `CLERK_SECRET_KEY`, mocked in tests but still
required at import time) in the environment — point it at a disposable test
database, not production.
