import { Router } from 'express';
import type { ApiResponse } from '@feedback-board/shared';
import { getUserAvatar } from '../repositories/users.repository';
import { requireAuth } from '../middleware/requireAuth';
import { requireApproved } from '../middleware/requireApproved';

// Serves any user's avatar to any authenticated caller, so submitter photos
// can be shown on idea cards. Mounted at /api/users BEFORE the admin-gated
// usersRouter — this router handles and responds to GET /:id/avatar, so that
// request never falls through to usersRouter's router-wide requireAdmin.
// (An avatar isn't sensitive; anonymous ideas already blank the submitterId
// client-side, so no avatar is ever requested for them.)
export const avatarRouter = Router();
avatarRouter.use(requireAuth, requireApproved);

avatarRouter.get('/:id/avatar', async (req, res, next) => {
  try {
    const avatar = await getUserAvatar(req.params.id);
    if (!avatar) {
      res.status(404).json({ error: 'No avatar set.' } satisfies ApiResponse<never>);
      return;
    }
    res.setHeader('Content-Type', avatar.mimeType);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(avatar.data);
  } catch (err) {
    next(err);
  }
});
