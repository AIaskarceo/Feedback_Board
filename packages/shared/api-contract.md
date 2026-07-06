# API Contract — FROZEN

Do not edit after Phase 0 merge without sign-off from Dev A, Dev B, and Dev C.

All responses use the `ApiResponse<T>` shape from [`types.ts`](./types.ts):
`{ data?: T; error?: string }`.

Unless noted otherwise, every endpoint requires a valid Clerk session
(`Authorization` handled via Clerk middleware). An unauthenticated request to
any endpoint below returns `401` with `error: "Unauthorized."`.

---

## Breaking changes — Phase 0 (Idea Board PRD v1.0)

Schema/types only. No route or repository code has been updated yet — the
existing endpoints below (`GET/POST /api/ideas`, `POST /api/ideas/:id/vote`,
`POST /api/ideas/:id/done`, `GET /api/me`) still read/write the **old**
`'open' | 'done'` status and `'member' | 'admin'` role values in code, even
though the database and shared types have moved on. Team A picks this up in
Phase 1. Expect the existing test suite and `tsc` to fail until then.

1. **`Idea.status`**: was `'open' | 'done'`, now the 6-stage lifecycle
   `'submitted' | 'under_review' | 'planned' | 'in_progress' | 'done' | 'declined'`
   (PRD §6.1). Existing `'open'` rows have been migrated to `'submitted'` in
   `server/db/schema.sql`. `POST /api/ideas/:id/done` still only knows how to
   set `'done'` directly — Phase 1 replaces it with
   `PATCH /api/ideas/:id/status` (below), which is the only endpoint that
   should perform status transitions going forward.
2. **`User.role`**: was `'member' | 'admin'`, now
   `'member' | 'team_lead' | 'company_admin'` (PRD §7). Existing `'admin'`
   rows have been migrated to `'company_admin'`. `requireAdmin` middleware
   and any `role === 'admin'` checks in routes are now stale and must be
   updated in Phase 1 to check `'company_admin'` (and, for team-scoped
   actions, `'team_lead'`).
3. **`Idea` has six new fields**: `teamId` (nullable, `null` = no team
   association yet), `visibility` (`'team' | 'company'`, defaults to
   `'company'` so existing rows stay world-visible), `isAnonymous` (defaults
   `false`), `title` (backfilled from the old `text`), `description`
   (defaults to `''` on old rows), `categoryId` (nullable). Additive —
   existing consumers that ignore unknown fields are unaffected, but nothing
   populates or enforces these yet since `ideas.repository.ts` hasn't been
   touched.
4. **`Idea.text` is now deprecated** in favor of `title` + `description` (PRD
   §6.2 needs them separate, and Phase 2 duplicate detection compares them
   independently). `text` is kept — not dropped — so existing code that reads
   it doesn't get a missing-field error on top of everything else; Phase 1
   should migrate `POST /api/ideas` and the board UI onto `title`/`description`
   and can drop `text` from the schema once nothing references it.
5. **`User` has a new `teamId` field** (nullable — resolves the Phase 0 gap
   below). Single-team-per-user for now; a `team_lead`'s `teamId` is the team
   they lead.

### Decisions made resolving the two Phase 0 gaps

Both of these were flagged as open questions during the first Phase 0 pass
and are now resolved in the schema/types, not left for Phase 1 to design:

- **User ↔ team membership**: added a nullable `users.team_id` (single team
  per user), not a join table — nothing in the PRD calls for a person
  belonging to multiple teams, and a join table would be unused complexity
  until that's actually a requirement.
- **`ideas.text` single-field**: added `categories` table + `ideas.category_id`
  (nullable), plus `ideas.title`/`description` columns (backfilled from
  `text`). One category per idea for now, matching "category/tag" as
  described in PRD §8.1/§8.3 — if free-form multi-tagging turns out to be a
  real requirement later, that becomes a `tags` + join table addition then.

### New endpoints to build in Phase 1 (shapes to agree on now)

Not implemented yet — documenting the target shape so both teams design
against the same contract:

- `PATCH /api/ideas/:id/status` — body `{ status: IdeaStatus, reason?: string }`.
  `reason` required when `status` is `'declined'`. Auth: `team_lead` (own
  team's ideas) or `company_admin` (any). Writes a row to
  `idea_status_history` on every transition. Rejects illegal/backward
  transitions with `400`.
- `POST /api/ideas/:id/comments` — body `{ body: string, parentCommentId?: string }`.
  Auth: any user who can view the idea.
- `GET /api/ideas/:id/comments` — returns `Comment[]`, threaded.
- `DELETE /api/comments/:id` — Auth: `team_lead`/`company_admin` only; soft-delete
  (sets `deleted_at`), logged.
- `GET /api/ideas/:id/status-history` — returns `StatusHistoryEntry[]`. Auth:
  `company_admin` (per PRD §6.5); open question whether `team_lead` should see
  their own team's history too.
- `GET/POST /api/teams`, `PATCH /api/teams/:id` — Auth: `company_admin` only.
- `PATCH /api/users/:id/role` — role assignment. Auth: `company_admin` only.
- `POST /api/flags` — body `{ contentType: 'idea' | 'comment', contentId: string, reason: string }`.
  Auth: any user.
- `GET /api/flags`, `PATCH /api/flags/:id` (dismiss/remove) — Auth:
  `team_lead` (team-scoped) / `company_admin` (company-wide).
- `GET/POST /api/categories`, `DELETE /api/categories/:id` — Auth: `team_lead`/`company_admin`.
- `PATCH /api/users/:id/team` — assign a user to a team, body `{ teamId: string | null }`.
  Auth: `company_admin` only.

---

## `GET /api/ideas`

- **Auth:** any authenticated user
- **Request body:** none
- **Response:** `ApiResponse<Idea[]>`, sorted by `voteCount` descending
- **Errors:** none beyond the global 401

## `POST /api/ideas`

- **Auth:** any authenticated user
- **Request body:** `{ text: string }`
- **Response:** `ApiResponse<Idea>` — the created idea
- **Errors (400):**
  - Empty text → `"Idea text cannot be empty."`
  - Text over 200 characters → `"Idea text must be 200 characters or fewer."`

## `POST /api/ideas/:id/vote`

- **Auth:** any authenticated user
- **Request body:** none
- **Response:** `ApiResponse<Idea>` — the updated idea
- **Errors:**
  - Idea does not exist (404) → `"Idea not found."`
  - Voting on your own idea (400) → `"You cannot vote on your own idea."`
  - Voting twice on the same idea (400) → `"You have already voted on this idea."`

## `POST /api/ideas/:id/done`

- **Auth:** admin only
- **Request body:** none
- **Response:** `ApiResponse<Idea>` — the updated idea
- **Errors:**
  - Idea does not exist (404) → `"Idea not found."`
  - Caller is not an admin (403) → `"Only admins can perform this action."`

## `GET /api/me`

- **Auth:** any authenticated user
- **Request body:** none
- **Response:** `ApiResponse<User>` — the current user, including `role`
- **Errors:** none beyond the global 401

_Added after Phase 0 so the frontend can derive admin status from the
database `role` (source of truth) instead of Clerk `publicMetadata`, which
nothing keeps in sync. Additive and backward-compatible — no existing
endpoint's shape changed._

## `GET /api/health`

- **Auth:** none
- **Request body:** none
- **Response:** `{ ok: true }` (not wrapped in `ApiResponse`)
- **Errors:** none
