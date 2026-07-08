import { Router } from 'express';
import type { ApiResponse, Comment } from '@feedback-board/shared';
import { canManageIdea, canViewIdea, getIdeaById, type Viewer } from '../repositories/ideas.repository';
import {
  createComment,
  getCommentIdeaId,
  getDistinctCommentAuthorIds,
  listComments,
  ParentCommentNotFoundError,
  softDeleteComment,
} from '../repositories/comments.repository';
import { createNotificationSafely } from '../repositories/notifications.repository';
import { requireAuth } from '../middleware/requireAuth';
import { requireApproved } from '../middleware/requireApproved';
import { requireTeamLeadOrAdmin } from '../middleware/requireRole';

const MAX_COMMENT_LENGTH = 2000;

function toViewer(req: { user?: { id: string; role: string; teamId: string | null; teamIds: string[] } }): Viewer {
  const user = req.user!;
  return { id: user.id, role: user.role as Viewer['role'], teamId: user.teamId, teamIds: user.teamIds };
}

// Idea-scoped: GET/POST /api/ideas/:id/comments
export const ideaCommentsRouter = Router();
ideaCommentsRouter.use(requireAuth, requireApproved);

ideaCommentsRouter.get('/:id/comments', async (req, res, next) => {
  try {
    const idea = await getIdeaById(req.params.id, req.user!.id);
    if (!idea || !canViewIdea(idea, toViewer(req))) {
      res.status(404).json({ error: 'Idea not found.' } satisfies ApiResponse<never>);
      return;
    }
    const comments = await listComments(idea.id);
    res.json({ data: comments } satisfies ApiResponse<Comment[]>);
  } catch (err) {
    next(err);
  }
});

ideaCommentsRouter.post('/:id/comments', async (req, res, next) => {
  try {
    if (req.user!.isRestricted) {
      res
        .status(403)
        .json({ error: 'Your posting ability has been restricted. Contact an admin.' } satisfies ApiResponse<never>);
      return;
    }

    const idea = await getIdeaById(req.params.id, req.user!.id);
    if (!idea || !canViewIdea(idea, toViewer(req))) {
      res.status(404).json({ error: 'Idea not found.' } satisfies ApiResponse<never>);
      return;
    }

    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (!body) {
      res.status(400).json({ error: 'Comment cannot be empty.' } satisfies ApiResponse<never>);
      return;
    }
    if (body.length > MAX_COMMENT_LENGTH) {
      res
        .status(400)
        .json({ error: 'Comment must be 2000 characters or fewer.' } satisfies ApiResponse<never>);
      return;
    }
    const parentCommentId = typeof req.body?.parentCommentId === 'string' ? req.body.parentCommentId : null;

    const comment = await createComment(idea.id, req.user!.id, body, parentCommentId);

    const priorAuthorIds = await getDistinctCommentAuthorIds(idea.id);
    const recipients = new Set([idea.submitterId, ...priorAuthorIds]);
    recipients.delete(req.user!.id);
    await Promise.all(
      Array.from(recipients).map((userId) =>
        createNotificationSafely(userId, idea.id, 'comment', `${req.user!.name} commented on "${idea.title}".`)
      )
    );

    res.status(201).json({ data: comment } satisfies ApiResponse<Comment>);
  } catch (err) {
    if (err instanceof ParentCommentNotFoundError) {
      res.status(400).json({ error: 'Parent comment not found.' } satisfies ApiResponse<never>);
      return;
    }
    next(err);
  }
});

// Not idea-scoped: DELETE /api/comments/:id
export const commentsRouter = Router();
commentsRouter.use(requireAuth, requireApproved);

commentsRouter.delete('/:id', requireTeamLeadOrAdmin, async (req, res, next) => {
  try {
    const ideaId = await getCommentIdeaId(req.params.id);
    if (!ideaId) {
      res.status(404).json({ error: 'Comment not found.' } satisfies ApiResponse<never>);
      return;
    }
    const idea = await getIdeaById(ideaId, req.user!.id);
    if (!idea || !canManageIdea(idea, toViewer(req))) {
      res
        .status(403)
        .json({ error: 'You do not have permission to delete this comment.' } satisfies ApiResponse<never>);
      return;
    }

    const comment = await softDeleteComment(req.params.id);
    if (!comment) {
      res.status(404).json({ error: 'Comment not found.' } satisfies ApiResponse<never>);
      return;
    }
    res.json({ data: comment } satisfies ApiResponse<Comment>);
  } catch (err) {
    next(err);
  }
});
