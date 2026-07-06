# Idea Board — Phase-by-Phase Prompt Plan

Based on `CLAUDE.md` (current state: Phases 0–2 of the *original* scaffold — auth, DB,
API, board UI, tests, deploy) and the new PRD (multi-stage lifecycle, roles, teams,
notifications, analytics, anonymity, moderation).

**Ground rule before any code changes:** `packages/shared/types.ts`,
`packages/shared/api-contract.md`, and `server/db/schema.sql` are frozen contracts.
The PRD requires changes to all three (status enum, roles, teams, comments, votes
withdrawal, audit log). That means **Phase 0 must happen once, together, before the
two teams split** — otherwise both teams build against a data model that's about to
change under them.

---

## Team split (per PRD §10)

- **Team A — Lifecycle / Roles / Org structure (backend-heavy)**
  Owns: schema, status workflow, roles & permissions, teams, audit log, moderation,
  duplicate detection logic.
- **Team B — Discovery / Notifications / UX (frontend-heavy)**
  Owns: search & filters, sort, pagination, notification center, digest email,
  analytics dashboard UI, anonymous-submission UI, accessibility, dark mode.

Both teams consume the same `packages/shared` contract — so Phase 0 is a joint
session, not a solo task for either team.

---

## Phase 0 — Contract & schema alignment (do this first, both teams present)

**Goal:** update the frozen contracts to match the PRD before anyone builds features.

**Prompt for Claude Code:**
```
Read CLAUDE.md and Idea-Board-PRD.md in full before doing anything.

I need you to update our frozen contracts to support the new PRD scope. Do NOT
implement any feature logic yet — this step is schema/types/contract only.

1. In server/db/schema.sql:
   - Replace the current idea status with the 6-stage lifecycle from PRD §6.1:
     submitted, under_review, planned, in_progress, done, declined.
   - Add a `teams` table and a `team_id` (nullable) + `visibility` (team | company)
     column on `ideas`.
   - Add a `role` enum on `users`: member, team_lead, company_admin.
   - Add a `comments` table (threaded via nullable parent_comment_id).
   - Add an `idea_status_history` table (idea_id, changed_by, from_status, to_status,
     reason, changed_at) per PRD §6.5.
   - Add `is_anonymous` boolean on ideas, and keep the real submitter_id internally
     regardless.
   - Add a `flags` table for PRD §6.10 (content_type, content_id, flagged_by, reason,
     status).
   - Keep all changes additive and migration-safe — this must still run idempotently
     via the existing migration runner.

2. In packages/shared/types.ts:
   - Update the Idea, User types and add Team, Comment, Vote, StatusHistoryEntry,
     Flag types to match the new schema.
   - Keep ApiResponse<T> unchanged.

3. In packages/shared/api-contract.md:
   - Document new/changed endpoints needed for: status transitions with required
     reason on decline, comments (CRUD + threading), team CRUD, role assignment,
     flagging, and status history retrieval.
   - Keep the existing documented endpoints intact unless their shape must change
     for the new status enum — call those out explicitly in a "Breaking changes"
     section at the top of the file.

Don't touch server/src/routes, server/src/repositories, or web/ yet. Stop after the
three files above and give me a summary of every breaking change so I can confirm
before either team starts building against it.
```

