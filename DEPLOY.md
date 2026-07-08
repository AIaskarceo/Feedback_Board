# Deploying: Vercel (web) + Render (api) + Neon (Postgres)

This is a monorepo with two deployable services (`api`, `web`) plus a managed
Postgres database, split across three providers.

## 1. Neon (Postgres)

Create a new Neon project (neon.tech dashboard → **New Project**). Neon
provisions a connection string immediately — copy the **pooled** connection
string (the one with `-pooler` in the hostname; Render's `api` service should
use this one so short-lived connections from the app don't exhaust Neon's
direct connection limit). This is your `DATABASE_URL`.

## 2. Render (`api` service)

Create a new **Web Service** on Render from this repo.

| Setting              | Value                                                    |
| --------------------- | --------------------------------------------------------- |
| Root Directory        | repo root                                                 |
| Build Command         | `npm install && npm run build --workspace=server`         |
| Start Command         | `npm run migrate --workspace=server && npm run start --workspace=server` |
| Health Check Path     | `/api/health`                                             |

Environment variables (see [`server/.env.example`](server/.env.example)):

| Variable                  | Value                                              |
| -------------------------- | --------------------------------------------------- |
| `DATABASE_URL`             | Neon pooled connection string                       |
| `CLERK_SECRET_KEY`         | from your Clerk dashboard                           |
| `GMAIL_USER`               | Gmail address used to send notification emails      |
| `GMAIL_APP_PASSWORD`       | Gmail App Password (not your login password)        |
| `EMAIL_FROM`               | e.g. `Feedback Board <your-address@gmail.com>`      |
| `ADMIN_EMAILS`             | comma-separated emails to auto-promote to admin on first sign-in |

`APP_ORIGIN` is not used — CORS is open to any origin (`server/src/server.ts`),
since auth is a Bearer token, not a cookie, so there's no CSRF exposure from
allowing cross-origin callers.

`PORT` is injected by Render automatically; `server/src/server.ts` already
reads it.

Render web services spin down on the free tier after inactivity, which will
delay the first request after idle (cold start) and can cause the `node-cron`
jobs in `server.ts` — the Monday 09:00 digest and the daily 03:00 retention
sweep — to be skipped if the service happens to be asleep at that time. Use a
paid instance type (or an external uptime ping) if those jobs must run
reliably on schedule.

## 3. Vercel (`web` service)

Import this repo as a new Vercel project.

| Setting          | Value                          |
| ------------------ | --------------------------------- |
| Root Directory     | `web`                             |
| Framework Preset   | Vite                              |
| Build Command      | `npm run build` (default)         |
| Output Directory   | `dist` (default)                  |

Environment variables (see [`web/.env.example`](web/.env.example)):

| Variable                    | Value                                             |
| ---------------------------- | -------------------------------------------------- |
| `VITE_CLERK_PUBLISHABLE_KEY` | from your Clerk dashboard                          |
| `VITE_API_BASE_URL`          | the Render `api` service's public URL              |

Note `VITE_*` variables are baked in at build time, so set them in Vercel's
project settings before triggering a build/deploy, and re-deploy if they
change.

## Verifying a deploy

`npm run verify` (root) runs the same migration + integration test suite used
in CI: `npm run migrate --workspace=server && npm run test --workspace=server`.
It expects `DATABASE_URL` (and `CLERK_SECRET_KEY`, mocked in tests but still
required at import time) in the environment — point it at a disposable test
database (a separate Neon branch works well for this), not production.
