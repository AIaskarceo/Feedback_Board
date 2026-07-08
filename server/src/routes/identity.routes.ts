import { Router } from 'express';
import type { AdminReveal, ApiResponse, Idea } from '@feedback-board/shared';
import { canViewIdea, getIdeaById, listAdminReveals, logAdminReveal, type Viewer } from '../repositories/ideas.repository';
import { requireAuth } from '../middleware/requireAuth';
import { requireApproved } from '../middleware/requireApproved';
import { requireAdmin } from '../middleware/requireAdmin';

function toViewer(req: { user?: { id: string; role: string; teamId: string | null; teamIds: string[] } }): Viewer {
  const user = req.user!;
  return { id: user.id, role: user.role as Viewer['role'], teamId: user.teamId, teamIds: user.teamIds };
}

// Mounted at /api/ideas (path: /:id/identity), alongside the other
// idea-scoped routers. requireAdmin is applied per-route, not via
// router.use() — this router shares the /api/ideas prefix with siblings
// (resourcesRouter, mergeRouter, bulkRetagRouter) mounted after it, and an
// unconditional router-wide requireAdmin would intercept and 403 every
// request to those routers too, since Express runs a path-less router.use()
// middleware before checking whether any route in this router matches.
export const identityRouter = Router();
identityRouter.use(requireAuth, requireApproved);

// PRD §6.9: a company_admin can deliberately unmask an anonymous idea's true
// submitter — this is the only path that returns the real identity, and
// every call is logged to admin_reveal_log.
identityRouter.get('/:id/identity', requireAdmin, async (req, res, next) => {
  try {
    const idea = await getIdeaById(req.params.id, req.user!.id);
    if (!idea || !canViewIdea(idea, toViewer(req))) {
      res.status(404).json({ error: 'Idea not found.' } satisfies ApiResponse<never>);
      return;
    }

    if (idea.isAnonymous) {
      await logAdminReveal(idea.id, req.user!.id);
    }

    res.json({ data: idea } satisfies ApiResponse<Idea>);
  } catch (err) {
    next(err);
  }
});

// Mounted standalone at /api/admin-reveal-log.
export const adminRevealLogRouter = Router();
adminRevealLogRouter.use(requireAuth, requireApproved, requireAdmin);

adminRevealLogRouter.get('/', async (_req, res, next) => {
  try {
    const reveals = await listAdminReveals();
    res.json({ data: reveals } satisfies ApiResponse<AdminReveal[]>);
  } catch (err) {
    next(err);
  }
});
