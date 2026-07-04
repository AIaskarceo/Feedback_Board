import { Router } from 'express';
import type { ApiResponse, User } from '@feedback-board/shared';
import { requireAuth } from '../middleware/requireAuth';

export const meRouter = Router();

meRouter.use(requireAuth);

meRouter.get('/', (req, res) => {
  res.json({ data: req.user } satisfies ApiResponse<User>);
});
