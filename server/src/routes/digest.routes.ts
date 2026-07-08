import { Router } from 'express';
import type { ApiResponse } from '@feedback-board/shared';
import { sendWeeklyDigest } from '../services/digest';
import { requireAuth } from '../middleware/requireAuth';
import { requireApproved } from '../middleware/requireApproved';
import { requireAdmin } from '../middleware/requireAdmin';

export const digestRouter = Router();
digestRouter.use(requireAuth, requireApproved, requireAdmin);

// Manual trigger for the weekly digest (server.ts's cron job calls the same
// function on schedule) — lets an admin send it on demand instead of waiting
// for Monday.
digestRouter.post('/send-digest', async (_req, res, next) => {
  try {
    const result = await sendWeeklyDigest();
    res.json({ data: result } satisfies ApiResponse<{ sent: number; failed: number }>);
  } catch (err) {
    next(err);
  }
});
