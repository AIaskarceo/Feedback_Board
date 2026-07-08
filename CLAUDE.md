# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

The original small feedback-board prototype is being rebuilt into the
company-wide **Idea Board** described in
[`Idea-Board-PRD.md`](Idea-Board-PRD.md), following the phased build plan in
[`idea-board-prompt-plan.md`](idea-board-prompt-plan.md).

**Phase 0 (contract/schema alignment) and Phase 1 (MVP) are both complete.**

Phase 0 updated the three frozen contracts (`server/db/schema.sql`,
`packages/shared/types.ts`, `packages/shared/api-contract.md`) to the new
data model. Phase 1 then built the actual feature on top of it:

- **6-stage idea lifecycle** (`submitted → under_review → planned →
  in_progress → done`, plus `declined` from any non-terminal state),
  forward-only, fully audited in `idea_status_history`. See
  `server/src/repositories/ideas.repository.ts`'s `TRANSITIONS` map.
- **3-tier roles** (`member` / `team_lead` / `company_admin`) enforced via
  `requireRole`/`requireTeamLeadOrAdmin` (`server/src/middleware/requireRole.ts`)
  plus per-resource `canViewIdea`/`canManageIdea` checks.
- **Team-scoped visibility**: a `'team'`-visibility idea is invisible (404,
  not 403 — existence isn't leaked) to anyone outside that team who isn't the
  submitter or a `company_admin`.
- **Threaded comments** (public) with soft-delete moderation
  (`server/src/routes/comments.routes.ts`), plus a separate **private 1:1
  message thread** per idea between the submitter and whoever manages it
  (`idea_messages` table, `server/src/routes/messages.routes.ts`,
  `web/src/components/PrivateMessageThread.tsx`) — not visible to anyone else.
- **Teams, categories, user role/team assignment** — all admin-managed CRUD
  (`teams.routes.ts`, `categories.routes.ts`, `users.routes.ts`).
- **Admin audit log** (`GET /api/audit-log`) and the frontend `Audit Log` page.
- **Frontend rebuilt** around a sidebar + card + blue-pill-button visual
  system (`web/src/components/AppShell.tsx`, `web/src/index.css`) — Board,
  IdeaCard (with inline status control + comment thread), AddIdeaModal
  (title/description/visibility/category), Admin, and Audit Log pages.
- **Custom auth UI** (`web/src/pages/SignIn.tsx`, `SignUp.tsx`): built on
  Clerk's headless `useSignIn`/`useSignUp` hooks instead of the Clerk widget,
  so Clerk still handles passwords/sessions but the UI is ours. No Clerk
  Dashboard configuration needed — sign-up just collects name/email/password.
  `User.username` exists but is just a mirror of `name` (`syncUser` keeps
  them in sync), used for display/search — not a separately-chosen identifier.
- **My Ideas page** (`web/src/pages/MyIdeas.tsx`, route `/my-ideas`): every
  idea the signed-in user has submitted, oldest first. Backed by
  `GET /api/ideas?submitterId=<self>&sort=oldest`.
- **Username search**: the board's existing search box also matches the
  submitter's `name`/`username` server-side, so searching a username surfaces
  everything that person submitted.

`POST /api/ideas/:id/done` no longer exists — status changes, including the
move to `'done'` (which still emails the submitter), go through
`PATCH /api/ideas/:id/status` exclusively. See `api-contract.md`'s
"Phase 0 → Phase 1 changelog" for the full endpoint diff.

**Phase 2 is also complete:**

- **Duplicate detection**: `POST /api/ideas/check-duplicates` (Postgres
  `pg_trgm` similarity on title). `AddIdeaModal` calls it before creating and
  offers to upvote an existing idea instead.
- **Anonymous submissions**: `isAnonymous` on `POST /api/ideas` masks
  submitter identity everywhere (including for `company_admin` browsing) via
  `maskAnonymousIdea` — only `GET /api/ideas/:id/identity` (admin-only, logged
  to `admin_reveal_log`) reveals it. `IdeaCard` shows a "Reveal identity"
  button for admins on anonymous ideas.
- **Analytics dashboard** (`GET /api/analytics`, `web/src/pages/Analytics.tsx`,
  route `/analytics`, `team_lead`/`company_admin` only): submissions over
  time, ideas by status, participation by team, avg time-to-resolution, top
  contributor, most impactful idea. `team_lead` sees only their team's figures.
- **Flags/moderation queue**: `POST /api/flags`, `GET/PATCH /api/flags/...`
  (`server/src/repositories/flags.repository.ts`), surfaced in the Admin
  page's "Moderation queue" section. `IdeaCard` has a 🚩 report button.
- **User restriction**: `PATCH /api/users/:id/restrict` blocks a user's
  `POST /api/ideas` / `POST .../comments` with `403` — toggle in Admin's
  Users list.
- **In-app notifications** (`notifications` table, `GET/PATCH /api/notifications`,
  the 🔔 bell in `AppShell`): auto-created on status changes (submitter +
  voters) and comments (submitter + prior commenters). Per-user preference
  (`immediate`/`digest`/`off`) via `PATCH /api/me/notification-preference`,
  editable from the topbar.
- **Weekly digest email**: `node-cron` job in `server.ts` (Mondays 09:00) plus
  an on-demand `POST /api/admin/send-digest` (wired to an Admin-page button)
  — both call `server/src/services/digest.ts`, which reuses `sendDigestEmail`
  in `email.ts`.

**Phase 3 is also complete**, except chat-channel integration (no chat
platform was chosen — see the open question in `idea-board-prompt-plan.md`):

- **Bulk moderation**: `POST /api/ideas/:id/merge` merges a duplicate idea
  into another (votes/comments carry over, the duplicate is declined and
  gets `mergedIntoId` set) and `PATCH /api/ideas/bulk-retag` re-tags many
  ideas' category at once — both `team_lead`/`company_admin`, enforced
  per-idea via `canManageIdea`. Admin page gained "Merge duplicate ideas" and
  "Bulk re-tag" sections.
- **Data export**: `GET /api/export/ideas?format=csv|json` (`company_admin`
  only), every call logged to `export_log` (`GET /api/admin/export-log`).
  "Export CSV"/"Export JSON" buttons on the Admin page trigger a real
  browser download.
- **Retention**: `ideas.archived_at` + a one-row `app_settings` table
  (`retentionMonths`, admin-configurable via `GET/PATCH /api/admin/settings`).
  A daily `node-cron` job (`server/src/services/retention.ts`, 03:00) and an
  on-demand `POST /api/admin/run-retention` archive (never delete) done/declined
  ideas with no vote/comment/status activity for the configured window.
  Archived ideas are hidden from `GET /api/ideas` unless `includeArchived=true`.
- **Rate limiting**: `server/src/middleware/rateLimit.ts`, a small in-memory
  per-user fixed-window limiter (no new dependency) — 20 idea submissions and
  40 votes per 5 minutes, `429` on excess.
- **Dark mode**: `web/src/lib/theme.ts` + a toggle button in `AppShell`'s
  topbar, persisted to `localStorage`, applied via `data-theme` on `<html>`
  and a parallel `:root[data-theme='dark']` token block in `index.css` —
  every color in the design system is a CSS variable, so this is a token
  swap, not a parallel stylesheet.
- **Accessibility pass**: `aria-label`/`aria-hidden` added to icon-only
  buttons (bell, flag, theme toggle) across `AppShell`, `NotificationBell`,
  `IdeaCard`; decorative icon SVGs marked `aria-hidden`/`focusable="false"`.
  Company branding beyond the existing token-based color system (real logo,
  brand palette) is still pending real brand assets — the "IB" sidebar mark
  is a placeholder, per the PRD's own wording.

**Not built**: chat-channel integration (Slack/Teams webhook for new
ideas/status changes) — deliberately skipped, no platform was chosen.

**Idea research links** (post-Phase-3, `idea_resources` table): an idea's
submitter can attach supporting links/docs (`POST/GET/DELETE
/api/ideas/:id/resources[/:resourceId]`, `server/src/repositories/resources.repository.ts`).
Only the submitter (or `company_admin`) can add/remove; anyone who can view
the idea can see them. Clicking an idea's title now opens `IdeaDetailModal`
(full description/metadata + `IdeaResourceLinks`) instead of just expanding
inline. **Fixed a latent bug while adding this**: `identity.routes.ts` had
`identityRouter.use(requireAuth, requireAdmin)` applied router-wide while
sharing the `/api/ideas` mount prefix with sibling routers — since Express
runs a path-less `router.use()` before checking for a matching route, this
silently 403'd every non-admin request to any `/api/ideas/*` router mounted
after it (`mergeRouter`, `bulkRetagRouter`, and the new `resourcesRouter`),
even though those routers' own permission checks would have allowed the
caller (e.g. a `team_lead` merging their own team's ideas, or a `member`
attaching a link to their own idea). Fixed by moving `requireAdmin` to be
route-specific (`identityRouter.get('/:id/identity', requireAdmin, ...)`)
instead of router-wide — see the comment in that file for the full
explanation, and the "mount new routers at a specific prefix" warning
earlier in this doc.

**Signup approval** (post-Phase-3, company-internal tool): a new signup can't
use the app until a `company_admin` approves it. `User.approvalStatus`
(`'pending' | 'approved' | 'rejected'`) defaults to `'pending'` on first login
via `syncUser` — except `ADMIN_EMAILS` default-admins, who are auto-approved,
same as they're auto-promoted to `company_admin`. Existing users at the time
this was added were backfilled to `'approved'`. `server/src/middleware/requireApproved.ts`
blocks non-approved callers with `403` on every router except `meRouter`
(so the frontend can detect the state via `GET /api/me`) and the admin-only
user-management routers (already gated by `requireAdmin`, and admins are
always approved). New admin-only endpoints: `GET /api/users/pending`,
`PATCH /api/users/:id/approve|reject`, surfaced in Admin's new "Pending
approvals" section. Frontend gate: `App.tsx`'s `ApprovalGate` (inside
`Protected`) shows `web/src/pages/PendingApproval.tsx` instead of the app for
any signed-in, non-approved user.

