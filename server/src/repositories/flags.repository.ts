import type { Flag, FlagContentType, FlagStatus } from '@feedback-board/shared';
import { pool } from '../db/client';
import { softDeleteComment } from './comments.repository';

interface FlagRow {
  id: string;
  content_type: FlagContentType;
  content_id: string;
  flagged_by: string;
  reason: string;
  status: FlagStatus;
  created_at: Date;
}

function toFlag(row: FlagRow): Flag {
  return {
    id: row.id,
    contentType: row.content_type,
    contentId: row.content_id,
    flaggedBy: row.flagged_by,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

export async function createFlag(
  contentType: FlagContentType,
  contentId: string,
  flaggedBy: string,
  reason: string
): Promise<Flag> {
  const { rows } = await pool.query<FlagRow>(
    `INSERT INTO flags (content_type, content_id, flagged_by, reason)
     VALUES ($1, $2, $3, $4)
     RETURNING id, content_type, content_id, flagged_by, reason, status, created_at`,
    [contentType, contentId, flaggedBy, reason]
  );
  return toFlag(rows[0]);
}

// Resolves the team a flag's underlying content belongs to (an idea directly,
// or a comment via its parent idea) so team_lead visibility can be scoped —
// they only see flags on content that lives on their own team.
const FLAG_TEAM_JOIN = `
  LEFT JOIN ideas fi ON f.content_type = 'idea' AND fi.id = f.content_id
  LEFT JOIN comments fc ON f.content_type = 'comment' AND fc.id = f.content_id
  LEFT JOIN ideas fci ON fci.id = fc.idea_id
`;
const FLAG_TEAM_ID = 'COALESCE(fi.team_id, fci.team_id)';

export async function listFlags(viewer: { role: string; teamId: string | null }): Promise<Flag[]> {
  const scoped = viewer.role !== 'company_admin';
  const { rows } = await pool.query<FlagRow>(
    `SELECT f.id, f.content_type, f.content_id, f.flagged_by, f.reason, f.status, f.created_at
     FROM flags f
     ${FLAG_TEAM_JOIN}
     ${scoped ? `WHERE ${FLAG_TEAM_ID} = $1` : ''}
     ORDER BY f.created_at DESC`,
    scoped ? [viewer.teamId] : []
  );
  return rows.map(toFlag);
}

export async function getFlagTeamId(flagId: string): Promise<string | null> {
  const { rows } = await pool.query<{ team_id: string | null }>(
    `SELECT ${FLAG_TEAM_ID} AS team_id
     FROM flags f
     ${FLAG_TEAM_JOIN}
     WHERE f.id = $1`,
    [flagId]
  );
  return rows[0]?.team_id ?? null;
}

// 'removed' only redacts comment content (via the existing soft-delete path);
// an idea's own lifecycle status is the mechanism for handling a flagged idea
// (e.g. declining it), so flagging an idea doesn't have a separate "removed"
// content effect — only the flag itself is marked removed.
export async function updateFlagStatus(flagId: string, status: 'dismissed' | 'removed'): Promise<Flag | null> {
  const { rows } = await pool.query<FlagRow & { content_type: FlagContentType; content_id: string }>(
    `UPDATE flags SET status = $2 WHERE id = $1
     RETURNING id, content_type, content_id, flagged_by, reason, status, created_at`,
    [flagId, status]
  );
  if (!rows[0]) return null;

  if (status === 'removed' && rows[0].content_type === 'comment') {
    await softDeleteComment(rows[0].content_id);
  }

  return toFlag(rows[0]);
}
