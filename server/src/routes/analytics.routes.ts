import { Router } from 'express';
import type { Analytics, ApiResponse } from '@feedback-board/shared';
import { getAnalytics } from '../repositories/analytics.repository';
import type { Viewer } from '../repositories/ideas.repository';
import { requireAuth } from '../middleware/requireAuth';
import { requireApproved } from '../middleware/requireApproved';
import { requireTeamLeadOrAdmin } from '../middleware/requireRole';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth, requireApproved, requireTeamLeadOrAdmin);

analyticsRouter.get('/', async (req, res, next) => {
  try {
    const user = req.user!;
    const viewer: Viewer = { id: user.id, role: user.role, teamId: user.teamId, teamIds: user.teamIds };
    const analytics = await getAnalytics(viewer);
    res.json({ data: analytics } satisfies ApiResponse<Analytics>);
  } catch (err) {
    next(err);
  }
});