## Monorepo structure

- `packages/shared` — shared TypeScript types (`types.ts`) and REST API contract (`api-contract.md`)
- `server` — Express API
  - `server/db/schema.sql` — Postgres schema: `users`, `ideas`, `votes`, `teams`,
    `categories`, `comments`, `idea_status_history`, `flags`, `idea_messages`,
    `admin_reveal_log`, `notifications`
  - `server/src/db` — connection pool + idempotent migration runner + `syncUser`
  - `server/src/lib/enums.ts` — runtime mirrors of the shared string-union types, for request validation
  - `server/src/middleware` — `requireAuth`, `requireAdmin` (`company_admin`), `requireRole`/`requireTeamLeadOrAdmin`
  - `server/src/repositories` — SQL queries; `ideas.repository.ts` owns the lifecycle
    state machine (`TRANSITIONS`), visibility (`canViewIdea`), management (`canManageIdea`),
    and anonymity masking (`maskAnonymousIdea`) checks
  - `server/src/routes` — route handlers, registered via `registerRoutes(app)` in `server/src/routes/index.ts`
    (mount new routers at a specific prefix, never bare `/api` — a `router.use(requireAuth, ...)`
    on a broadly-mounted router gates *every* later route registered after it, not just its own)
  - `server/src/services/email.ts` — Gmail SMTP (Nodemailer): "idea done" notification
    (from `status.routes.ts`) and the weekly digest (from `services/digest.ts`)
  - `server/__tests__` — end-to-end integration suite (Vitest + Supertest)
