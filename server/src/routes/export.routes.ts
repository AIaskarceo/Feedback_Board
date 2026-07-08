import { Router } from 'express';
import type { ApiResponse, Idea } from '@feedback-board/shared';
import { listIdeas, maskAnonymousIdea, type Viewer } from '../repositories/ideas.repository';
import { logExport } from '../repositories/exportLog.repository';
import { toCsv } from '../lib/csv';
import { requireAuth } from '../middleware/requireAuth';
import { requireApproved } from '../middleware/requireApproved';
import { requireAdmin } from '../middleware/requireAdmin';
import { isExportFormat } from '../lib/enums';

// PRD §8.7: export idea data for offline reporting, company_admin only.
// Every export is logged to export_log for audit (see prompt-plan's note on
// not leaking data, but tracking who pulled what).
export const exportRouter = Router();
exportRouter.use(requireAuth, requireApproved, requireAdmin);

const EXPORT_COLUMNS: (keyof Idea)[] = [
  'id',
  'title',
  'description',
  'status',
  'submitterName',
  'teamId',
  'visibility',
  'categoryId',
  'voteCount',
  'commentCount',
  'createdAt',
  'archivedAt',
];

exportRouter.get('/ideas', async (req, res, next) => {
  try {
    const format = isExportFormat(req.query.format) ? req.query.format : 'json';
    const user = req.user!;
    const viewer: Viewer = { id: user.id, role: user.role, teamId: user.teamId, teamIds: user.teamIds };
    // company_admin sees every idea via listIdeas already; include archived
    // ones too since an export is explicitly for offline record-keeping.
    const ideas = (await listIdeas(viewer, { includeArchived: true })).map(maskAnonymousIdea);

    await logExport(user.id, format, ideas.length);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="ideas-export.csv"');
      res.send(toCsv(ideas, EXPORT_COLUMNS));
      return;
    }

    res.json({ data: ideas } satisfies ApiResponse<typeof ideas>);
  } catch (err) {
    next(err);
  }
});
