import { Router } from 'express';
import type { ApiResponse, IdeaResource } from '@feedback-board/shared';
import { canViewIdea, getIdeaById, type Viewer } from '../repositories/ideas.repository';
import { addResource, deleteResource, getResourceOwnership, listResources } from '../repositories/resources.repository';
import { requireAuth } from '../middleware/requireAuth';
import { requireApproved } from '../middleware/requireApproved';

// Research links/docs the idea's submitter attaches — anyone who can view
// the idea can see them (in the idea detail view), but only the submitter
// (or company_admin, same as everywhere else) can add or remove one.
export const resourcesRouter = Router();
resourcesRouter.use(requireAuth, requireApproved);

const MAX_URL_LENGTH = 2000;
const MAX_LABEL_LENGTH = 200;

function toViewer(req: { user?: { id: string; role: string; teamId: string | null; teamIds: string[] } }): Viewer {
  const user = req.user!;
  return { id: user.id, role: user.role as Viewer['role'], teamId: user.teamId, teamIds: user.teamIds };
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

resourcesRouter.get('/:id/resources', async (req, res, next) => {
  try {
    const idea = await getIdeaById(req.params.id, req.user!.id);
    if (!idea || !canViewIdea(idea, toViewer(req))) {
      res.status(404).json({ error: 'Idea not found.' } satisfies ApiResponse<never>);
      return;
    }
    const resources = await listResources(idea.id);
    res.json({ data: resources } satisfies ApiResponse<IdeaResource[]>);
  } catch (err) {
    next(err);
  }
});

resourcesRouter.post('/:id/resources', async (req, res, next) => {
  try {
    const idea = await getIdeaById(req.params.id, req.user!.id);
    const viewer = toViewer(req);
    if (!idea || !canViewIdea(idea, viewer)) {
      res.status(404).json({ error: 'Idea not found.' } satisfies ApiResponse<never>);
      return;
    }
    // Only the submitter (whose research this is) or a company_admin can
    // attach links — not just anyone who can see the idea.
    if (idea.submitterId !== viewer.id && viewer.role !== 'company_admin') {
      res
        .status(403)
        .json({ error: 'Only the submitter can attach research links to this idea.' } satisfies ApiResponse<never>);
      return;
    }

    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';

    if (!url || url.length > MAX_URL_LENGTH || !isValidUrl(url)) {
      res
        .status(400)
        .json({ error: 'A valid http(s) URL is required and must be 2000 characters or fewer.' } satisfies ApiResponse<never>);
      return;
    }
    if (label.length > MAX_LABEL_LENGTH) {
      res.status(400).json({ error: 'Label must be 200 characters or fewer.' } satisfies ApiResponse<never>);
      return;
    }

    const resource = await addResource(idea.id, viewer.id, url, label || null);
    res.status(201).json({ data: resource } satisfies ApiResponse<IdeaResource>);
  } catch (err) {
    next(err);
  }
});

resourcesRouter.delete('/:id/resources/:resourceId', async (req, res, next) => {
  try {
    const idea = await getIdeaById(req.params.id, req.user!.id);
    const viewer = toViewer(req);
    if (!idea || !canViewIdea(idea, viewer)) {
      res.status(404).json({ error: 'Idea not found.' } satisfies ApiResponse<never>);
      return;
    }

    const ownership = await getResourceOwnership(req.params.resourceId);
    if (!ownership || ownership.ideaId !== idea.id) {
      res.status(404).json({ error: 'Resource not found.' } satisfies ApiResponse<never>);
      return;
    }
    if (ownership.addedBy !== viewer.id && viewer.role !== 'company_admin') {
      res
        .status(403)
        .json({ error: 'You do not have permission to remove this resource.' } satisfies ApiResponse<never>);
      return;
    }

    await deleteResource(req.params.resourceId);
    res.json({ data: null } satisfies ApiResponse<null>);
  } catch (err) {
    next(err);
  }
});
