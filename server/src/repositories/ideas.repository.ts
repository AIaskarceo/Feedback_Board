import type {
  AdminReveal,
  Idea,
  IdeaSort,
  IdeaStatus,
  IdeaVisibility,
  MergeIdeasResult,
  Role,
  StatusHistoryEntry,
} from '@feedback-board/shared';
import { pool } from '../db/client';

export interface Viewer {
  id: string;
  role: Role;
  teamId: string | null;
  // All teams the viewer belongs to (defaults to just teamId if omitted, for
  // callers that haven't been updated — but every real call site should pass
  // the full set from req.user.teamIds).
  teamIds?: string[];
}

function viewerTeamIds(viewer: Viewer): string[] {
  return viewer.teamIds ?? (viewer.teamId ? [viewer.teamId] : []);
}

interface IdeaRow {
  id: string;
  text: string;
  title: string;
  description: string;
  status: IdeaStatus;
  submitter_id: string;
  submitter_name: string;
  submitter_username: string;
  submitter_has_avatar: boolean;
  vote_count: string;
  vote_count_week: string;
  comment_count: string;
  has_voted: boolean;
  is_own: boolean;
  created_at: Date;
  team_id: string | null;
  visibility: IdeaVisibility;
  is_anonymous: boolean;
  category_id: string | null;
  merged_into_id: string | null;
  archived_at: Date | null;
  is_collaborator: boolean;
}

function toIdea(row: IdeaRow): Idea {
  return {
    id: row.id,
    text: row.text,
    title: row.title,
    description: row.description,
    status: row.status,
    submitterId: row.submitter_id,
    submitterName: row.submitter_name,
    submitterUsername: row.submitter_username,
    submitterHasAvatar: row.submitter_has_avatar,
    voteCount: Number(row.vote_count),
    hasVoted: row.has_voted,
    isOwn: row.is_own,
    createdAt: row.created_at.toISOString(),
    teamId: row.team_id,
    visibility: row.visibility,
    isAnonymous: row.is_anonymous,
    categoryId: row.category_id,
    commentCount: Number(row.comment_count),
    mergedIntoId: row.merged_into_id,
    archivedAt: row.archived_at ? row.archived_at.toISOString() : null,
    isCollaborator: row.is_collaborator,
  };
}

// PRD §6.9: anonymous ideas hide their submitter from everyone except the
// submitter themselves — even company_admin, who must explicitly call
// GET /api/ideas/:id/identity (logged) rather than see it just by browsing.
export function maskAnonymousIdea(idea: Idea): Idea {
  if (!idea.isAnonymous || idea.isOwn) return idea;
  return {
    ...idea,
    submitterId: '',
    submitterName: 'Anonymous',
    submitterUsername: 'Anonymous',
    submitterHasAvatar: false,
  };
}

// A viewer can see an idea if it's company-wide, they submitted it, they're a
// company_admin, they're a collaborator on it, or it's scoped to a team they
// belong to (a user can now belong to several teams).
export function canViewIdea(idea: Idea, viewer: Viewer): boolean {
  return (
    idea.visibility === 'company' ||
    idea.submitterId === viewer.id ||
    viewer.role === 'company_admin' ||
    idea.isCollaborator ||
    (idea.teamId !== null && viewerTeamIds(viewer).includes(idea.teamId))
  );
}

// Whether a viewer can transition/tag/moderate this specific idea: any
// company_admin, or the team_lead of the idea's own team. Collaborators
// contribute (documents/links) but never manage lifecycle — that stays with
// whoever owns the idea's team.
export function canManageIdea(idea: Idea, viewer: Viewer): boolean {
  return (
    viewer.role === 'company_admin' ||
    (viewer.role === 'team_lead' && idea.teamId !== null && viewerTeamIds(viewer).includes(idea.teamId))
  );
}

