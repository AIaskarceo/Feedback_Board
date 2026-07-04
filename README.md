# Feedback_Board

A shared feedback/ideas board: members submit ideas, vote on them, and admins mark them done.

## Monorepo layout

- `packages/shared` — shared TypeScript types and the REST API contract
- `server` — backend API
- `web` — frontend app

## Frozen Contracts — do not edit after merge

The following files define the contract between backend and frontend. Once
Phase 0 merges, do not modify them without sign-off from Dev A, Dev B, and Dev C:

- [`packages/shared/types.ts`](packages/shared/types.ts)
- [`packages/shared/api-contract.md`](packages/shared/api-contract.md)
- [`server/db/schema.sql`](server/db/schema.sql)
