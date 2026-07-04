# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Phase 0 (foundation) is in place: npm-workspaces monorepo scaffold with frozen
shared contracts. No feature code (server routes, frontend app) exists yet —
that lands in later phases built by Dev B and Dev C against these contracts.

## Monorepo structure

- `packages/shared` — shared TypeScript types (`types.ts`) and REST API contract (`api-contract.md`)
- `server` — backend API (scaffold only; no implementation yet)
  - `server/db/schema.sql` — Postgres schema (`users`, `ideas`, `votes`)
- `web` — frontend app (scaffold only; no implementation yet)

Root `package.json` defines the workspaces: `packages/shared`, `server`, `web`.

## Frozen contracts — do not edit without team sign-off

These three files were established in Phase 0 and are the source of truth
that server and web implementations must conform to. Do not change their
shape without sign-off from Dev A, Dev B, and Dev C:

- `packages/shared/types.ts` — `User`, `Idea`, `Vote`, `ApiResponse<T>`
- `packages/shared/api-contract.md` — every REST endpoint, auth requirement, and exact error strings
- `server/db/schema.sql` — the 3-table schema backing the types above

## Auth & env

Auth is Clerk-based (`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`). Every API
endpoint except `GET /api/health` requires a valid Clerk session. See
`.env.example` for the full list of required environment variables
(`DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `RESEND_API_KEY`,
`APP_ORIGIN`).