Review the breaking-changes summary together, then re-run `npm run migrate` and
`npm run test --workspace=server` to confirm existing tests fail in the expected
places (they will — that's fine, Team A picks those up in Phase 1).

---

## Phase 1 — MVP (PRD §11, Phase 1)

Scope: lifecycle, roles, categories/tags, comments, rejection reasons, team-scoped
visibility, search & filters, audit log.

### Team A prompts (backend)

```
Implement the 6-stage idea lifecycle and role-based permissions on top of the
Phase 0 schema/contract changes.

1. server/src/middleware: extend requireAuth/requireAdmin with a requireRole(role)
   middleware, and add requireTeamLeadOrAdmin for team-scoped actions.
2. server/src/repositories: add status-transition queries that (a) reject illegal
   backward transitions, (b) require a reason string when moving to `declined`,
   (c) write a row to idea_status_history on every transition.
3. server/src/routes: add PATCH /api/ideas/:id/status, and category/tag CRUD
   endpoints as documented in the updated api-contract.md.
4. Enforce visibility: team-scoped ideas are only returned to members of that team
   or company_admin; company-wide ideas are visible to everyone.
5. Add comment endpoints (POST/GET/DELETE) with threading via parent_comment_id,
   and role-gated deletion (team_lead/admin only, logged).

Update server/__tests__/e2e.test.ts to cover: full lifecycle happy path, illegal
transition rejection, decline-without-reason rejection, team-visibility enforcement,
and comment threading. Run npm run verify and fix until green.
```

```
Implement the org/team structure:
1. CRUD endpoints for teams (company_admin only).
2. User-to-team assignment endpoint (company_admin only).
3. Update syncUser (server/src/db) so Clerk-side org/team metadata (if you're using
   Clerk Organizations) maps to our internal teams table on sign-in.
Document all of this in api-contract.md and add e2e coverage for admin-only access.
```

### Team B prompts (frontend)

```
Read web/src/lib/apiClient.ts and the updated packages/shared/api-contract.md
before starting — apiClient.ts is the only place allowed to call the API.

1. Update the board UI to show the 6-stage status as a visible badge/column
   (kanban-style or status filter — your call, keep it simple for MVP).
2. Add a category/tag selector on the idea submission form, and tag-based filtering
   on the board.
3. Add a comment thread UI under each idea (nested replies, one level of visual
   indent is fine for MVP).
4. Add a "visibility" toggle (team-only / company-wide) on the submission form.
5. Add a Team Lead/Admin-only status-change control (dropdown + required reason
   field when declining) that calls PATCH /api/ideas/:id/status.
6. Add search (keyword) and filter (status, tag, team, submitter) controls above
   the board, and sort options: newest, most voted (all-time), most voted (this
   week), most discussed.

Keep styling consistent with the existing board UI. Don't touch server/ or
packages/shared/.
```

```
Add a minimal audit-log view (admin-only route) that lists idea_status_history
entries: who changed what, from/to status, when, and reason if declined. Table
view is fine — no charts yet, that's Phase 2 analytics.
```

**Phase 1 exit check:** run `npm run verify` at root, confirm e2e suite covers the
full new lifecycle, and manually walk through PRD §6.2–§6.7 workflows end to end.

---

## Phase 2 — Notifications, analytics, duplicate detection, anonymity, recognition

### Team A prompts (backend)

```
1. Implement duplicate-idea detection: on POST /api/ideas, run a simple text
   similarity check (title + description) against existing open ideas in the same
   scope, using [pg_trgm similarity in Postgres, or a basic Jaccard/cosine check in
   app code — pick whichever is less infra work] and return close matches for the
   client to show before final submission, per PRD §6.2 step 4.
2. Implement anonymous submission (PRD §6.9): is_anonymous flag hides submitter
   identity in all GET responses except for company_admin, and log every admin
   access to a hidden identity in a new admin_reveal_log table.
3. Add analytics endpoints: submissions over time, participation rate by team,
   time-to-resolution (from idea_status_history), ideas by status — company_admin
   gets company-wide, team_lead gets team-scoped only.
4. Add the flagging/moderation queue endpoints from PRD §6.10 (flag, list flags,
   dismiss, remove content, restrict user).

Add e2e tests for: duplicate detection returns matches, anonymous idea hides
identity from non-admins, admin reveal is logged, analytics scoping by role.
```

### Team B prompts (frontend)

```
1. Build the in-app notification center (bell icon + list) per PRD §6.8: idea
   status changes, comments on threads you're in, votes-followed status changes.
   Add per-user notification preferences (immediate / digest / off) in a settings
   panel.
2. Add the "submit anonymously" toggle to the idea form, and render anonymous
   ideas without attribution everywhere except the admin view.
3. Build the duplicate-match modal: when the backend returns close matches during
   submission, show them and let the user upvote an existing idea instead of
   submitting a duplicate.
4. Build the analytics dashboard: submissions-over-time chart, participation by
   team, time-to-resolution, ideas-by-status breakdown. Use recharts if this ships
   as a React app.
5. Add lightweight recognition: "Top contributor" and "Most impactful idea" widgets
   on the board, computed from the analytics endpoints, refreshed monthly per PRD.
```

**Also needed this phase (either team, coordinate ownership):**
```
Wire the weekly digest email: extend server/src/services/email.ts (currently
"idea done" notification only) to support a digest template summarizing new/trending
ideas per team, sent via the existing Gmail SMTP setup. Add a scheduled job (simple
cron via node-cron is fine at this scale) that runs weekly and only emails users
whose notification preference is "digest".
```

**Phase 2 exit check:** `npm run verify`, plus manual walkthrough of PRD §6.8–§6.10.

---

## Phase 3 — Chat integration, bulk moderation, export/retention, accessibility, dark mode

### Team A prompts (backend)

```
1. Add a webhook-based integration to post new ideas / status changes to a team
   chat channel (Slack or Teams — confirm which one the company uses before
   building). Make the webhook URL per-team, configurable by team_lead/admin.
2. Add bulk-action endpoints: merge duplicate ideas (votes/comments carry over,
   original marked as merged-into), bulk re-tag.
3. Add CSV/JSON export endpoints for idea data (company_admin only, respect
   visibility rules — exports should not leak team-only data to a non-member admin
   view... actually admin sees everything, but log exports for audit).
4. Add a retention job: archive (not delete) ideas with no activity for N months
   in a declined/stale state — configurable N, admin-set.
5. Add rate limiting on POST /api/ideas and POST /api/votes (e.g. express-rate-limit)
   to satisfy PRD §8.5 spam prevention.
```

### Team B prompts (frontend)

```
1. Accessibility pass: keyboard navigation across the whole board and forms,
   ARIA labels on interactive elements, run an automated contrast check and fix
   any failures.
2. Add dark mode (should be cheap if the design system is token-based — if not,
   extract color tokens first, then add the toggle).
3. Apply company branding: logo, color palette throughout (placeholder tokens
   until real brand assets are provided).
4. Build the bulk-moderation admin UI: merge-duplicates flow, bulk re-tag, flagged
   content queue actions (dismiss / remove / restrict user).
5. Add an "Export data" button (CSV/JSON) on the admin analytics view.
```

**Phase 3 exit check:** `npm run verify`, full accessibility audit, and a final
end-to-end walkthrough of every PRD section before calling this pitch-ready.

---

## Open questions to resolve before or during Phase 1 (PRD §10)

Raise these with your team lead / whoever owns the pitch before building goes too
far, since they affect the review workflow and ownership model:

1. Does every idea get formally reviewed, or only ones crossing a vote threshold?
2. Who's accountable for a "Planned" idea actually getting delivered?
3. Which chat platform (Slack/Teams) for Phase 3 integration?

---

## How to use these prompts

Paste each block into Claude Code as-is inside the relevant package. They assume
Claude Code has the repo open and can read `CLAUDE.md` and the PRD directly — if
it can't find `Idea-Board-PRD.md` in the repo, drop a copy in the repo root first
so future sessions have it as ambient context, the same way `CLAUDE.md` already is.
