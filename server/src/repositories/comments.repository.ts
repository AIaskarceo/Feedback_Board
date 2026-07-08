import type { Comment } from '@feedback-board/shared';
import { pool } from '../db/client';

interface CommentRow {
  id: string;
  idea_id: string;
  author_id: string;
  author_name: string;
  parent_comment_id: string | null;
  body: string;
  created_at: Date;
  deleted_at: Date | null;
}

const COMMENT_SELECT = `
  SELECT c.id, c.idea_id, c.author_id, u.name AS author_name, c.parent_comment_id,
         c.body, c.created_at, c.deleted_at
  FROM comments c
  JOIN users u ON u.id = c.author_id
`;

function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    ideaId: row.idea_id,
    authorId: row.author_id,
    authorName: row.author_name,
    parentCommentId: row.parent_comment_id,
    body: row.deleted_at ? '[comment removed]' : row.body,
    createdAt: row.created_at.toISOString(),
    deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
  };
}

export async function listComments(ideaId: string): Promise<Comment[]> {
  const { rows } = await pool.query<CommentRow>(
    `${COMMENT_SELECT} WHERE c.idea_id = $1 ORDER BY c.created_at ASC`,
    [ideaId]
  );
  return rows.map(toComment);
}

export class ParentCommentNotFoundError extends Error {}

export async function createComment(
  ideaId: string,
  authorId: string,
  body: string,
  parentCommentId: string | null
): Promise<Comment> {
  if (parentCommentId) {
    const { rows } = await pool.query(`SELECT 1 FROM comments WHERE id = $1 AND idea_id = $2`, [
      parentCommentId,
      ideaId,
    ]);
    if (rows.length === 0) throw new ParentCommentNotFoundError();
  }

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO comments (idea_id, author_id, parent_comment_id, body)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [ideaId, authorId, parentCommentId, body]
  );

  const { rows: commentRows } = await pool.query<CommentRow>(`${COMMENT_SELECT} WHERE c.id = $1`, [
    rows[0].id,
  ]);
  return toComment(commentRows[0]);
}

// Prior distinct commenters on an idea, for fanning out "someone commented
// on a thread you're in" notifications. Excludes soft-deleted comments'
// content but not their authorship — someone who commented and had it
// removed is still "in the thread".
export async function getDistinctCommentAuthorIds(ideaId: string): Promise<string[]> {
  const { rows } = await pool.query<{ author_id: string }>(
    `SELECT DISTINCT author_id FROM comments WHERE idea_id = $1`,
    [ideaId]
  );
  return rows.map((r) => r.author_id);
}

export async function getCommentIdeaId(commentId: string): Promise<string | null> {
  const { rows } = await pool.query<{ idea_id: string }>(`SELECT idea_id FROM comments WHERE id = $1`, [
    commentId,
  ]);
  return rows[0]?.idea_id ?? null;
}

export async function softDeleteComment(id: string): Promise<Comment | null> {
  const { rows } = await pool.query<{ id: string }>(
    `UPDATE comments SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
    [id]
  );
  if (!rows[0]) return null;

  const { rows: commentRows } = await pool.query<CommentRow>(`${COMMENT_SELECT} WHERE c.id = $1`, [id]);
  return toComment(commentRows[0]);
}
