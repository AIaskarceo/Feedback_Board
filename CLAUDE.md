# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Phases 0–2 are in place: monorepo scaffold, Clerk auth + Postgres layer,
Express routes + Resend email (Dev B), a React/Vite board UI (Dev C), and an
end-to-end integration test suite + Railway deploy config (Dev A).

## Monorepo structure

- `packages/shared` — shared TypeScript types (`types.ts`) and REST API contract (`api-contract.md`)
- `server` — Express API
  - `server/db/schema.sql` — Postgres schema (`users`, `ideas`, `votes`)
  - `server/src/db` — connection pool + idempotent migration runner + `syncUser`
  - `server/src/middleware` — `requireAuth`, `requireAdmin`
  - `server/src/repositories` — SQL queries for ideas/votes/users
  - `server/src/routes` — route handlers, registered via `registerRoutes(app)` in `server/src/routes/index.ts`
  - `server/src/services/email.ts` — Resend "idea done" notification
  - `server/__tests__` — end-to-end integration suite (Vitest + Supertest)
- `web` — React (Vite) frontend; `web/src/lib/apiClient.ts` is the only place that calls the API

Root `package.json` defines the workspaces: `packages/shared`, `server`, `web`.

## Frozen contracts — do not edit without team sign-off

- `packages/shared/types.ts` — `User`, `Idea`, `Vote`, `ApiResponse<T>`
- `packages/shared/api-contract.md` — every REST endpoint, auth requirement, and exact error strings
- `server/db/schema.sql` — the 3-table schema backing the types above

## Testing

`server/__tests__/e2e.test.ts` runs the full sign-in → submit → vote →
self-vote-rejected → duplicate-vote-rejected → admin-resolves → email-sent →
non-admin-403 flow against the real Express app (built via `buildTestApp()`
in `server/__tests__/testApp.ts`, which mirrors `server/src/server.ts` minus
`.listen()`) and a real Postgres database. `@clerk/backend` and `resend` are
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
