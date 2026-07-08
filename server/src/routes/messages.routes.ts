import { Router } from 'express';
import type { ApiResponse, Idea, IdeaMessage } from '@feedback-board/shared';
import { canManageIdea, canViewIdea, getIdeaById, type Viewer } from '../repositories/ideas.repository';
import { createMessage, listMessages } from '../repositories/messages.repository';
import { requireAuth } from '../middleware/requireAuth';
import { requireApproved } from '../middleware/requireApproved';

export const messagesRouter = Router();
messagesRouter.use(requireAuth, requireApproved);

const MAX_MESSAGE_LENGTH = 2000;

function toViewer(req: { user?: { id: string; role: string; teamId: string | null; teamIds: string[] } }): Viewer {
  const user = req.user!;
  return { id: user.id, role: user.role as Viewer['role'], teamId: user.teamId, teamIds: user.teamIds };
}

// Only the idea's submitter or whoever can manage the idea (its team_lead,
// or any company_admin) is a party to this private thread — anyone else
// gets 403, even if they can otherwise see the idea itself.
function isThreadParticipant(idea: Idea, viewer: Viewer): boolean {
  return idea.submitterId === viewer.id || canManageIdea(idea, viewer);
}

messagesRouter.get('/:id/messages', async (req, res, next) => {
  try {
    const idea = await getIdeaById(req.params.id, req.user!.id);
    const viewer = toViewer(req);
    if (!idea || !canViewIdea(idea, viewer)) {
      res.status(404).json({ error: 'Idea not found.' } satisfies ApiResponse<never>);
      return;
    }
    if (!isThreadParticipant(idea, viewer)) {
      res
        .status(403)
        .json({ error: 'You do not have permission to view these messages.' } satisfies ApiResponse<never>);
      return;
    }

    const messages = await listMessages(idea.id);
    res.json({ data: messages } satisfies ApiResponse<IdeaMessage[]>);
  } catch (err) {
    next(err);
  }
});

messagesRouter.post('/:id/messages', async (req, res, next) => {
  try {
    const idea = await getIdeaById(req.params.id, req.user!.id);
    const viewer = toViewer(req);
    if (!idea || !canViewIdea(idea, viewer)) {
      res.status(404).json({ error: 'Idea not found.' } satisfies ApiResponse<never>);
      return;
    }
    if (!isThreadParticipant(idea, viewer)) {
      res
        .status(403)
        .json({ error: 'You do not have permission to message on this idea.' } satisfies ApiResponse<never>);
      return;
    }

    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (!body) {
      res.status(400).json({ error: 'Message cannot be empty.' } satisfies ApiResponse<never>);
      return;
    }
    if (body.length > MAX_MESSAGE_LENGTH) {
      res
        .status(400)
        .json({ error: 'Message must be 2000 characters or fewer.' } satisfies ApiResponse<never>);
      return;
    }

    const message = await createMessage(idea.id, viewer.id, body);
    res.status(201).json({ data: message } satisfies ApiResponse<IdeaMessage>);
  } catch (err) {
    next(err);
  }
});
