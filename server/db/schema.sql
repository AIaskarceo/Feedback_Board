-- FROZEN SCHEMA — do not edit after Phase 0 merge without sign-off from Dev A, Dev B, and Dev C.
-- Phase 0 (Idea Board PRD v1.0) additions are appended below the original
-- tables rather than rewriting them in place, so re-running this file against
-- an existing database stays additive and idempotent via the migration runner
-- in server/src/db/client.ts (which executes every statement and swallows
-- "already exists" errors).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id   TEXT NOT NULL UNIQUE,
  email      TEXT NOT NULL,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ideas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  submitter_id UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE votes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id    UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idea_id, user_id)
);

CREATE INDEX idx_ideas_submitter_id ON ideas(submitter_id);
CREATE INDEX idx_votes_idea_id ON votes(idea_id);
CREATE INDEX idx_votes_user_id ON votes(user_id);

-- ============================================================================
-- Phase 0 — Idea Board PRD v1.0 (schema/contract alignment only)
-- ============================================================================

-- PRD §7: three-tier role model (member / team_lead / company_admin),
-- replacing the original member/admin split. Existing 'admin' rows are
-- migrated to 'company_admin' so no user silently loses admin access.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
UPDATE users SET role = 'company_admin' WHERE role = 'admin';
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('member', 'team_lead', 'company_admin'));

-- PRD §6.1: six-stage idea lifecycle, replacing the original open/done
-- status. Existing 'open' ideas are migrated to 'submitted', 'done' is
-- unchanged and still valid under the new enum.
ALTER TABLE ideas DROP CONSTRAINT IF EXISTS ideas_status_check;
UPDATE ideas SET status = 'submitted' WHERE status = 'open';
ALTER TABLE ideas ALTER COLUMN status SET DEFAULT 'submitted';
ALTER TABLE ideas ADD CONSTRAINT ideas_status_check
  CHECK (status IN ('submitted', 'under_review', 'planned', 'in_progress', 'done', 'declined'));

-- PRD §5 / §8.2: org structure. Ideas can be scoped to a team or company-wide.
CREATE TABLE teams (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ideas ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'company'
  CHECK (visibility IN ('team', 'company'));

-- Single-team-per-user membership (nullable = not yet assigned to a team).
-- Resolves the Phase 0 gap flagged in api-contract.md: Phase 1's
-- team-visibility enforcement and user-to-team assignment endpoint need this
-- column to exist. A user with a team_id and role 'team_lead' leads that team —
-- if a future requirement needs one person leading/belonging to multiple
-- teams, this becomes a join table then — not worth the complexity now.
ALTER TABLE users ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);

-- PRD §6.9: anonymous submissions. submitter_id is always populated
-- internally (for notifications/admin reveal) — is_anonymous only controls
-- display.
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT false;

-- PRD §6.2 / §8.1: category/tag support, plus splitting the original single
-- `text` field into `title` + `description` since the submission form needs
-- both separately and Phase 2 duplicate detection compares them independently.
-- `text` is kept (deprecated, backfilled into `title`) rather than dropped —
-- dropping a frozen-contract column is a destructive change that should wait
-- until Phase 1 route/repository work has migrated off it.
CREATE TABLE categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ideas ADD COLUMN IF NOT EXISTS title TEXT;
UPDATE ideas SET title = text WHERE title IS NULL;
ALTER TABLE ideas ALTER COLUMN title SET NOT NULL;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id);

-- PRD §6.7: threaded comments.
CREATE TABLE comments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id           UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  author_id         UUID NOT NULL REFERENCES users(id),
  parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  body              TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

-- PRD §6.5: status-change audit log, also the source for time-to-resolution
-- analytics in Phase 2. from_status is nullable to record the initial
-- "created as submitted" event.
CREATE TABLE idea_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id     UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  changed_by  UUID NOT NULL REFERENCES users(id),
  from_status TEXT,
  to_status   TEXT NOT NULL,
  reason      TEXT,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PRD §6.10: flagging/moderation queue for ideas and comments.
