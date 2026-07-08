import { Router } from 'express';
import type { ApiResponse, IdeaMember } from '@feedback-board/shared';
import { canViewIdea, getIdeaById, type Viewer } from '../repositories/ideas.repository';
import {
  addCollaborator,
  AlreadyCollaboratorError,
  listCollaborators,
  removeCollaborator,
  UserNotFoundError,
} from '../repositories/collaborators.repository';
import { requireAuth } from '../middleware/requireAuth';
import { requireApproved } from '../middleware/requireApproved';

// Collaborators an idea's submitter adds to build the idea together — same
// permission shape as resources/documents: anyone who can view the idea sees
// the member list, but only the submitter (or company_admin) can add/remove.
export const membersRouter = Router();
membersRouter.use(requireAuth, requireApproved);

function toViewer(req: { user?: { id: string; role: string; teamId: string | null; teamIds: string[] } }): Viewer {
  const user = req.user!;
  return { id: user.id, role: user.role as Viewer['role'], teamId: user.teamId, teamIds: user.teamIds };
}

membersRouter.get('/:id/members', async (req, res, next) => {
  try {
    const idea = await getIdeaById(req.params.id, req.user!.id);
    if (!idea || !canViewIdea(idea, toViewer(req))) {
      res.status(404).json({ error: 'Idea not found.' } satisfies ApiResponse<never>);
      return;
    }
    const members = await listCollaborators(idea.id);
    res.json({ data: members } satisfies ApiResponse<IdeaMember[]>);
  } catch (err) {
    next(err);
  }
});

membersRouter.post('/:id/members', async (req, res, next) => {
  try {
    const idea = await getIdeaById(req.params.id, req.user!.id);
    const viewer = toViewer(req);
    if (!idea || !canViewIdea(idea, viewer)) {
      res.status(404).json({ error: 'Idea not found.' } satisfies ApiResponse<never>);
      return;
    }
    if (idea.submitterId !== viewer.id && viewer.role !== 'company_admin') {
      res
        .status(403)
        .json({ error: 'Only the submitter can add members to this idea.' } satisfies ApiResponse<never>);
      return;
    }

    const userId = typeof req.body?.userId === 'string' ? req.body.userId : '';
    if (!userId) {
      res.status(400).json({ error: 'userId is required.' } satisfies ApiResponse<never>);
      return;
    }
    if (userId === idea.submitterId) {
      res
        .status(400)
        .json({ error: 'The submitter is already on the idea and cannot be added as a member.' } satisfies ApiResponse<never>);
      return;
    }

    const member = await addCollaborator(idea.id, userId, viewer.id);
    res.status(201).json({ data: member } satisfies ApiResponse<IdeaMember>);
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      res.status(400).json({ error: 'User not found.' } satisfies ApiResponse<never>);
      return;
    }
    if (err instanceof AlreadyCollaboratorError) {
      res.status(400).json({ error: 'This person is already a member of the idea.' } satisfies ApiResponse<never>);
      return;
    }
    next(err);
  }
});

membersRouter.delete('/:id/members/:userId', async (req, res, next) => {
  try {
    const idea = await getIdeaById(req.params.id, req.user!.id);
    const viewer = toViewer(req);
    if (!idea || !canViewIdea(idea, viewer)) {
      res.status(404).json({ error: 'Idea not found.' } satisfies ApiResponse<never>);
      return;
    }
    if (idea.submitterId !== viewer.id && viewer.role !== 'company_admin') {
      res
        .status(403)
        .json({ error: 'Only the submitter can remove members from this idea.' } satisfies ApiResponse<never>);
      return;
    }

    const removed = await removeCollaborator(idea.id, req.params.userId);
    if (!removed) {
      res.status(404).json({ error: 'Member not found.' } satisfies ApiResponse<never>);
      return;
    }
    res.json({ data: null } satisfies ApiResponse<null>);
  } catch (err) {
    next(err);
  }
});
