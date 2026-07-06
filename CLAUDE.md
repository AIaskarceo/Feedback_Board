# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

The original small feedback-board prototype (Phases 0–2 below) is being
rebuilt into the company-wide **Idea Board** described in
[`Idea-Board-PRD.md`](Idea-Board-PRD.md), following the phased build plan in
[`idea-board-prompt-plan.md`](idea-board-prompt-plan.md). Two teams of four
split the work: Team A (lifecycle/roles/org structure, backend-heavy) and
Team B (discovery/notifications/UX, frontend-heavy).

**Idea Board Phase 0 (contract/schema alignment) is complete and closed out:**
`server/db/schema.sql`, `packages/shared/types.ts`, and
`packages/shared/api-contract.md` have been updated to the new data model —
6-stage idea lifecycle, 3-tier roles, teams (+ single-team-per-user
membership), threaded comments, status-change audit log, anonymous-submission
support, a flagging/moderation table, and categories with an
`ideas.title`/`description` split (replacing the old single `text` field,
which is kept but deprecated). See the "Breaking changes" section at the top
of `api-contract.md` for the full diff, including the two gaps found and
resolved during Phase 0 and the target shapes for every new endpoint Phase 1
needs to build. **No route, repository, or frontend code has been updated
yet** — `tsc` and the e2e suite currently fail against the old
`'open'/'done'` and `'member'/'admin'` values by design; that cleanup is
Team A's first Phase 1 task.

Prior state (original prototype, now superseded by the above): monorepo
scaffold, Clerk auth + Postgres layer, Express routes + Gmail SMTP email
(Dev B), a React/Vite board UI (Dev C), and an end-to-end integration test
suite + Railway deploy config (Dev A).

## Monorepo structure

- `packages/shared` — shared TypeScript types (`types.ts`) and REST API contract (`api-contract.md`)
- `server` — Express API
  - `server/db/schema.sql` — Postgres schema (`users`, `ideas`, `votes`)
  - `server/src/db` — connection pool + idempotent migration runner + `syncUser`
  - `server/src/middleware` — `requireAuth`, `requireAdmin`
  - `server/src/repositories` — SQL queries for ideas/votes/users
  - `server/src/routes` — route handlers, registered via `registerRoutes(app)` in `server/src/routes/index.ts`
  - `server/src/services/email.ts` — Gmail SMTP (Nodemailer) "idea done" notification
  - `server/__tests__` — end-to-end integration suite (Vitest + Supertest)
- `web` — React (Vite) frontend; `web/src/lib/apiClient.ts` is the only place that calls the API

Root `package.json` defines the workspaces: `packages/shared`, `server`, `web`.

## Frozen contracts — do not edit without team sign-off

- `packages/shared/types.ts` — `User`, `Role`, `Idea`, `IdeaStatus`, `Vote`, `Team`,
  `Comment`, `StatusHistoryEntry`, `Flag`, `Category`, `ApiResponse<T>` (expanded in Idea Board Phase 0)
- `packages/shared/api-contract.md` — every REST endpoint, auth requirement, and exact error strings
- `server/db/schema.sql` — the schema backing the types above: `users`, `ideas`,
  `votes`, plus `teams`, `comments`, `idea_status_history`, `flags`, `categories`
  (added in Idea Board Phase 0)

## Testing

**Currently broken by design** (Idea Board Phase 0): `tsc -p server` and the
e2e suite below fail because `server/src/repositories`, `server/src/middleware`,
and `server/src/routes` still reference the old `'open'/'done'` status and
`'member'/'admin'` role values that Phase 0 removed from `packages/shared/types.ts`
and `server/db/schema.sql`. Fixing this is Team A's first Phase 1 task — see
`idea-board-prompt-plan.md`. The description below is of the suite as it existed
before Phase 0.

`server/__tests__/e2e.test.ts` runs the full sign-in → submit → vote →
self-vote-rejected → duplicate-vote-rejected → admin-resolves → email-sent →
non-admin-403 flow against the real Express app (built via `buildTestApp()`
in `server/__tests__/testApp.ts`, which mirrors `server/src/server.ts` minus
`.listen()`) and a real Postgres database. `@clerk/backend` and `nodemailer` are
mocked (`server/__tests__/e2e.test.ts`) so the suite runs without live
third-party credentials; everything else — middleware, repositories, SQL — is
exercised for real.

- `npm run test --workspace=server` — run the suite (loads `server/.env.test` via `server/vitest.config.ts`)
- `npm run migrate --workspace=server` — apply `server/db/schema.sql` (idempotent)
- `npm run verify` (root) — migration + test suite, same as CI

Copy `server/.env.test.example` to `server/.env.test` and point `DATABASE_URL`
at a disposable Postgres database before running tests locally.

**Known issue (filed for Dev B):** `server/src/server.ts` calls `app.listen()`
unconditionally at import time and doesn't export the underlying `http.Server`.
Tests work around this by rebuilding the app via `registerRoutes()` instead of
importing `server.ts` directly — consider guarding `app.listen()` behind an
entrypoint check if `server.ts` needs to become importable elsewhere.

## Deploy

See [`DEPLOY.md`](DEPLOY.md). Three Railway services: `api` (`railway.api.json`),
`web` (`railway.web.json`), and a managed Postgres plugin. The `api` service
runs migrations on every boot before starting (idempotent).

## Auth & env

Auth is Clerk-based (`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`). Every API
endpoint except `GET /api/health` requires a valid Clerk session. See
`.env.example`, `server/.env.example`, and `web/.env.example` for required
environment variables per package.

Notification emails are sent via Gmail SMTP (Nodemailer) using `GMAIL_USER` +
`GMAIL_APP_PASSWORD` (a Gmail [App Password](https://myaccount.google.com/apppasswords),
not the account login password); `EMAIL_FROM` sets the display sender.
