import { Router } from 'express';
import type { ApiResponse, Idea, MergeIdeasResult } from '@feedback-board/shared';
import {
  AlreadyTerminalError,
  bulkRetagIdeas,
  ForbiddenActionError,
  IdeaNotFoundError,
  mergeIdeas,
  SelfMergeError,
  type Viewer,
} from '../repositories/ideas.repository';
import { getCategoryById } from '../repositories/categories.repository';
import { requireAuth } from '../middleware/requireAuth';
import { requireApproved } from '../middleware/requireApproved';
import { requireTeamLeadOrAdmin } from '../middleware/requireRole';

// PRD §8.5: bulk moderation — merge duplicate ideas, bulk re-tag. Both are
// coarse-gated to team_lead/company_admin here; mergeIdeas/bulkRetagIdeas do
// the fine-grained per-idea canManageIdea check (a team_lead can't merge or
// re-tag ideas outside their own team).
//
// requireTeamLeadOrAdmin is applied per-route, not via router.use() — these
// routers share the /api/ideas prefix with siblings (membersRouter,
// resourcesRouter, etc.) mounted after them, and a router-wide gate would
// 403 every request to those routers too for a plain 'member', since Express
// runs a path-less router.use() middleware before checking whether any route
// in this router matches. See the identical fix + explanation in
// identity.routes.ts.
export const mergeRouter = Router();
mergeRouter.use(requireAuth, requireApproved);

function toViewer(req: { user?: { id: string; role: string; teamId: string | null; teamIds: string[] } }): Viewer {
  const user = req.user!;
  return { id: user.id, role: user.role as Viewer['role'], teamId: user.teamId, teamIds: user.teamIds };
}

mergeRouter.post('/:id/merge', requireTeamLeadOrAdmin, async (req, res, next) => {
  try {
    const intoIdeaId = typeof req.body?.intoIdeaId === 'string' ? req.body.intoIdeaId : '';
    if (!intoIdeaId) {
      res.status(400).json({ error: 'intoIdeaId is required.' } satisfies ApiResponse<never>);
      return;
    }

    const result = await mergeIdeas(req.params.id, intoIdeaId, toViewer(req));
    res.json({ data: result } satisfies ApiResponse<MergeIdeasResult>);
  } catch (err) {
    if (err instanceof SelfMergeError) {
      res.status(400).json({ error: 'An idea cannot be merged into itself.' } satisfies ApiResponse<never>);
      return;
    }
    if (err instanceof AlreadyTerminalError) {
      res
        .status(400)
        .json({ error: 'Cannot merge an idea that is already done or declined.' } satisfies ApiResponse<never>);
      return;
    }
    if (err instanceof IdeaNotFoundError) {
      res.status(404).json({ error: 'Idea not found.' } satisfies ApiResponse<never>);
      return;
    }
    if (err instanceof ForbiddenActionError) {
      res
        .status(403)
        .json({ error: 'You do not have permission to merge these ideas.' } satisfies ApiResponse<never>);
      return;
    }
    next(err);
  }
});

export const bulkRetagRouter = Router();
bulkRetagRouter.use(requireAuth, requireApproved);

bulkRetagRouter.patch('/bulk-retag', requireTeamLeadOrAdmin, async (req, res, next) => {
  try {
    const ideaIds = Array.isArray(req.body?.ideaIds) ? req.body.ideaIds.filter((id: unknown) => typeof id === 'string') : [];
    const categoryId = typeof req.body?.categoryId === 'string' ? req.body.categoryId : null;

    if (ideaIds.length === 0) {
      res.status(400).json({ error: 'ideaIds must be a non-empty array.' } satisfies ApiResponse<never>);
      return;
    }
    if (categoryId) {
      const category = await getCategoryById(categoryId);
      if (!category) {
        res.status(400).json({ error: 'Category not found.' } satisfies ApiResponse<never>);
        return;
      }
    }

    const updated = await bulkRetagIdeas(ideaIds, categoryId, toViewer(req));
    res.json({ data: updated } satisfies ApiResponse<Idea[]>);
  } catch (err) {
    next(err);
  }
});
