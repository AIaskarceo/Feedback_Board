# API Contract

All responses use the `ApiResponse<T>` shape from [`types.ts`](./types.ts):
`{ data?: T; error?: string }`.

Unless noted otherwise, every endpoint requires a valid Clerk session
(`Authorization` handled via Clerk middleware). An unauthenticated request to
any endpoint below returns `401` with `error: "Unauthorized."`.

---

## Phase 2 — duplicate detection, anonymity, analytics, moderation, notifications

### `POST /api/ideas/check-duplicates`
- **Auth:** any authenticated user
- **Request body:** `{ title: string }`
- **Response:** `ApiResponse<DuplicateCandidate[]>` — up to 5 existing (non-declined,
  visible-to-caller) ideas whose title is similar (Postgres trigram
  similarity > 0.3), highest similarity first. Call this before `POST /api/ideas`
  and let the user upvote an existing idea instead of creating a duplicate.

### Anonymous submissions
- `POST /api/ideas` accepts `isAnonymous?: boolean`.
- Every idea response (list, single, vote, status-change) masks
  `submitterName`/`submitterUsername` to `"Anonymous"` and `submitterId` to
  `""` when `isAnonymous` is true and the viewer isn't the submitter — **even
  for `company_admin`**, browsing never reveals identity.
- **`GET /api/ideas/:id/identity`** (`company_admin` only) — returns the
  unmasked idea. If it's anonymous, this call is logged to `admin_reveal_log`.
  404 if the idea doesn't exist or isn't visible to the caller.
- **`GET /api/admin-reveal-log`** (`company_admin` only) — the 500 most recent
  reveals, newest first.

### `GET /api/analytics`
- **Auth:** `team_lead` or `company_admin`
- **Response:** `ApiResponse<Analytics>` — `company_admin` gets company-wide
  figures; `team_lead` gets figures scoped to `ideas.team_id = <their team>`
  only. Includes: submissions over the last 30 days by day, idea counts by
  status, participation by team, average hours from submission to
  done/declined, top contributor (most ideas submitted), and the
  most-voted `'done'` idea ("most impactful").

### Flags / moderation queue
- **`POST /api/flags`** — any authenticated user. Body: `{ contentType: 'idea' | 'comment', contentId: string, reason: string }`.
  404 if the content doesn't exist or isn't visible to the caller.
