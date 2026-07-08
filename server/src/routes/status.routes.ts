import { Router } from 'express';
import type { ApiResponse, Idea, StatusHistoryEntry } from '@feedback-board/shared';
import {
  ForbiddenActionError,
  getStatusHistory,
  getVoterIds,
  IdeaNotFoundError,
  IllegalTransitionError,
  maskAnonymousIdea,
  ReasonRequiredError,
  transitionIdeaStatus,
  type Viewer,
} from '../repositories/ideas.repository';
import { getUserById } from '../repositories/users.repository';
import { createNotificationSafely } from '../repositories/notifications.repository';
import { sendIdeaDoneEmail } from '../services/email';
import { requireAuth } from '../middleware/requireAuth';
import { requireApproved } from '../middleware/requireApproved';
import { requireTeamLeadOrAdmin } from '../middleware/requireRole';
import { isIdeaStatus } from '../lib/enums';

export const statusRouter = Router();

statusRouter.use(requireAuth, requireApproved);

function toViewer(req: { user?: { id: string; role: string; teamId: string | null; teamIds: string[] } }): Viewer {
  const user = req.user!;
  return { id: user.id, role: user.role as Viewer['role'], teamId: user.teamId, teamIds: user.teamIds };
}

statusRouter.patch('/:id/status', requireTeamLeadOrAdmin, async (req, res, next) => {
  try {
    const status = req.body?.status;
    if (!isIdeaStatus(status)) {
      res.status(400).json({ error: 'Invalid status.' } satisfies ApiResponse<never>);
      return;
    }
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : null;

    const viewer = toViewer(req);
    const idea = await transitionIdeaStatus(req.params.id, viewer, status, reason);
    const statusLabel = idea.status.replace('_', ' ');

    if (idea.status === 'done') {
      const submitter = await getUserById(idea.submitterId);
      if (submitter) {
        try {
          await sendIdeaDoneEmail(idea, submitter);
        } catch (emailErr) {
          console.error('Failed to send idea-done email:', emailErr);
        }
      }
    }

    if (idea.submitterId !== viewer.id) {
      await createNotificationSafely(
        idea.submitterId,
        idea.id,
        'status_change',
        `Your idea "${idea.title}" moved to ${statusLabel}.`
      );
    }
    const voterIds = await getVoterIds(idea.id);
    await Promise.all(
      voterIds
        .filter((voterId) => voterId !== idea.submitterId && voterId !== viewer.id)
        .map((voterId) =>
          createNotificationSafely(
            voterId,
            idea.id,
            'voted_status_change',
            `An idea you voted for, "${idea.title}", moved to ${statusLabel}.`
          )
        )
    );

    res.json({ data: maskAnonymousIdea(idea) } satisfies ApiResponse<Idea>);
  } catch (err) {
    if (err instanceof IdeaNotFoundError) {
      res.status(404).json({ error: 'Idea not found.' } satisfies ApiResponse<never>);
      return;
    }
    if (err instanceof ForbiddenActionError) {
      res
        .status(403)
        .json({ error: "You do not have permission to change this idea's status." } satisfies ApiResponse<never>);
      return;
    }
    if (err instanceof ReasonRequiredError) {
      res
        .status(400)
        .json({ error: 'A reason is required when declining an idea.' } satisfies ApiResponse<never>);
      return;
    }
    if (err instanceof IllegalTransitionError) {
      res.status(400).json({ error: err.message } satisfies ApiResponse<never>);
      return;
    }
    next(err);
  }
});

statusRouter.get('/:id/status-history', async (req, res, next) => {
  try {
    const history = await getStatusHistory(req.params.id, toViewer(req));
    res.json({ data: history } satisfies ApiResponse<StatusHistoryEntry[]>);
  } catch (err) {
    if (err instanceof IdeaNotFoundError) {
      res.status(404).json({ error: 'Idea not found.' } satisfies ApiResponse<never>);
      return;
    }
    if (err instanceof ForbiddenActionError) {
      res
        .status(403)
        .json({ error: "You do not have permission to view this idea's status history." } satisfies ApiResponse<never>);
      return;
    }
    next(err);
  }
});