- `web` — React (Vite) frontend; `web/src/lib/apiClient.ts` is the only place that calls the API
  - `web/src/components/AppShell.tsx` — sidebar + top-bar layout (incl. notification bell) shared by every authenticated page
  - `web/src/index.css` — the design system (colors, `.card`, `.btn-pill`, badges, etc.)

Root `package.json` defines the workspaces: `packages/shared`, `server`, `web`.

## Frozen contracts — do not edit without team sign-off

- `packages/shared/types.ts` — `User`, `Role`, `Idea`, `IdeaStatus`, `Vote`, `Team`,
  `Comment`, `StatusHistoryEntry`, `Flag`, `Category`, `ApiResponse<T>` (expanded in Idea Board Phase 0)
- `packages/shared/api-contract.md` — every REST endpoint, auth requirement, and exact error strings
- `server/db/schema.sql` — the schema backing the types above: `users`, `ideas`,
  `votes`, plus `teams`, `comments`, `idea_status_history`, `flags`, `categories`
  (added in Idea Board Phase 0)

## Testing

`tsc -p server` (via `npm run build --workspace=server`) and
`npm run build --workspace=web` both pass clean.

`server/__tests__/e2e.test.ts` is 29 scenarios against the real Express app
(built via `buildTestApp()` in `server/__tests__/testApp.ts`, which mirrors
`server/src/server.ts` minus `.listen()`) and a real Postgres database:
input validation, the full lifecycle to `done` (with the notification email
asserted), illegal-transition/decline-reason rejection, team-scoped
visibility + management enforcement, threaded comments with role-gated
deletion, private messaging isolation, username mirroring, duplicate
detection, anonymous-submission masking + admin reveal + logging, analytics
scoping, flags/moderation + user restriction, in-app notification creation,
the weekly digest, admin-only team/category/user-management endpoints, the
signup-approval gate (pending → blocked → admin-approved → allowed), and the
original vote self/duplicate/404 handling. The test suite's `signIn()` helper
auto-approves each test user right after provisioning it (mirroring an
admin's approve action) so the approval gate doesn't have to be threaded
through every other test — it has its own dedicated scenario instead.
`@clerk/backend` and `nodemailer` are mocked so the suite runs without live
third-party credentials; everything else — middleware, repositories, SQL —
is exercised for real. All 29 pass.

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