- **`GET /api/flags`** (`team_lead`/`company_admin`) — `team_lead` sees only
  flags on content belonging to their own team (resolved via the idea directly,
  or via a comment's parent idea); `company_admin` sees all.
- **`PATCH /api/flags/:id`** (`team_lead`/`company_admin`, team-scoped for
  `team_lead`) — body `{ status: 'dismissed' | 'removed' }`. `'removed'` on a
  `comment` flag soft-deletes that comment (same effect as `DELETE /api/comments/:id`);
  `'removed'` on an `idea` flag only marks the flag itself — an idea's own
  lifecycle status (e.g. declining it) is the mechanism for handling a
  flagged idea, there's no separate "removed" idea state.
- **`PATCH /api/users/:id/restrict`** (`company_admin` only) — body
  `{ isRestricted: boolean }`. A restricted user gets `403` from
  `POST /api/ideas` and `POST /api/ideas/:id/comments`.

### In-app notifications
- **`GET /api/notifications`** — the caller's 100 most recent, newest first.
- **`PATCH /api/notifications/:id/read`**, **`POST /api/notifications/read-all`**.
- **`PATCH /api/me/notification-preference`** — body `{ notificationPreference: 'immediate' | 'digest' | 'off' }`.
- Notifications are created automatically: `status_change` (idea's submitter,
  when someone else changes its status), `voted_status_change` (everyone who
  voted on an idea, when its status changes), `comment` (the idea's submitter
  plus everyone who's previously commented, excluding the new commenter).
  Creation failures are logged, never fail the triggering request.

### Weekly digest email
- A `node-cron` job in `server.ts` runs every Monday 09:00 server time,
  emailing users with `notificationPreference: 'digest'` a summary of new
  ideas (last 7 days) and this-week's trending ideas, scoped to what they can
  see. Skipped for a user if there's nothing to report.
- **`POST /api/admin/send-digest`** (`company_admin` only) — triggers the same
  job on demand; returns `{ sent, failed }` counts.

## Phase 1.6/1.7 — custom auth UI + username (mirrors display name)

`web/src/pages/SignIn.tsx` and `SignUp.tsx` are custom-built forms using
Clerk's headless `useSignIn`/`useSignUp` hooks — not the `<SignIn>`/`<SignUp>`
Clerk widgets. Clerk still owns password storage, sessions, and email
verification; only the UI is custom. No Clerk Dashboard configuration is
required — sign-up only collects name/email/password (Phase 1.6 briefly had
a separate username field requiring Clerk's "Username" identifier; Phase 1.7
dropped that in favor of just using the display name).

- **`User` gained `username`**. It's not a separate identifier — `syncUser`
  always sets it equal to `name` and keeps it in sync on every login, the
  same way `email`/`name` already were. Not unique (people can share a name).
- **`GET /api/ideas` search** also matches the submitter's `name`/`username`
  (currently identical values), not just idea `title`/`description` —
  searching a person's name surfaces every idea they submitted.
- **`IdeaSort` gained `'oldest'`** (`created_at ASC`) — backs the "My Ideas"
  page's "first idea to most recent" ordering.
- **`Idea` gained `submitterUsername`**.

## Phase 0 → Phase 1 changelog

Phase 0 changed the schema/types only; Phase 1 (below) is where the routes
and repositories actually caught up. Summary of what changed along the way,
newest first:

- **`POST /api/ideas/:id/done` is removed.** Status changes — including the
  final move to `'done'` — now go through `PATCH /api/ideas/:id/status`
  exclusively, so every transition is recorded in `idea_status_history`. The
  submitter-notification email still fires, now from the status route when
  the new status is `'done'`.
- **`POST /api/ideas` body changed** from `{ text }` to
  `{ title, description?, visibility?, categoryId? }` (see below). `text` is
  still stored (backfilled from `title`) but is no longer part of the write
  contract.
- **`Idea.status`**: `'open' | 'done'` → the 6-stage lifecycle
  `'submitted' | 'under_review' | 'planned' | 'in_progress' | 'done' | 'declined'`.
- **`User.role`**: `'member' | 'admin'` → `'member' | 'team_lead' | 'company_admin'`.
- **`Idea` gained**: `title`, `description`, `teamId`, `visibility`,
  `isAnonymous` (unused until Phase 2), `categoryId`, `commentCount`.
- **`User` gained**: `teamId` (nullable, single team per user).
- Status transitions are forward-only and audited — see "Idea lifecycle"
  below.
- Visibility is enforced everywhere an idea is read or acted on: a
  `'team'`-scoped idea is invisible (404, not 403 — existence isn't leaked)
  to anyone outside that team who isn't the submitter or a `company_admin`.

---

## Idea lifecycle

Six stages, forward-only, per PRD §6.1:

```
submitted → under_review → planned → in_progress → done
submitted → planned                                  (fast-track)
(submitted | under_review | planned | in_progress) → declined
```

`done` and `declined` are terminal — no further transitions are accepted.
Every transition (including the implicit `null → submitted` on creation) is
recorded in `idea_status_history` with who changed it and, for `declined`,
why.

## Visibility & permissions model

- **`visibility: 'company'`** (default): visible to every authenticated user.
- **`visibility: 'team'`**: visible only to members of that team, the
  submitter, and any `company_admin`. Set automatically from the submitter's
  own `teamId` at creation time — you cannot post a team-scoped idea into a
  team you don't belong to.
- **Managing** an idea (status transitions, comment moderation) requires
  `company_admin` (any idea) or `team_lead` of the idea's own team. A
  `team_lead` of a different team gets the same response as anyone else who
  can't see the idea — `404`, not `403`.

---

## `GET /api/ideas`

- **Auth:** any authenticated user
- **Query params (all optional):**
  - `search` — case-insensitive substring match against `title`/`description`
  - `status` — one of the six `IdeaStatus` values
  - `categoryId`, `teamId`, `submitterId` — exact match
  - `sort` — `newest` | `votes` (default) | `votes_week` | `discussed`
- **Response:** `ApiResponse<Idea[]>`, filtered to ideas visible to the caller
- **Errors:** none beyond the global 401

## `POST /api/ideas`

- **Auth:** any authenticated user
- **Request body:** `{ title: string, description?: string, visibility?: 'team' | 'company', categoryId?: string, teamId?: string }`
  — `teamId` only matters when `visibility: 'team'`; a user can belong to
  several teams (see "Multi-team membership" below), so it selects which one
  to post into. Omit it to default to the first team in `User.teamIds`.
- **Response:** `ApiResponse<Idea>` — the created idea, status `'submitted'`
- **Errors (400):**
  - Empty title → `"Idea title cannot be empty."`
  - Title over 200 characters → `"Idea title must be 200 characters or fewer."`
  - Description over 2000 characters → `"Idea description must be 2000 characters or fewer."`
  - `visibility: 'team'` with no team membership → `"You must belong to a team to submit a team-only idea."`
  - `visibility: 'team'` with a `teamId` the caller doesn't belong to → `"You can only submit a team-only idea to a team you belong to."`
  - Unknown `categoryId` → `"Category not found."`

## `POST /api/ideas/:id/vote`

- **Auth:** any authenticated user who can view the idea
- **Request body:** none
- **Response:** `ApiResponse<Idea>` — the updated idea
- **Errors:**
  - Idea does not exist or isn't visible to the caller (404) → `"Idea not found."`
  - Voting on your own idea (400) → `"You cannot vote on your own idea."`
  - Voting twice on the same idea (400) → `"You have already voted on this idea."`

## `PATCH /api/ideas/:id/status`

- **Auth:** `team_lead` (idea's own team only) or `company_admin` (any idea)
- **Request body:** `{ status: IdeaStatus, reason?: string }` — `reason` required when `status` is `'declined'`
- **Response:** `ApiResponse<Idea>` — the updated idea. If the new status is
  `'done'`, the submitter is emailed (best-effort; a delivery failure doesn't
  fail the request).
- **Errors:**
  - Idea not found / not visible / caller isn't `team_lead` or `company_admin` (404) → `"Idea not found."`
  - Caller is a `team_lead` of a different team (403) → `"You do not have permission to change this idea's status."`
  - Illegal transition (400) → `"Cannot move an idea from '<from>' to '<to>'."`
  - Declining without a reason (400) → `"A reason is required when declining an idea."`

## `GET /api/ideas/:id/status-history`

- **Auth:** same as managing the idea — `team_lead` (own team) or `company_admin`
- **Response:** `ApiResponse<StatusHistoryEntry[]>`, oldest first
- **Errors:** 404 (not found/not visible) or 403 (visible but not yours to manage), same messages as the status endpoint

## `GET /api/audit-log`

- **Auth:** `company_admin` only
- **Response:** `ApiResponse<StatusHistoryEntry[]>` — the 500 most recent status changes across every idea, newest first
- **Errors:** 403 → `"Only admins can perform this action."`

## `GET /api/ideas/:id/comments`

- **Auth:** any user who can view the idea
- **Response:** `ApiResponse<Comment[]>`, oldest first. Deleted comments are
  included with `body: "[comment removed]"` and `deletedAt` set, so reply
  threads stay intact.
- **Errors:** 404 (idea not found/not visible) → `"Idea not found."`

## `POST /api/ideas/:id/comments`

- **Auth:** any user who can view the idea
- **Request body:** `{ body: string, parentCommentId?: string }`
- **Response:** `ApiResponse<Comment>` — the created comment
- **Errors (400):**
  - Empty body → `"Comment cannot be empty."`
  - Over 2000 characters → `"Comment must be 2000 characters or fewer."`
  - `parentCommentId` doesn't belong to this idea → `"Parent comment not found."`
- **Errors (404):** idea not found/not visible → `"Idea not found."`

## `DELETE /api/comments/:id`

- **Auth:** `team_lead` (comment's idea is on their team) or `company_admin`
- **Response:** `ApiResponse<Comment>` — soft-deleted (`deletedAt` set, `body` becomes `"[comment removed]"`)
- **Errors:**
  - Comment doesn't exist (404) → `"Comment not found."`
  - Caller can't manage the comment's idea (403) → `"You do not have permission to delete this comment."`

## `GET /api/ideas/:id/messages`

- **Auth:** the idea's submitter, or whoever can manage it (`team_lead` of its
  team, or any `company_admin`) — a private 1:1 thread, separate from
  `Comment`, not visible to anyone else even if they can otherwise see the idea
- **Response:** `ApiResponse<IdeaMessage[]>`, oldest first
- **Errors:**
  - Idea not found/not visible to caller (404) → `"Idea not found."`
  - Idea visible but caller isn't a thread participant (403) → `"You do not have permission to view these messages."`

## `POST /api/ideas/:id/messages`

- **Auth:** same participants as above
- **Request body:** `{ body: string }`
- **Response:** `ApiResponse<IdeaMessage>` — the created message
- **Errors (400):** empty → `"Message cannot be empty."`; over 2000 characters → `"Message must be 2000 characters or fewer."`
- **Errors:** same 404/403 as the GET above (403 message: `"You do not have permission to message on this idea."`)

## `GET /api/teams`

- **Auth:** any authenticated user
- **Response:** `ApiResponse<Team[]>`, alphabetical

## `POST /api/teams`

- **Auth:** `company_admin` only
- **Request body:** `{ name: string }`
- **Response:** `ApiResponse<Team>`
- **Errors (400):** empty/over 100 chars → `"Team name is required and must be 100 characters or fewer."`; duplicate name → `"A team with this name already exists."`

## `PATCH /api/teams/:id`

- **Auth:** `company_admin` only
- **Request body:** `{ name: string }`
- **Response:** `ApiResponse<Team>`
- **Errors:** same 400s as create, plus 404 → `"Team not found."`

## `GET /api/categories`

- **Auth:** any authenticated user
- **Response:** `ApiResponse<Category[]>`, alphabetical

## `POST /api/categories`

- **Auth:** `team_lead` or `company_admin`
- **Request body:** `{ name: string }`
- **Response:** `ApiResponse<Category>`
- **Errors (400):** empty/over 100 chars → `"Category name is required and must be 100 characters or fewer."`; duplicate → `"A category with this name already exists."`

## `GET /api/users`

- **Auth:** `company_admin` only
- **Response:** `ApiResponse<User[]>`, alphabetical by name

## `PATCH /api/users/:id/role`

- **Auth:** `company_admin` only
- **Request body:** `{ role: Role }`
- **Response:** `ApiResponse<User>`
- **Errors:** invalid role (400) → `"Invalid role."`; user not found (404) → `"User not found."`

## `PATCH /api/users/:id/team`

- **Auth:** `company_admin` only
- **Request body:** `{ teamId: string | null }` — sets the user's *primary*
  team (used for `team_lead` role scoping and analytics); `null` clears it.
  Also ensures a matching `user_teams` membership row exists — setting the
  primary team always keeps it inside the user's team set.
- **Response:** `ApiResponse<User>`
- **Errors:** unknown team (400) → `"Team not found."`; user not found (404) → `"User not found."`

## Multi-team membership

A user can belong to several teams (`User.teamIds`), separate from their
single *primary* team (`User.teamId`, used for `team_lead` scoping and
analytics). Team-only idea visibility and which team a user may post a
team-only idea into are both governed by the full `teamIds` set.

### `POST /api/users/:id/teams`
- **Auth:** `company_admin` only
- **Request body:** `{ teamId: string }` — adds a membership (no-op if already a member)
- **Response:** `ApiResponse<User>`
- **Errors:** missing `teamId` (400) → `"teamId is required."`; unknown team (400) → `"Team not found."`; user not found (404) → `"User not found."`

### `DELETE /api/users/:id/teams/:teamId`
- **Auth:** `company_admin` only
- **Response:** `ApiResponse<User>` — if the removed team was the user's
  primary team, their primary team is cleared to `null` too
- **Errors:** user not found (404) → `"User not found."`

## `GET /api/directory`
- **Auth:** any authenticated user
- **Response:** `ApiResponse<DirectoryUser[]>` — every user's `id`/`name`/`username`/`hasAvatar`
  (no email/role), alphabetical by name. Backs the "add members" picker on an idea.

## Idea collaborators (`IdeaMember`)

Users an idea's submitter adds to build the idea together. A collaborator can
view the idea (even a team-only one outside their own teams) and contribute
documents/research links, but never manages its lifecycle — that stays with
the submitter/team_lead/company_admin as before.

### `GET /api/ideas/:id/members`
- **Auth:** any user who can view the idea
- **Response:** `ApiResponse<IdeaMember[]>`, oldest first
- **Errors:** 404 (idea not found/not visible) → `"Idea not found."`

### `POST /api/ideas/:id/members`
- **Auth:** the idea's submitter, or `company_admin`
- **Request body:** `{ userId: string }`
- **Response:** `ApiResponse<IdeaMember>`
- **Errors:**
  - Idea not found/not visible (404) → `"Idea not found."`
  - Caller isn't the submitter/an admin (403) → `"Only the submitter can add members to this idea."`
  - Missing `userId` (400) → `"userId is required."`
  - `userId` is the submitter (400) → `"The submitter is already on the idea and cannot be added as a member."`
  - Unknown `userId` (400) → `"User not found."`
  - Already a member (400) → `"This person is already a member of the idea."`

### `DELETE /api/ideas/:id/members/:userId`
- **Auth:** the idea's submitter, or `company_admin`
- **Response:** `ApiResponse<null>`
- **Errors:** idea not found/not visible (404) → `"Idea not found."`; caller isn't the submitter/an admin (403) → `"Only the submitter can remove members from this idea."`; not a member (404) → `"Member not found."`

## `GET /api/me`

- **Auth:** any authenticated user
- **Response:** `ApiResponse<User>` — the current user, including `role`, `teamId` (primary team), and `teamIds` (full membership set)
- **Errors:** none beyond the global 401

## `GET /api/health`

- **Auth:** none
- **Response:** `{ ok: true }` (not wrapped in `ApiResponse`)

---

## Phase 3 — bulk moderation, export/retention, rate limiting

Chat-channel integration is the one Phase 3 PRD item deliberately **not**
built (no chat platform was chosen). Everything else below is implemented.

### `POST /api/ideas/:id/merge`
- **Auth:** `team_lead` (both ideas must be manageable by them, i.e. on their
  own team) or `company_admin`
- **Request body:** `{ intoIdeaId: string }` — `:id` is the duplicate
  (source) being merged away; `intoIdeaId` is the surviving idea (target)
- **Response:** `ApiResponse<MergeIdeasResult>` — `{ target, source }`, both
  the updated `Idea` objects. The source's votes move to the target (a voter
  who'd already voted on both keeps a single vote, not two); its comments
  move unconditionally; the source is transitioned to `'declined'` (recorded
  in `idea_status_history` with a reason noting the merge) and gets
  `mergedIntoId` set to the target's id.
- **Errors:**
  - Source or target not found/not visible (404) → `"Idea not found."`
  - Caller can't manage one of the ideas (403) → `"You do not have permission to merge these ideas."`
  - `intoIdeaId` missing (400) → `"intoIdeaId is required."`
  - Source and target are the same idea (400) → `"An idea cannot be merged into itself."`
  - Source is already `'done'` or `'declined'` (400) → `"Cannot merge an idea that is already done or declined."`

### `PATCH /api/ideas/bulk-retag`
- **Auth:** `team_lead` or `company_admin`
- **Request body:** `{ ideaIds: string[], categoryId: string | null }`
- **Response:** `ApiResponse<Idea[]>` — the ideas that were actually updated.
  Any id in `ideaIds` that doesn't exist or that the caller can't manage
  (e.g. a `team_lead` targeting another team's idea) is silently skipped
  rather than failing the whole batch — diff `ideaIds.length` against the
  response length to see what was skipped.
- **Errors (400):** empty `ideaIds` → `"ideaIds must be a non-empty array."`; unknown `categoryId` → `"Category not found."`

### `GET /api/export/ideas`
- **Auth:** `company_admin` only
- **Query params:** `format` — `'json'` (default) or `'csv'`
- **Response:** `format=json` → `ApiResponse<Idea[]>` (anonymous ideas masked
  as usual, includes archived ideas). `format=csv` → raw
  `text/csv` body (`Content-Disposition: attachment`), one row per idea:
  id, title, description, status, submitterName, teamId, visibility,
  categoryId, voteCount, commentCount, createdAt, archivedAt.
- Every call is logged to `export_log` (who, format, how many ideas), visible
  via `GET /api/admin/export-log`.

### `GET /api/admin/export-log`
- **Auth:** `company_admin` only
- **Response:** `ApiResponse<ExportLogEntry[]>` — the 500 most recent
  exports, newest first.

### Retention (PRD §8.7)
- **`GET /api/admin/settings`** (`company_admin`) — `ApiResponse<AppSettings>`, currently just `{ retentionMonths }` (default `6`).
- **`PATCH /api/admin/settings`** (`company_admin`) — body `{ retentionMonths: number }` (positive integer). Errors (400): `"retentionMonths must be a positive whole number."`
- **`POST /api/admin/run-retention`** (`company_admin`) — runs the same
  archival sweep as the daily cron job (`server.ts`, 03:00) on demand.
  Response: `ApiResponse<RetentionRunResult>` → `{ archived: number }`.
- A `'done'` or `'declined'` idea is archived (`archived_at` set, never
  deleted) once it's had no activity — no new vote, comment, or status
  change — for `retentionMonths`. Archived ideas are excluded from
  `GET /api/ideas` by default; pass `includeArchived=true` to see them anyway.

### `GET /api/ideas` gained `includeArchived`
- New optional query param, `includeArchived=true` — when omitted/false,
  archived ideas (see Retention above) are excluded from results.

### Rate limiting (PRD §8.5)
- `POST /api/ideas` and `POST /api/ideas/:id/vote` are rate-limited per
  signed-in user: 20 idea submissions / 5 minutes, 40 votes / 5 minutes.
  Exceeding the limit returns `429` with `{ error: "Too many ideas submitted. Please wait a few minutes and try again." }`
  (or the equivalent voting message). In-memory, per server instance — see
  `server/src/middleware/rateLimit.ts`.

### `Idea` gained `mergedIntoId`, `archivedAt`, `isCollaborator`, `submitterHasAvatar`

## Idea research links (`IdeaResource`)

Lets an idea's submitter attach supporting research (links to docs, prior
art, etc.) that shows up in the idea's detail view for anyone who can see
the idea.

### `GET /api/ideas/:id/resources`
- **Auth:** any user who can view the idea
- **Response:** `ApiResponse<IdeaResource[]>`, oldest first
- **Errors:** 404 (idea not found/not visible) → `"Idea not found."`

### `POST /api/ideas/:id/resources`
- **Auth:** the idea's submitter, or `company_admin`
- **Request body:** `{ url: string, label?: string }` — `url` must be a valid `http(s)` URL
- **Response:** `ApiResponse<IdeaResource>`
- **Errors:**
  - Idea not found/not visible (404) → `"Idea not found."`
  - Caller isn't the submitter/an admin (403) → `"Only the submitter can attach research links to this idea."`
  - Invalid/missing/oversized `url` (400) → `"A valid http(s) URL is required and must be 2000 characters or fewer."`
  - `label` over 200 characters (400) → `"Label must be 200 characters or fewer."`

### `DELETE /api/ideas/:id/resources/:resourceId`
- **Auth:** whoever added the resource, or `company_admin`
- **Response:** `ApiResponse<null>` — `{ data: null }`
- **Errors:**
  - Idea not found/not visible, or `resourceId` doesn't belong to `:id` (404) → `"Idea not found."` / `"Resource not found."`
  - Caller didn't add it and isn't an admin (403) → `"You do not have permission to remove this resource."`

## Idea documents (`IdeaDocument`)

The full write-up an idea's submitter attaches — `Idea.description` is meant
to stay a short summary; the complete detail lives in the uploaded file.
Uploaded as base64 in a JSON body (no multipart/`multer` dependency); the
server's JSON body limit is raised to 12MB to accommodate it (see `server.ts`).

### `GET /api/ideas/:id/documents`
- **Auth:** any user who can view the idea
- **Response:** `ApiResponse<IdeaDocument[]>` — metadata only (no file bytes), oldest first
- **Errors:** 404 (idea not found/not visible) → `"Idea not found."`

### `POST /api/ideas/:id/documents`
- **Auth:** the idea's submitter, or `company_admin`
- **Request body:** `{ filename: string, mimeType: string, dataBase64: string }`
- **Response:** `ApiResponse<IdeaDocument>`
- **Errors:**
  - Idea not found/not visible (404) → `"Idea not found."`
  - Caller isn't the submitter/an admin (403) → `"Only the submitter can attach documents to this idea."`
  - Missing/oversized filename (400) → `"A filename is required and must be 255 characters or fewer."`
  - `mimeType` not in the allowlist — `application/pdf`, `application/msword`,
    `application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
    `text/plain`, `image/png`, `image/jpeg` (400) →
    `"Unsupported file type. Allowed: PDF, Word, plain text, PNG, JPEG."`
  - Missing `dataBase64` (400) → `"File data is required."`
  - Invalid base64 (400) → `"File data is not valid base64."`
  - Empty or over 8MB decoded (400) → `"File must be between 1 byte and 8MB."`

### `GET /api/ideas/:id/documents/:documentId/download`
- **Auth:** any user who can view the idea
- **Response:** raw file bytes, `Content-Type` set to the stored `mimeType`, `Content-Disposition: attachment`
- **Errors:** 404 (idea or document not found/not visible) → `"Idea not found."` / `"Document not found."`

### `DELETE /api/ideas/:id/documents/:documentId`
- **Auth:** whoever uploaded it, or `company_admin`
- **Response:** `ApiResponse<null>` — `{ data: null }`
- **Errors:** 404 as above; 403 if caller didn't upload it and isn't an admin → `"You do not have permission to remove this document."`

## Signup approval

Company-internal tool: a new signup can't use the app until a `company_admin`
approves it. `User` gained `approvalStatus: 'pending' | 'approved' | 'rejected'`.
A user's row is created (via `syncUser`, on their first authenticated request)
with `approvalStatus: 'pending'`, except an email listed in `ADMIN_EMAILS`
(the existing default-admin allowlist), which is auto-approved on insert.
Existing users at the time this was added were backfilled to `'approved'`.

Every endpoint except `GET /api/me` and the admin-only user-management routes
below returns `403` with `error: "Your account is pending admin approval."`
for a caller whose `approvalStatus` isn't `'approved'` (see
`server/src/middleware/requireApproved.ts`). The frontend calls `GET /api/me`
right after sign-in/sign-up to detect this and shows a "pending approval"
screen instead of the app (`web/src/pages/PendingApproval.tsx`).

### `GET /api/users/pending`
- **Auth:** `company_admin` only
- **Response:** `ApiResponse<User[]>` — every user with `approvalStatus: 'pending'`, oldest signup first

### `PATCH /api/users/:id/approve`
- **Auth:** `company_admin` only
- **Response:** `ApiResponse<User>` — sets `approvalStatus: 'approved'` (also records `approved_by`/`approved_at` in the database, not exposed on `User`)
- **Errors:** 404 (user not found) → `"User not found."`

### `PATCH /api/users/:id/reject`
- **Auth:** `company_admin` only
- **Response:** `ApiResponse<User>` — sets `approvalStatus: 'rejected'` (same errors as approve)

## Not yet implemented

Chat-channel integration (PRD §8.4/§8.5) — no chat platform (Slack/Teams) was
selected, per the open question in
[`idea-board-prompt-plan.md`](../../idea-board-prompt-plan.md).
