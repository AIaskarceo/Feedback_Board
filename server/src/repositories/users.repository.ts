import type { ApprovalStatus, DirectoryUser, NotificationPreference, Role, User } from '@feedback-board/shared';
import { pool } from '../db/client';

interface UserRow {
  id: string;
  clerk_id: string;
  username: string;
  email: string;
  name: string;
  role: Role;
  team_id: string | null;
  team_ids: string[];
  notification_preference: NotificationPreference;
  is_restricted: boolean;
  approval_status: ApprovalStatus;
  has_avatar: boolean;
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

// team_ids is aggregated from the user_teams membership table (correlated
// subquery so it works in both SELECT and INSERT/UPDATE ... RETURNING).
const USER_COLUMNS =
  `id, clerk_id, username, email, name, role, team_id, notification_preference, is_restricted, ` +
  `approval_status, (avatar_data IS NOT NULL) AS has_avatar, ` +
  `COALESCE((SELECT array_agg(ut.team_id::text) FROM user_teams ut WHERE ut.user_id = users.id), ARRAY[]::text[]) AS team_ids`;

export async function getUserById(id: string): Promise<User | null> {
  const { rows } = await pool.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] ? toUser(rows[0]) : null;
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const { rows } = await pool.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE username = $1`, [
    username,
  ]);
  return rows[0] ? toUser(rows[0]) : null;
}

export async function listUsers(): Promise<User[]> {
  const { rows } = await pool.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users ORDER BY name ASC`);
  return rows.map(toUser);
}

export async function updateUserRole(id: string, role: Role): Promise<User | null> {
  const { rows } = await pool.query<UserRow>(
    `UPDATE users SET role = $2 WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [id, role]
  );
  return rows[0] ? toUser(rows[0]) : null;
}

// Sets the user's primary team. Also ensures a matching membership row exists
// so the primary team is always part of the user's team set.
export async function updateUserTeam(id: string, teamId: string | null): Promise<User | null> {
  const { rows } = await pool.query<UserRow>(
    `UPDATE users SET team_id = $2 WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [id, teamId]
  );
  if (!rows[0]) return null;
  if (teamId) {
    await pool.query(`INSERT INTO user_teams (user_id, team_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      id,
      teamId,
    ]);
  }
  return getUserById(id);
}

export async function addUserTeam(id: string, teamId: string): Promise<User | null> {
  const { rowCount } = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [id]);
  if (!rowCount) return null;
  await pool.query(`INSERT INTO user_teams (user_id, team_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, teamId]);
  return getUserById(id);
}

// Removes a membership; if it was the user's primary team, clears the primary.
export async function removeUserTeam(id: string, teamId: string): Promise<User | null> {
  const { rowCount } = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [id]);
  if (!rowCount) return null;
  await pool.query(`DELETE FROM user_teams WHERE user_id = $1 AND team_id = $2`, [id, teamId]);
  await pool.query(`UPDATE users SET team_id = NULL WHERE id = $1 AND team_id = $2`, [id, teamId]);
  return getUserById(id);
}

// Lightweight list for the member picker — any authenticated user may read it.
export async function listDirectory(): Promise<DirectoryUser[]> {
  const { rows } = await pool.query<{ id: string; name: string; username: string; has_avatar: boolean }>(
    `SELECT id, name, username, (avatar_data IS NOT NULL) AS has_avatar FROM users ORDER BY name ASC`
  );
  return rows.map((r) => ({ id: r.id, name: r.name, username: r.username, hasAvatar: r.has_avatar }));
}

export async function updateNotificationPreference(
  id: string,
  preference: NotificationPreference
): Promise<User | null> {
  const { rows } = await pool.query<UserRow>(
    `UPDATE users SET notification_preference = $2 WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [id, preference]
  );
  return rows[0] ? toUser(rows[0]) : null;
}

export async function updateUserRestricted(id: string, isRestricted: boolean): Promise<User | null> {
  const { rows } = await pool.query<UserRow>(
    `UPDATE users SET is_restricted = $2 WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [id, isRestricted]
  );
  return rows[0] ? toUser(rows[0]) : null;
}

// Signup approval queue — every user still awaiting a company_admin decision.
export async function listPendingUsers(): Promise<User[]> {
  const { rows } = await pool.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE approval_status = 'pending' ORDER BY created_at ASC`
  );
  return rows.map(toUser);
}

export async function updateUserApproval(
  id: string,
  approvalStatus: Exclude<ApprovalStatus, 'pending'>,
  approvedBy: string
): Promise<User | null> {
  const { rows } = await pool.query<UserRow>(
    `UPDATE users SET approval_status = $2, approved_by = $3, approved_at = now()
     WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [id, approvalStatus, approvedBy]
  );
  return rows[0] ? toUser(rows[0]) : null;
}

export async function setUserAvatar(id: string, mimeType: string, data: Buffer): Promise<User | null> {
  const { rows } = await pool.query<UserRow>(
    `UPDATE users SET avatar_data = $2, avatar_mime_type = $3 WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [id, data, mimeType]
  );
  return rows[0] ? toUser(rows[0]) : null;
}

export async function clearUserAvatar(id: string): Promise<User | null> {
  const { rows } = await pool.query<UserRow>(
    `UPDATE users SET avatar_data = NULL, avatar_mime_type = NULL WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [id]
  );
  return rows[0] ? toUser(rows[0]) : null;
}

export async function getUserAvatar(id: string): Promise<{ mimeType: string; data: Buffer } | null> {
  const { rows } = await pool.query<{ avatar_mime_type: string | null; avatar_data: Buffer | null }>(
    `SELECT avatar_mime_type, avatar_data FROM users WHERE id = $1`,
    [id]
  );
  if (!rows[0]?.avatar_data || !rows[0].avatar_mime_type) return null;
  return { mimeType: rows[0].avatar_mime_type, data: rows[0].avatar_data };
}

// All users with a given notification preference, for the weekly digest job.
export async function listUsersByNotificationPreference(preference: NotificationPreference): Promise<User[]> {
  const { rows } = await pool.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE notification_preference = $1`,
    [preference]
  );
  return rows.map(toUser);
}