const IDEA_SELECT = `
  SELECT
    i.id, i.text, i.title, i.description, i.status, i.submitter_id,
    u.name AS submitter_name, u.username AS submitter_username,
    (u.avatar_data IS NOT NULL) AS submitter_has_avatar, i.created_at,
    i.team_id, i.visibility, i.is_anonymous, i.category_id,
    i.merged_into_id, i.archived_at,
    COUNT(DISTINCT v.id) AS vote_count,
    COUNT(DISTINCT v.id) FILTER (WHERE v.created_at >= now() - interval '7 days') AS vote_count_week,
    COUNT(DISTINCT c.id) FILTER (WHERE c.deleted_at IS NULL) AS comment_count,
    EXISTS (SELECT 1 FROM votes v2 WHERE v2.idea_id = i.id AND v2.user_id = $1) AS has_voted,
    COALESCE(i.submitter_id = $1, FALSE) AS is_own,
    EXISTS (SELECT 1 FROM idea_collaborators ic WHERE ic.idea_id = i.id AND ic.user_id = $1) AS is_collaborator
  FROM ideas i
  JOIN users u ON u.id = i.submitter_id
  LEFT JOIN votes v ON v.idea_id = i.id
  LEFT JOIN comments c ON c.idea_id = i.id
`;

export interface IdeaFilters {
  search?: string;
  status?: IdeaStatus;
  categoryId?: string;
  teamId?: string;
  submitterId?: string;
  sort?: IdeaSort;
  // PRD §8.7: archived (stale) ideas are hidden from the default board view
  // once the retention job runs — pass true to see them anyway (e.g. an
  // admin "show archived" toggle).
  includeArchived?: boolean;
}

const SORT_CLAUSES: Record<IdeaSort, string> = {
  newest: 'i.created_at DESC',
  oldest: 'i.created_at ASC',
  votes: 'vote_count DESC, i.created_at ASC',
  votes_week: 'vote_count_week DESC, i.created_at ASC',
  discussed: 'comment_count DESC, i.created_at ASC',
};

