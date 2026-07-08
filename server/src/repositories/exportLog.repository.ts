import type { ExportFormat, ExportLogEntry } from '@feedback-board/shared';
import { pool } from '../db/client';

export async function logExport(adminId: string, format: ExportFormat, ideaCount: number): Promise<void> {
  await pool.query(`INSERT INTO export_log (admin_id, format, idea_count) VALUES ($1, $2, $3)`, [
    adminId,
    format,
    ideaCount,
  ]);
}

interface ExportLogRow {
  id: string;
  admin_id: string;
  admin_name: string;
  format: ExportFormat;
  idea_count: number;
  exported_at: Date;
}

// Mirrors listAdminReveals in ideas.repository.ts — same "500 most recent,
// newest first" shape used for the other admin-only audit log.
export async function listExportLog(): Promise<ExportLogEntry[]> {
  const { rows } = await pool.query<ExportLogRow>(
    `SELECT e.id, e.admin_id, u.name AS admin_name, e.format, e.idea_count, e.exported_at
     FROM export_log e
     JOIN users u ON u.id = e.admin_id
     ORDER BY e.exported_at DESC
     LIMIT 500`
  );
  return rows.map((row) => ({
    id: row.id,
    adminId: row.admin_id,
    adminName: row.admin_name,
    format: row.format,
    ideaCount: row.idea_count,
    exportedAt: row.exported_at.toISOString(),
  }));
}
