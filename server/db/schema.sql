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
-- status. Existing 'open' ideas are migrated to 'submitted'; 'done' is
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
-- column to exist. A user with a team_id and role 'team_lead' leads that team;
-- if a future requirement needs one person leading/belonging to multiple
-- teams, this becomes a join table then — not worth the complexity now.
ALTER TABLE users ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);

-- PRD §6.9: anonymous submissions. submitter_id is always populated
-- internally (for notifications/admin reveal); is_anonymous only controls
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
