import { Router } from 'express';
import type { ApiResponse, DirectoryUser } from '@feedback-board/shared';
import { listDirectory } from '../repositories/users.repository';
import { requireAuth } from '../middleware/requireAuth';
import { requireApproved } from '../middleware/requireApproved';

// Lightweight user list for the "add members/collaborators" picker — any
// authenticated user can browse it (name/username/avatar only, no
// email/role), unlike the admin-only /api/users.
export const directoryRouter = Router();
directoryRouter.use(requireAuth, requireApproved);

directoryRouter.get('/', async (_req, res, next) => {
  try {
    const users = await listDirectory();
    res.json({ data: users } satisfies ApiResponse<DirectoryUser[]>);
  } catch (err) {
    next(err);
  }
});
