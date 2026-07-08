import type { IdeaMember } from '@feedback-board/shared';
import { pool } from '../db/client';

interface IdeaMemberRow {
  user_id: string;
  name: string;
  username: string;
  has_avatar: boolean;
  added_by: string;
  created_at: Date;
}

function toIdeaMember(row: IdeaMemberRow): IdeaMember {
  return {
    userId: row.user_id,
    name: row.name,
    username: row.username,
    hasAvatar: row.has_avatar,
    addedBy: row.added_by,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listCollaborators(ideaId: string): Promise<IdeaMember[]> {
  const { rows } = await pool.query<IdeaMemberRow>(
    `SELECT ic.user_id, u.name, u.username, (u.avatar_data IS NOT NULL) AS has_avatar, ic.added_by, ic.created_at
     FROM idea_collaborators ic
     JOIN users u ON u.id = ic.user_id
     WHERE ic.idea_id = $1
     ORDER BY ic.created_at ASC`,
    [ideaId]
  );
  return rows.map(toIdeaMember);
}

export class AlreadyCollaboratorError extends Error {}
export class UserNotFoundError extends Error {}

export async function addCollaborator(ideaId: string, userId: string, addedBy: string): Promise<IdeaMember> {
  const { rowCount } = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [userId]);
  if (!rowCount) throw new UserNotFoundError();

  try {
    await pool.query(`INSERT INTO idea_collaborators (idea_id, user_id, added_by) VALUES ($1, $2, $3)`, [
      ideaId,
      userId,
      addedBy,
    ]);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') throw new AlreadyCollaboratorError();
    throw err;
  }

  const { rows } = await pool.query<IdeaMemberRow>(
    `SELECT ic.user_id, u.name, u.username, (u.avatar_data IS NOT NULL) AS has_avatar, ic.added_by, ic.created_at
     FROM idea_collaborators ic
     JOIN users u ON u.id = ic.user_id
     WHERE ic.idea_id = $1 AND ic.user_id = $2`,
    [ideaId, userId]
  );
  return toIdeaMember(rows[0]);
}

export async function removeCollaborator(ideaId: string, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM idea_collaborators WHERE idea_id = $1 AND user_id = $2`, [
    ideaId,
    userId,
  ]);
  return (rowCount ?? 0) > 0;
}
