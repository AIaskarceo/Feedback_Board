import type { ApprovalStatus, NotificationPreference, User } from '@feedback-board/shared';
import { query } from './client';

interface ClerkIdentity {
  clerkId: string;
  email: string;
  name: string;
}

interface UserRow {
  id: string;
  clerk_id: string;
  username: string;
  email: string;
  name: string;
  role: 'member' | 'team_lead' | 'company_admin';
  team_id: string | null;
  notification_preference: NotificationPreference;
  is_restricted: boolean;
  approval_status: ApprovalStatus;
  has_avatar: boolean;
  team_ids: string[];
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    clerkId: row.clerk_id,
    username: row.username,
    email: row.email,
    name: row.name,
    role: row.role,
    teamId: row.team_id,
    teamIds: row.team_ids ?? [],
    notificationPreference: row.notification_preference,
    isRestricted: row.is_restricted,
    approvalStatus: row.approval_status,
    hasAvatar: row.has_avatar,
  };
}

const DEFAULT_ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

// Upserts by clerk_id. Role is set once on first insert — 'company_admin' if
// the email is in ADMIN_EMAILS (a config-driven default-admin allowlist),
// otherwise the column default 'member' — and is never overwritten by
// subsequent syncs, so promoting/demoting a user afterward (done directly in
// the database, or via PATCH /api/users/:id/role) survives future logins.
//
// approval_status follows the same on-first-insert-only pattern: a
// default-admin (ADMIN_EMAILS) is auto-approved since they're already
// trusted, everyone else starts 'pending' (the column default) and needs a
// company_admin to approve them via PATCH /api/users/:id/approve before
// requireApproved lets them use the app. Never overwritten on later syncs, so
// an admin's approve/reject decision survives future logins.
//
// `username` is just a mirror of `name` (not a separate identifier collected
// at sign-up — no Clerk "Username" identifier is required), so it's kept in
// sync on every login the same way email/name are.
//
// No Clerk Organizations integration exists in this project, so team
// membership is not derived from Clerk metadata — it's assigned manually via
// PATCH /api/users/:id/team (company_admin only) and left untouched here.
export async function syncUser({ clerkId, email, name }: ClerkIdentity): Promise<User> {
  const isDefaultAdmin = DEFAULT_ADMIN_EMAILS.has(email.toLowerCase());
  const role = isDefaultAdmin ? 'company_admin' : 'member';
  const approvalStatus = isDefaultAdmin ? 'approved' : 'pending';

  const result = await query<UserRow>(
    `INSERT INTO users (clerk_id, email, name, role, username, approval_status)
     VALUES ($1, $2, $3, $4, $3, $5)
     ON CONFLICT (clerk_id)
     DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, username = EXCLUDED.name
     RETURNING id, clerk_id, username, email, name, role, team_id, notification_preference, is_restricted,
               approval_status, (avatar_data IS NOT NULL) AS has_avatar,
               COALESCE((SELECT array_agg(ut.team_id::text) FROM user_teams ut WHERE ut.user_id = users.id), ARRAY[]::text[]) AS team_ids`,
    [clerkId, email, name, role, approvalStatus]
  );

  return toUser(result.rows[0]);
}
