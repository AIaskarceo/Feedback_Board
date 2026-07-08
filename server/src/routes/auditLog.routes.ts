import { Router } from 'express';
import type { ApiResponse, StatusHistoryEntry } from '@feedback-board/shared';
import { listAllStatusHistory } from '../repositories/ideas.repository';
import { requireAuth } from '../middleware/requireAuth';
import { requireApproved } from '../middleware/requireApproved';
import { requireAdmin } from '../middleware/requireAdmin';

export const auditLogRouter = Router();

auditLogRouter.use(requireAuth, requireApproved, requireAdmin);

auditLogRouter.get('/', async (_req, res, next) => {
  try {
    const history = await listAllStatusHistory();
    res.json({ data: history } satisfies ApiResponse<StatusHistoryEntry[]>);
  } catch (err) {
    next(err);
  }
});