CREATE TABLE flags (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL CHECK (content_type IN ('idea', 'comment')),
  content_id   UUID NOT NULL,
  flagged_by   UUID NOT NULL REFERENCES users(id),
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'removed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ideas_team_id ON ideas(team_id);
CREATE INDEX idx_users_team_id ON users(team_id);
CREATE INDEX idx_ideas_category_id ON ideas(category_id);
CREATE INDEX idx_comments_idea_id ON comments(idea_id);
CREATE INDEX idx_comments_parent_comment_id ON comments(parent_comment_id);
CREATE INDEX idx_idea_status_history_idea_id ON idea_status_history(idea_id);
CREATE INDEX idx_flags_content ON flags(content_type, content_id);

-- ============================================================================
-- Phase 1.5 — private idea messaging
-- ============================================================================

-- A private 1:1 thread per idea between the submitter and whoever can manage
-- that idea (its team_lead, or any company_admin) — separate from the public
-- `comments` thread. No recipient_id: it's a two-sided thread (submitter vs.
-- staff), not per-message routing, so any manager's reply is visible to the
-- submitter and vice versa.
CREATE TABLE idea_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id    UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES users(id),
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_idea_messages_idea_id ON idea_messages(idea_id);

-- ============================================================================
-- Phase 1.6 — username-based custom auth UI, "my ideas" + username search
-- ============================================================================

-- Custom sign-in/sign-up UI (built on Clerk's headless hooks, not the Clerk
-- widget) collects a username instead of relying on email as the visible
-- identifier. Backfill existing rows from their email's local part so the
-- column can be NOT NULL + UNIQUE immediately — the `substr(id...)` suffix
-- guarantees uniqueness even if two emails share a local part.
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
UPDATE users
SET username = lower(split_part(email, '@', 1)) || '_' || substr(id::text, 1, 8)
WHERE username IS NULL;
ALTER TABLE users ALTER COLUMN username SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- ============================================================================
-- Phase 1.7 — username simplified to just mirror the display name
-- ============================================================================

-- Collecting a separate username at sign-up (and requiring "Username" to be
-- enabled as a Clerk identifier) turned out to be more than was wanted —
-- "username" is now just the person's full name, so search/display use one
-- field. Deliberately not unique (people can share a name) — no constraint
-- is added here. Existing rows are corrected from their old email-derived
-- fallback to the real name.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
UPDATE users SET username = name WHERE username <> name;

-- ============================================================================
-- Phase 2 — duplicate detection, anonymity, analytics, moderation, notifications
-- ============================================================================

-- PRD §6.2 step 4: duplicate-idea detection via Postgres trigram similarity
-- (no extra infra — pg_trgm ships with Postgres). Used in ideas.repository.ts's
-- findPossibleDuplicates with similarity(...) against title/description.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_ideas_title_trgm ON ideas USING gin (title gin_trgm_ops);

-- PRD §6.9: every time a company_admin explicitly reveals an anonymous
-- idea's true submitter (via GET /api/ideas/:id/identity), it's logged here.
-- Not populated by ordinary list/detail views, which stay masked even for
-- admins — revealing is a deliberate, auditable action, not a side effect of
-- browsing.
CREATE TABLE admin_reveal_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id     UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  admin_id    UUID NOT NULL REFERENCES users(id),
  revealed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_reveal_log_idea_id ON admin_reveal_log(idea_id);

-- PRD §6.8: in-app notification center. `type` distinguishes the three
-- triggers (status change on your idea, comment on a thread you're in,
-- status change on an idea you voted for) — idea_id is always set since
-- every notification trigger in this app is idea-scoped.
CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idea_id    UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('status_change', 'comment', 'voted_status_change')),
  message    TEXT NOT NULL,
  is_read    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_id ON notifications(user_id, created_at DESC);

-- PRD §8.4: per-user notification preference. 'immediate' = in-app only in
-- this implementation (no per-event email), 'digest' = included in the
-- weekly digest email (server/src/services/digest.ts), 'off' = neither.
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_preference TEXT NOT NULL DEFAULT 'immediate'
  CHECK (notification_preference IN ('immediate', 'digest', 'off'));

-- PRD §6.10 / §8.5: "restrict a user's posting ability" after repeated abuse.
-- Enforced in POST /api/ideas and POST /api/ideas/:id/comments.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_restricted BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- Phase 3 — bulk moderation, export/retention, rate limiting
-- ============================================================================

-- PRD §8.5: merging a duplicate idea into another. The duplicate (source) is
-- declined (via the normal status-transition path, so it's still audited in
-- idea_status_history) and merged_into_id records where its votes/comments
-- went, distinguishing a merge-decline from an ordinary decline.
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES ideas(id);

