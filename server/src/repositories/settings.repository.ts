import { pool } from '../db/client';

// PRD §8.7: single admin-configurable retention window (months of inactivity
// before a done/declined idea is archived). One row by design — see
// app_settings in schema.sql.
export async function getRetentionMonths(): Promise<number> {
  const { rows } = await pool.query<{ retention_months: number }>(
    `SELECT retention_months FROM app_settings WHERE id = 1`
  );
  return rows[0]?.retention_months ?? 6;
}

export async function setRetentionMonths(months: number): Promise<number> {
  const { rows } = await pool.query<{ retention_months: number }>(
    `UPDATE app_settings SET retention_months = $1 WHERE id = 1 RETURNING retention_months`,
    [months]
  );
  return rows[0].retention_months;
}
