import { Router } from 'express';
import type { ApiResponse, Flag } from '@feedback-board/shared';
import { canViewIdea, getIdeaById, type Viewer } from '../repositories/ideas.repository';
import { getCommentIdeaId } from '../repositories/comments.repository';
import { createFlag, getFlagTeamId, listFlags, updateFlagStatus } from '../repositories/flags.repository';
import { requireAuth } from '../middleware/requireAuth';
import { requireApproved } from '../middleware/requireApproved';
import { requireTeamLeadOrAdmin } from '../middleware/requireRole';

export const flagsRouter = Router();
flagsRouter.use(requireAuth, requireApproved);

const MAX_REASON_LENGTH = 500;

function toViewer(req: { user?: { id: string; role: string; teamId: string | null; teamIds: string[] } }): Viewer {
  const user = req.user!;
  return { id: user.id, role: user.role as Viewer['role'], teamId: user.teamId, teamIds: user.teamIds };
}

flagsRouter.post('/', async (req, res, next) => {
  try {
    const contentType = req.body?.contentType;
    const contentId = typeof req.body?.contentId === 'string' ? req.body.contentId : '';
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';

    if (contentType !== 'idea' && contentType !== 'comment') {
      res.status(400).json({ error: "contentType must be 'idea' or 'comment'." } satisfies ApiResponse<never>);
      return;
    }
    if (!reason || reason.length > MAX_REASON_LENGTH) {
      res
        .status(400)
        .json({ error: 'A reason is required and must be 500 characters or fewer.' } satisfies ApiResponse<never>);
      return;
    }

    const ideaId = contentType === 'idea' ? contentId : await getCommentIdeaId(contentId);
    if (!ideaId) {
      res.status(404).json({ error: 'Content not found.' } satisfies ApiResponse<never>);
      return;
    }
    const idea = await getIdeaById(ideaId, req.user!.id);
    if (!idea || !canViewIdea(idea, toViewer(req))) {
      res.status(404).json({ error: 'Content not found.' } satisfies ApiResponse<never>);
      return;
    }

    const flag = await createFlag(contentType, contentId, req.user!.id, reason);
    res.status(201).json({ data: flag } satisfies ApiResponse<Flag>);
  } catch (err) {
    next(err);
  }
});

flagsRouter.get('/', requireTeamLeadOrAdmin, async (req, res, next) => {
  try {
    const flags = await listFlags(toViewer(req));
    res.json({ data: flags } satisfies ApiResponse<Flag[]>);
  } catch (err) {
    next(err);
  }
});

flagsRouter.patch('/:id', requireTeamLeadOrAdmin, async (req, res, next) => {
  try {
    const status = req.body?.status;
    if (status !== 'dismissed' && status !== 'removed') {
      res.status(400).json({ error: "status must be 'dismissed' or 'removed'." } satisfies ApiResponse<never>);
      return;
    }

    const viewer = toViewer(req);
    if (viewer.role !== 'company_admin') {
      const teamId = await getFlagTeamId(req.params.id);
      if (teamId === null || teamId !== viewer.teamId) {
        res
          .status(403)
          .json({ error: 'You do not have permission to moderate this flag.' } satisfies ApiResponse<never>);
        return;
      }
    }

    const flag = await updateFlagStatus(req.params.id, status);
    if (!flag) {
      res.status(404).json({ error: 'Flag not found.' } satisfies ApiResponse<never>);
      return;
    }
    res.json({ data: flag } satisfies ApiResponse<Flag>);
  } catch (err) {
    next(err);
  }
});