CREATE TABLE IF NOT EXISTS idea_merge_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_idea_id  UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  target_idea_id  UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  merged_by       UUID NOT NULL REFERENCES users(id),
  merged_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_idea_merge_log_source ON idea_merge_log(source_idea_id);

-- PRD §8.7: retention policy for stale done/declined ideas — archived (not
-- deleted) after N months of inactivity. N is a single admin-configurable
-- value, so a one-row settings table is simpler than a generic key/value
-- store at this scale, and there's only ever one tenant.
CREATE TABLE IF NOT EXISTS app_settings (
  id                INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retention_months  INTEGER NOT NULL DEFAULT 6 CHECK (retention_months > 0)
);
INSERT INTO app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE ideas ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- PRD §8.7: every CSV/JSON export is logged for audit, mirroring
-- admin_reveal_log's treatment of another admin-only, privacy-sensitive
-- bulk-read action.
CREATE TABLE IF NOT EXISTS export_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID NOT NULL REFERENCES users(id),
  format      TEXT NOT NULL CHECK (format IN ('csv', 'json')),
  idea_count  INTEGER NOT NULL,
  exported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_export_log_exported_at ON export_log(exported_at DESC);

-- ============================================================================
-- Phase 3.1 — idea research links (supporting docs/links an idea's submitter
-- attaches, shown in the idea detail view)
-- ============================================================================

CREATE TABLE IF NOT EXISTS idea_resources (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id    UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  added_by   UUID NOT NULL REFERENCES users(id),
  url        TEXT NOT NULL,
  label      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_idea_resources_idea_id ON idea_resources(idea_id);

-- ============================================================================
-- Phase 3.2 — idea documents (the full write-up an idea's submitter attaches;
-- the idea's own `description` is meant to stay a short summary)
-- ============================================================================

CREATE TABLE IF NOT EXISTS idea_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id     UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  filename    TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  file_data   BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_idea_documents_idea_id ON idea_documents(idea_id);

-- ============================================================================
-- Phase 3.3 — optional user profile photo (stored inline, like idea_documents;
-- served via GET /api/me/avatar)
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data BYTEA;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_mime_type TEXT;

-- ============================================================================
-- Phase 3.4 — multi-team membership + idea collaborators
-- ============================================================================

-- A user can now belong to several teams. users.team_id is kept as the
-- "primary" team, used for team_lead role scoping and analytics.
-- user_teams is the full membership set that governs team-only idea
-- visibility and which teams a user may post a team-only idea into.
-- Existing single-team assignments are backfilled so nobody loses access.
CREATE TABLE IF NOT EXISTS user_teams (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_user_teams_user_id ON user_teams(user_id);
CREATE INDEX IF NOT EXISTS idx_user_teams_team_id ON user_teams(team_id);

INSERT INTO user_teams (user_id, team_id)
SELECT id, team_id FROM users WHERE team_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Collaborators an idea's submitter adds to build the idea together. They can
-- view the idea (even a team-only one they're not otherwise in) and contribute
-- documents/links, but the submitter alone remains its owner for lifecycle.
CREATE TABLE IF NOT EXISTS idea_collaborators (
  idea_id    UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by   UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (idea_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_idea_collaborators_idea_id ON idea_collaborators(idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_collaborators_user_id ON idea_collaborators(user_id);

-- ============================================================================
-- Phase 3.5 — signup approval (company-internal tool: new signups must be
-- approved by a company_admin before they can use the app)
-- ============================================================================

-- Existing rows are backfilled to 'approved' so nobody already using the app
-- gets locked out retroactively — the column is added nullable, backfilled,
-- then locked down to NOT NULL DEFAULT 'pending', mirroring the username
-- backfill in Phase 1.6, so re-running this migration on every boot (per
-- server/src/db/client.ts) stays idempotent: once no row is NULL, the
-- backfill UPDATE is a no-op on subsequent runs and never re-flips a
-- genuinely pending signup back to 'approved'. New rows get 'pending' from
-- the column default via syncUser (company_admin emails in ADMIN_EMAILS are
-- auto-approved on first login, same as they're auto-promoted to
-- company_admin — see syncUser.ts).
ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status TEXT
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));
UPDATE users SET approval_status = 'approved' WHERE approval_status IS NULL;
ALTER TABLE users ALTER COLUMN approval_status SET DEFAULT 'pending';
ALTER TABLE users ALTER COLUMN approval_status SET NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_approval_status ON users(approval_status);
