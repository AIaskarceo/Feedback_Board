import type { Analytics, IdeaStatus } from '@feedback-board/shared';
import { pool } from '../db/client';
import type { Viewer } from './ideas.repository';

// company_admin sees company-wide figures; team_lead sees only ideas scoped
// to their own team (i.e. ideas.team_id = their team — not company-wide
// ideas their teammates happened to submit).
export async function getAnalytics(viewer: Viewer): Promise<Analytics> {
  const scoped = viewer.role !== 'company_admin';
  const teamFilter = scoped ? 'AND i.team_id = $1' : '';
  const params = scoped ? [viewer.teamId] : [];

  const [submissionsOverTime, ideasByStatus, participationByTeam, resolution, topContributor, mostImpactful] =
    await Promise.all([
      pool.query<{ date: string; count: string }>(
        `SELECT to_char(date_trunc('day', i.created_at), 'YYYY-MM-DD') AS date, COUNT(*) AS count
         FROM ideas i
         WHERE i.created_at >= now() - interval '30 days' ${teamFilter}
         GROUP BY 1 ORDER BY 1`,
        params
      ),
      pool.query<{ status: IdeaStatus; count: string }>(
        `SELECT i.status, COUNT(*) AS count
         FROM ideas i
         WHERE true ${teamFilter}
         GROUP BY i.status`,
        params
      ),
      pool.query<{ team_id: string; team_name: string; submission_count: string }>(
        scoped
          ? `SELECT t.id AS team_id, t.name AS team_name, COUNT(i.id) AS submission_count
             FROM teams t
             LEFT JOIN ideas i ON i.team_id = t.id
             WHERE t.id = $1
             GROUP BY t.id, t.name`
          : `SELECT t.id AS team_id, t.name AS team_name, COUNT(i.id) AS submission_count
             FROM teams t
             LEFT JOIN ideas i ON i.team_id = t.id
             GROUP BY t.id, t.name
             ORDER BY submission_count DESC`,
        params
      ),
      pool.query<{ avg_hours: string | null }>(
        `SELECT AVG(EXTRACT(EPOCH FROM (h.changed_at - i.created_at)) / 3600) AS avg_hours
         FROM idea_status_history h
         JOIN ideas i ON i.id = h.idea_id
         WHERE h.to_status IN ('done', 'declined') ${teamFilter}`,
        params
      ),
      pool.query<{ user_id: string; name: string; idea_count: string }>(
        `SELECT u.id AS user_id, u.name, COUNT(i.id) AS idea_count
         FROM users u
         JOIN ideas i ON i.submitter_id = u.id
         WHERE true ${teamFilter}
         GROUP BY u.id, u.name
         ORDER BY idea_count DESC
         LIMIT 1`,
        params
      ),
      pool.query<{ idea_id: string; title: string; vote_count: string }>(
        `SELECT i.id AS idea_id, i.title, COUNT(v.id) AS vote_count
         FROM ideas i
         LEFT JOIN votes v ON v.idea_id = i.id
         WHERE i.status = 'done' ${teamFilter}
         GROUP BY i.id, i.title
         ORDER BY vote_count DESC
         LIMIT 1`,
        params
      ),
    ]);

  return {
    submissionsOverTime: submissionsOverTime.rows.map((r) => ({ date: r.date, count: Number(r.count) })),
    ideasByStatus: ideasByStatus.rows.map((r) => ({ status: r.status, count: Number(r.count) })),
    participationByTeam: participationByTeam.rows.map((r) => ({
      teamId: r.team_id,
      teamName: r.team_name,
      submissionCount: Number(r.submission_count),
    })),
    avgTimeToResolutionHours: resolution.rows[0]?.avg_hours != null ? Number(resolution.rows[0].avg_hours) : null,
    topContributor: topContributor.rows[0]
      ? {
          userId: topContributor.rows[0].user_id,
          name: topContributor.rows[0].name,
          ideaCount: Number(topContributor.rows[0].idea_count),
        }
      : null,
    mostImpactfulIdea: mostImpactful.rows[0]
      ? {
          ideaId: mostImpactful.rows[0].idea_id,
          title: mostImpactful.rows[0].title,
          voteCount: Number(mostImpactful.rows[0].vote_count),
        }
      : null,
  };
}
