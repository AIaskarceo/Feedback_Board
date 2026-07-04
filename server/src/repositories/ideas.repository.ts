import type { Idea } from '@feedback-board/shared';
import { pool } from '../db/pool';

interface IdeaRow {
  id: string;
  text: string;
  status: 'open' | 'done';
  submitter_id: string;
  submitter_name: string;
  vote_count: string;
  has_voted: boolean;
  is_own: boolean;
  created_at: Date;
}

function toIdea(row: IdeaRow): Idea {
  return {
    id: row.id,
    text: row.text,
    status: row.status,
    submitterId: row.submitter_id,
    submitterName: row.submitter_name,
    voteCount: Number(row.vote_count),
    hasVoted: row.has_voted,
    isOwn: row.is_own,
    createdAt: row.created_at.toISOString(),
  };
}

const IDEA_SELECT = `
  SELECT i.id, i.text, i.status, i.submitter_id, u.name AS submitter_name, i.created_at,
         COUNT(v.id) AS vote_count,
         EXISTS (SELECT 1 FROM votes v2 WHERE v2.idea_id = i.id AND v2.user_id = $1) AS has_voted,
         COALESCE(i.submitter_id = $1, FALSE) AS is_own
  FROM ideas i
  JOIN users u ON u.id = i.submitter_id
  LEFT JOIN votes v ON v.idea_id = i.id
`;

export async function listIdeas(userId: string | null): Promise<Idea[]> {
  const { rows } = await pool.query<IdeaRow>(
    `${IDEA_SELECT} GROUP BY i.id, u.name ORDER BY vote_count DESC, i.created_at ASC`,
    [userId]
  );
  return rows.map(toIdea);
}

export async function getIdeaById(id: string, userId: string | null): Promise<Idea | null> {
  const { rows } = await pool.query<IdeaRow>(
    `${IDEA_SELECT} WHERE i.id = $2 GROUP BY i.id, u.name`,
    [userId, id]
  );
  return rows[0] ? toIdea(rows[0]) : null;
}

export async function createIdea(text: string, submitterId: string): Promise<Idea> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO ideas (text, submitter_id) VALUES ($1, $2) RETURNING id`,
    [text, submitterId]
  );
  const idea = await getIdeaById(rows[0].id, submitterId);
  if (!idea) throw new Error('Failed to load newly created idea.');
  return idea;
}

export class SelfVoteError extends Error {}
export class DuplicateVoteError extends Error {}

export async function castVote(ideaId: string, userId: string): Promise<Idea | null> {
  const idea = await getIdeaById(ideaId, userId);
  if (!idea) return null;
  if (idea.submitterId === userId) throw new SelfVoteError();

  try {
    await pool.query(`INSERT INTO votes (idea_id, user_id) VALUES ($1, $2)`, [ideaId, userId]);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') throw new DuplicateVoteError();
    throw err;
  }

  return getIdeaById(ideaId, userId);
}

export interface MarkDoneResult {
  idea: Idea;
  wasAlreadyDone: boolean;
}

export async function markIdeaDone(id: string): Promise<MarkDoneResult | null> {
  const before = await getIdeaById(id, null);
  if (!before) return null;
  if (before.status === 'done') return { idea: before, wasAlreadyDone: true };

  await pool.query(`UPDATE ideas SET status = 'done' WHERE id = $1`, [id]);
  const after = await getIdeaById(id, null);
  if (!after) throw new Error('Idea disappeared during done transition.');
  return { idea: after, wasAlreadyDone: false };
}
