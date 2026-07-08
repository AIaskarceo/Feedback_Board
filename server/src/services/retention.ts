import { pool } from '../db/client';
import { getRetentionMonths } from '../repositories/settings.repository';

// PRD §8.7: archive (never delete) a done/declined idea once it's had no
// activity — no new vote, comment, or status change — for the configured
// retention window. "Activity" is the most recent of: creation, last vote,
// last comment, last status change. Archived ideas are excluded from the
// default board view (ideas.repository's listIdeas) but stay in the DB.
export async function archiveStaleIdeas(): Promise<{ archived: number }> {
  const months = await getRetentionMonths();

  const { rowCount } = await pool.query(
    `UPDATE ideas i SET archived_at = now()
     WHERE i.archived_at IS NULL
       AND i.status IN ('done', 'declined')
       AND GREATEST(
             i.created_at,
             COALESCE((SELECT MAX(v.created_at) FROM votes v WHERE v.idea_id = i.id), i.created_at),
             COALESCE((SELECT MAX(c.created_at) FROM comments c WHERE c.idea_id = i.id), i.created_at),
             COALESCE((SELECT MAX(h.changed_at) FROM idea_status_history h WHERE h.idea_id = i.id), i.created_at)
           ) < now() - (concat($1::text, ' months'))::interval`,
    [months]
  );

  return { archived: rowCount ?? 0 };
}
