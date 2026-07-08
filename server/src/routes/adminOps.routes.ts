import { Router } from 'express';
import type { ApiResponse, AppSettings, ExportLogEntry, RetentionRunResult } from '@feedback-board/shared';
import { getRetentionMonths, setRetentionMonths } from '../repositories/settings.repository';
import { listExportLog } from '../repositories/exportLog.repository';
import { archiveStaleIdeas } from '../services/retention';
import { requireAuth } from '../middleware/requireAuth';
import { requireApproved } from '../middleware/requireApproved';
import { requireAdmin } from '../middleware/requireAdmin';

// PRD §8.7: retention settings + on-demand archive trigger + the export
// audit log. company_admin only, mirroring digest.routes.ts's shape for
// admin-triggered background jobs.
export const adminOpsRouter = Router();
adminOpsRouter.use(requireAuth, requireApproved, requireAdmin);

adminOpsRouter.get('/settings', async (_req, res, next) => {
  try {
    const retentionMonths = await getRetentionMonths();
    res.json({ data: { retentionMonths } } satisfies ApiResponse<AppSettings>);
  } catch (err) {
    next(err);
  }
});

adminOpsRouter.patch('/settings', async (req, res, next) => {
  try {
    const retentionMonths = Number(req.body?.retentionMonths);
    if (!Number.isInteger(retentionMonths) || retentionMonths <= 0) {
      res
        .status(400)
        .json({ error: 'retentionMonths must be a positive whole number.' } satisfies ApiResponse<never>);
      return;
    }
    const updated = await setRetentionMonths(retentionMonths);
    res.json({ data: { retentionMonths: updated } } satisfies ApiResponse<AppSettings>);
  } catch (err) {
    next(err);
  }
});

// Manual trigger for the retention job (the cron in server.ts calls the same
// function on schedule) — lets an admin archive stale ideas on demand.
adminOpsRouter.post('/run-retention', async (_req, res, next) => {
  try {
    const result = await archiveStaleIdeas();
    res.json({ data: result } satisfies ApiResponse<RetentionRunResult>);
  } catch (err) {
    next(err);
  }
});

adminOpsRouter.get('/export-log', async (_req, res, next) => {
  try {
    const entries = await listExportLog();
    res.json({ data: entries } satisfies ApiResponse<ExportLogEntry[]>);
  } catch (err) {
    next(err);
  }
});
