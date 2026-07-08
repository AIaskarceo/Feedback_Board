import type { IdeaResource } from '@feedback-board/shared';
import { pool } from '../db/client';

interface IdeaResourceRow {
  id: string;
  idea_id: string;
  added_by: string;
  added_by_name: string;
  url: string;
  label: string | null;
  created_at: Date;
}

function toIdeaResource(row: IdeaResourceRow): IdeaResource {
  return {
    id: row.id,
    ideaId: row.idea_id,
    addedBy: row.added_by,
    addedByName: row.added_by_name,
    url: row.url,
    label: row.label,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listResources(ideaId: string): Promise<IdeaResource[]> {
  const { rows } = await pool.query<IdeaResourceRow>(
    `SELECT r.id, r.idea_id, r.added_by, u.name AS added_by_name, r.url, r.label, r.created_at
     FROM idea_resources r
     JOIN users u ON u.id = r.added_by
     WHERE r.idea_id = $1
     ORDER BY r.created_at ASC`,
    [ideaId]
  );
  return rows.map(toIdeaResource);
}

export async function addResource(
  ideaId: string,
  addedBy: string,
  url: string,
  label: string | null
): Promise<IdeaResource> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO idea_resources (idea_id, added_by, url, label) VALUES ($1, $2, $3, $4) RETURNING id`,
    [ideaId, addedBy, url, label]
  );
  const { rows: resourceRows } = await pool.query<IdeaResourceRow>(
    `SELECT r.id, r.idea_id, r.added_by, u.name AS added_by_name, r.url, r.label, r.created_at
     FROM idea_resources r
     JOIN users u ON u.id = r.added_by
     WHERE r.id = $1`,
    [rows[0].id]
  );
  return toIdeaResource(resourceRows[0]);
}

export async function getResourceOwnership(resourceId: string): Promise<{ ideaId: string; addedBy: string } | null> {
  const { rows } = await pool.query<{ idea_id: string; added_by: string }>(
    `SELECT idea_id, added_by FROM idea_resources WHERE id = $1`,
    [resourceId]
  );
  return rows[0] ? { ideaId: rows[0].idea_id, addedBy: rows[0].added_by } : null;
}

export async function deleteResource(resourceId: string): Promise<void> {
  await pool.query(`DELETE FROM idea_resources WHERE id = $1`, [resourceId]);
}
