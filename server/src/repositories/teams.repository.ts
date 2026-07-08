import type { Team } from '@feedback-board/shared';
import { pool } from '../db/client';

interface TeamRow {
  id: string;
  name: string;
  created_at: Date;
}

function toTeam(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listTeams(): Promise<Team[]> {
  const { rows } = await pool.query<TeamRow>(`SELECT id, name, created_at FROM teams ORDER BY name ASC`);
  return rows.map(toTeam);
}

export async function getTeamById(id: string): Promise<Team | null> {
  const { rows } = await pool.query<TeamRow>(`SELECT id, name, created_at FROM teams WHERE id = $1`, [id]);
  return rows[0] ? toTeam(rows[0]) : null;
}

export class DuplicateTeamNameError extends Error {}

export async function createTeam(name: string): Promise<Team> {
  try {
    const { rows } = await pool.query<TeamRow>(
      `INSERT INTO teams (name) VALUES ($1) RETURNING id, name, created_at`,
      [name]
    );
    return toTeam(rows[0]);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') throw new DuplicateTeamNameError();
    throw err;
  }
}

export async function renameTeam(id: string, name: string): Promise<Team | null> {
  try {
    const { rows } = await pool.query<TeamRow>(
      `UPDATE teams SET name = $2 WHERE id = $1 RETURNING id, name, created_at`,
      [id, name]
    );
    return rows[0] ? toTeam(rows[0]) : null;
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') throw new DuplicateTeamNameError();
    throw err;
  }
}