// company_admin sees every idea; everyone else sees company-wide ideas,
// their own ideas regardless of scope, ideas they collaborate on, and ideas
// scoped to any team they belong to.
export async function listIdeas(viewer: Viewer, filters: IdeaFilters = {}): Promise<Idea[]> {
  const params: unknown[] = [viewer.id];
  const conditions: string[] = [];

  if (!filters.includeArchived) {
    conditions.push('i.archived_at IS NULL');
  }
  if (viewer.role !== 'company_admin') {
    params.push(viewerTeamIds(viewer));
    conditions.push(
      `(i.visibility = 'company' OR i.submitter_id = $1
        OR (i.team_id IS NOT NULL AND i.team_id = ANY($${params.length}::uuid[]))
        OR EXISTS (SELECT 1 FROM idea_collaborators ic WHERE ic.idea_id = i.id AND ic.user_id = $1))`
    );
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`i.status = $${params.length}`);
  }
  if (filters.categoryId) {
    params.push(filters.categoryId);
    conditions.push(`i.category_id = $${params.length}`);
  }
  if (filters.teamId) {
    params.push(filters.teamId);
    conditions.push(`i.team_id = $${params.length}`);
  }
  if (filters.submitterId) {
    params.push(filters.submitterId);
    conditions.push(`i.submitter_id = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(
      `(i.title ILIKE $${params.length} OR i.description ILIKE $${params.length}
        OR u.name ILIKE $${params.length} OR u.username ILIKE $${params.length})`
    );
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderBy = SORT_CLAUSES[filters.sort ?? 'votes'];

  const { rows } = await pool.query<IdeaRow>(
    `${IDEA_SELECT} ${whereClause} GROUP BY i.id, u.id, u.name, u.username ORDER BY ${orderBy}`,
    params
  );
  return rows.map(toIdea);
}

// Raw fetch, no visibility enforcement — callers that need authorization must
// check canViewIdea/canManageIdea themselves. viewerId only affects
// hasVoted/isOwn; pass null for viewer-independent internal lookups.
export async function getIdeaById(id: string, viewerId: string | null): Promise<Idea | null> {
  const { rows } = await pool.query<IdeaRow>(
    `${IDEA_SELECT} WHERE i.id = $2 GROUP BY i.id, u.id, u.name, u.username`,
    [viewerId, id]
  );
  return rows[0] ? toIdea(rows[0]) : null;
}

export interface DuplicateMatch {
  idea: Idea;
  similarity: number;
}

const DUPLICATE_SIMILARITY_THRESHOLD = 0.3;

// PRD §6.2 step 4: Postgres trigram similarity against the title of ideas
// visible to the viewer, excluding declined ones (a declined idea being
// "similar" isn't useful — it was already rejected, not still open).
export async function findPossibleDuplicates(
  viewer: Viewer,
  title: string,
  limit = 5
): Promise<DuplicateMatch[]> {
  const params: unknown[] = [viewer.id];
  const conditions: string[] = [`i.status <> 'declined'`];

  if (viewer.role !== 'company_admin') {
    params.push(viewerTeamIds(viewer));
    conditions.push(
      `(i.visibility = 'company' OR i.submitter_id = $1 OR (i.team_id IS NOT NULL AND i.team_id = ANY($${params.length}::uuid[])))`
    );
  }

  params.push(title);
  const titleParam = params.length;

  const { rows } = await pool.query<IdeaRow & { similarity_score: number }>(
    `SELECT *, similarity(matches.title, $${titleParam}) AS similarity_score
     FROM (${IDEA_SELECT} WHERE ${conditions.join(' AND ')} GROUP BY i.id, u.id, u.name, u.username) matches
     WHERE similarity(matches.title, $${titleParam}) > ${DUPLICATE_SIMILARITY_THRESHOLD}
     ORDER BY similarity_score DESC
     LIMIT ${limit}`,
    params
  );
  return rows.map((row) => ({ idea: toIdea(row), similarity: Number(row.similarity_score) }));
}

export interface CreateIdeaInput {
  title: string;
  description: string;
  submitterId: string;
  teamId: string | null;
  visibility: IdeaVisibility;
  categoryId: string | null;
  isAnonymous: boolean;
}

export async function createIdea(input: CreateIdeaInput): Promise<Idea> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO ideas (text, title, description, submitter_id, team_id, visibility, category_id, is_anonymous)
     VALUES ($1, $1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      input.title,
      input.description,
      input.submitterId,
      input.teamId,
      input.visibility,
      input.categoryId,
      input.isAnonymous,
    ]
  );
  const ideaId = rows[0].id;

  await pool.query(
    `INSERT INTO idea_status_history (idea_id, changed_by, from_status, to_status, reason)
     VALUES ($1, $2, NULL, 'submitted', NULL)`,
    [ideaId, input.submitterId]
  );

  const idea = await getIdeaById(ideaId, input.submitterId);
  if (!idea) throw new Error('Failed to load newly created idea.');
  return idea;
}

export class SelfVoteError extends Error {}
export class DuplicateVoteError extends Error {}
export class IdeaNotFoundError extends Error {}
export class ForbiddenActionError extends Error {}
export class IllegalTransitionError extends Error {}
export class ReasonRequiredError extends Error {}
export class SelfMergeError extends Error {}
export class AlreadyTerminalError extends Error {}

export async function castVote(ideaId: string, viewer: Viewer): Promise<Idea | null> {
  const idea = await getIdeaById(ideaId, viewer.id);
  if (!idea || !canViewIdea(idea, viewer)) return null;
  if (idea.submitterId === viewer.id) throw new SelfVoteError();

  try {
    await pool.query(`INSERT INTO votes (idea_id, user_id) VALUES ($1, $2)`, [ideaId, viewer.id]);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') throw new DuplicateVoteError();
    throw err;
  }

  return getIdeaById(ideaId, viewer.id);
}

export async function getVoterIds(ideaId: string): Promise<string[]> {
  const { rows } = await pool.query<{ user_id: string }>(`SELECT user_id FROM votes WHERE idea_id = $1`, [
    ideaId,
  ]);
  return rows.map((r) => r.user_id);
}

// Forward-only lifecycle (PRD §6.1): an idea can only move to the next stage
// or straight to 'declined'; 'done' and 'declined' are terminal.
const TRANSITIONS: Record<IdeaStatus, IdeaStatus[]> = {
  submitted: ['under_review', 'planned', 'declined'],
  under_review: ['planned', 'declined'],
  planned: ['in_progress', 'declined'],
  in_progress: ['done', 'declined'],
  done: [],
  declined: [],
};

export async function transitionIdeaStatus(
  ideaId: string,
  viewer: Viewer,
  toStatus: IdeaStatus,
  reason: string | null
): Promise<Idea> {
  const idea = await getIdeaById(ideaId, viewer.id);
  if (!idea || !canViewIdea(idea, viewer)) throw new IdeaNotFoundError();
  if (!canManageIdea(idea, viewer)) throw new ForbiddenActionError();

  if (!TRANSITIONS[idea.status].includes(toStatus)) {
    throw new IllegalTransitionError(`Cannot move an idea from '${idea.status}' to '${toStatus}'.`);
  }
  const trimmedReason = reason?.trim() || null;
  if (toStatus === 'declined' && !trimmedReason) {
    throw new ReasonRequiredError();
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE ideas SET status = $2 WHERE id = $1`, [ideaId, toStatus]);
    await client.query(
      `INSERT INTO idea_status_history (idea_id, changed_by, from_status, to_status, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [ideaId, viewer.id, idea.status, toStatus, toStatus === 'declined' ? trimmedReason : null]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const updated = await getIdeaById(ideaId, viewer.id);
  if (!updated) throw new Error('Idea disappeared during status transition.');
  return updated;
}

interface StatusHistoryRow {
  id: string;
  idea_id: string;
  changed_by: string;
  changed_by_name: string;
  from_status: IdeaStatus | null;
  to_status: IdeaStatus;
  reason: string | null;
  changed_at: Date;
}

function toStatusHistoryEntry(row: StatusHistoryRow): StatusHistoryEntry {
  return {
    id: row.id,
    ideaId: row.idea_id,
    changedBy: row.changed_by,
    changedByName: row.changed_by_name,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    reason: row.reason,
    changedAt: row.changed_at.toISOString(),
  };
}

// Auth: company_admin sees any idea's history; team_lead only their own
// team's ideas (per PRD §6.5 — the audit log is an accountability tool for
// whoever can act on the idea, not the general submitter/voter audience).
export async function getStatusHistory(ideaId: string, viewer: Viewer): Promise<StatusHistoryEntry[]> {
  const idea = await getIdeaById(ideaId, viewer.id);
  if (!idea || !canViewIdea(idea, viewer)) throw new IdeaNotFoundError();
  if (!canManageIdea(idea, viewer)) throw new ForbiddenActionError();

  const { rows } = await pool.query<StatusHistoryRow>(
    `SELECT h.id, h.idea_id, h.changed_by, u.name AS changed_by_name,
            h.from_status, h.to_status, h.reason, h.changed_at
     FROM idea_status_history h
     JOIN users u ON u.id = h.changed_by
     WHERE h.idea_id = $1
     ORDER BY h.changed_at ASC`,
    [ideaId]
  );
  return rows.map(toStatusHistoryEntry);
}

// Company-wide audit log for admins (PRD §6.5 accountability view), across
// every idea rather than one at a time.
export async function listAllStatusHistory(): Promise<StatusHistoryEntry[]> {
  const { rows } = await pool.query<StatusHistoryRow>(
    `SELECT h.id, h.idea_id, h.changed_by, u.name AS changed_by_name,
            h.from_status, h.to_status, h.reason, h.changed_at
     FROM idea_status_history h
     JOIN users u ON u.id = h.changed_by
     ORDER BY h.changed_at DESC
     LIMIT 500`
  );
  return rows.map(toStatusHistoryEntry);
}

// PRD §8.5: merge a duplicate idea (source) into the surviving one (target).
// Votes carry over (a voter who already voted on both keeps a single vote —
// ON CONFLICT DO NOTHING avoids a duplicate-vote unique-constraint error),
// comments carry over unconditionally (no such uniqueness concern), the
// source is transitioned to 'declined' via the normal audited path, and
// merged_into_id + idea_merge_log record the merge itself. Both ideas must
// be manageable by the caller — a team_lead can't merge across teams.
export async function mergeIdeas(sourceId: string, targetId: string, viewer: Viewer): Promise<MergeIdeasResult> {
  if (sourceId === targetId) throw new SelfMergeError();

  const [source, target] = await Promise.all([getIdeaById(sourceId, viewer.id), getIdeaById(targetId, viewer.id)]);
  if (!source || !canViewIdea(source, viewer) || !target || !canViewIdea(target, viewer)) {
    throw new IdeaNotFoundError();
  }
  if (!canManageIdea(source, viewer) || !canManageIdea(target, viewer)) {
    throw new ForbiddenActionError();
  }
  if (source.status === 'done' || source.status === 'declined') {
    throw new AlreadyTerminalError();
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE votes v SET idea_id = $2
       WHERE v.idea_id = $1
         AND NOT EXISTS (SELECT 1 FROM votes v2 WHERE v2.idea_id = $2 AND v2.user_id = v.user_id)`,
      [sourceId, targetId]
    );
    await client.query(`DELETE FROM votes WHERE idea_id = $1`, [sourceId]);
    await client.query(`UPDATE comments SET idea_id = $2 WHERE idea_id = $1`, [sourceId, targetId]);
    await client.query(`UPDATE ideas SET status = 'declined', merged_into_id = $2 WHERE id = $1`, [
      sourceId,
      targetId,
    ]);
    await client.query(
      `INSERT INTO idea_status_history (idea_id, changed_by, from_status, to_status, reason)
       VALUES ($1, $2, $3, 'declined', $4)`,
      [sourceId, viewer.id, source.status, `Merged into duplicate idea "${target.title}".`]
    );
    await client.query(
      `INSERT INTO idea_merge_log (source_idea_id, target_idea_id, merged_by) VALUES ($1, $2, $3)`,
      [sourceId, targetId, viewer.id]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const [updatedSource, updatedTarget] = await Promise.all([
    getIdeaById(sourceId, viewer.id),
    getIdeaById(targetId, viewer.id),
  ]);
  if (!updatedSource || !updatedTarget) throw new Error('Idea disappeared during merge.');
  return { source: updatedSource, target: updatedTarget };
}

// PRD §8.5: bulk re-tag. Silently skips any idea the caller can't manage or
// that doesn't exist, rather than failing the whole batch — the caller can
// diff `ideaIds.length` against the returned array to see what was skipped.
export async function bulkRetagIdeas(ideaIds: string[], categoryId: string | null, viewer: Viewer): Promise<Idea[]> {
  const updated: Idea[] = [];
  for (const id of ideaIds) {
    const idea = await getIdeaById(id, viewer.id);
    if (!idea || !canViewIdea(idea, viewer) || !canManageIdea(idea, viewer)) continue;
    await pool.query(`UPDATE ideas SET category_id = $2 WHERE id = $1`, [id, categoryId]);
    const refreshed = await getIdeaById(id, viewer.id);
    if (refreshed) updated.push(refreshed);
  }
  return updated;
}

export async function logAdminReveal(ideaId: string, adminId: string): Promise<void> {
  await pool.query(`INSERT INTO admin_reveal_log (idea_id, admin_id) VALUES ($1, $2)`, [ideaId, adminId]);
}

interface AdminRevealRow {
  id: string;
  idea_id: string;
  idea_title: string;
  admin_id: string;
  admin_name: string;
  revealed_at: Date;
}

export async function listAdminReveals(): Promise<AdminReveal[]> {
  const { rows } = await pool.query<AdminRevealRow>(
    `SELECT r.id, r.idea_id, i.title AS idea_title, r.admin_id, u.name AS admin_name, r.revealed_at
     FROM admin_reveal_log r
     JOIN ideas i ON i.id = r.idea_id
     JOIN users u ON u.id = r.admin_id
     ORDER BY r.revealed_at DESC
     LIMIT 500`
  );
  return rows.map((row) => ({
    id: row.id,
    ideaId: row.idea_id,
    ideaTitle: row.idea_title,
    adminId: row.admin_id,
    adminName: row.admin_name,
    revealedAt: row.revealed_at.toISOString(),
  }));
}
