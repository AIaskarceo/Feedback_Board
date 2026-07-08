import { Router } from 'express';
import type { ApiResponse, DuplicateCandidate, Idea } from '@feedback-board/shared';
import {
  createIdea,
  findPossibleDuplicates,
  listIdeas,
  maskAnonymousIdea,
  type IdeaFilters,
  type Viewer,
} from '../repositories/ideas.repository';
import { getCategoryById } from '../repositories/categories.repository';
import { requireAuth } from '../middleware/requireAuth';
import { requireApproved } from '../middleware/requireApproved';
import { rateLimit } from '../middleware/rateLimit';
import { isIdeaSort, isIdeaStatus } from '../lib/enums';

export const ideasRouter = Router();

ideasRouter.use(requireAuth, requireApproved);

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;

// PRD §8.5: spam prevention on idea submission.
const submitRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  message: 'Too many ideas submitted. Please wait a few minutes and try again.',
});

function toViewer(req: { user?: { id: string; role: string; teamId: string | null; teamIds: string[] } }): Viewer {
  const user = req.user!;
  return { id: user.id, role: user.role as Viewer['role'], teamId: user.teamId, teamIds: user.teamIds };
}

ideasRouter.get('/', async (req, res, next) => {
  try {
    const filters: IdeaFilters = {};
    const { search, status, categoryId, teamId, submitterId, sort, includeArchived } = req.query;

    if (typeof search === 'string' && search.trim()) filters.search = search.trim();
    if (isIdeaStatus(status)) filters.status = status;
    if (typeof categoryId === 'string') filters.categoryId = categoryId;
    if (typeof teamId === 'string') filters.teamId = teamId;
    if (typeof submitterId === 'string') filters.submitterId = submitterId;
    if (isIdeaSort(sort)) filters.sort = sort;
    if (includeArchived === 'true') filters.includeArchived = true;

    const ideas = await listIdeas(toViewer(req), filters);
    res.json({ data: ideas.map(maskAnonymousIdea) } satisfies ApiResponse<Idea[]>);
  } catch (err) {
    next(err);
  }
});

// PRD §6.2 step 4: called before final submission so the client can show
// close matches and let the user upvote an existing idea instead.
ideasRouter.post('/check-duplicates', async (req, res, next) => {
  try {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (!title) {
      res.json({ data: [] } satisfies ApiResponse<DuplicateCandidate[]>);
      return;
    }
    const matches = await findPossibleDuplicates(toViewer(req), title);
    const data = matches.map((m) => ({ idea: maskAnonymousIdea(m.idea), similarity: m.similarity }));
    res.json({ data } satisfies ApiResponse<DuplicateCandidate[]>);
  } catch (err) {
    next(err);
  }
});

ideasRouter.post('/', submitRateLimit, async (req, res, next) => {
  try {
    if (req.user!.isRestricted) {
      res
        .status(403)
        .json({ error: 'Your posting ability has been restricted. Contact an admin.' } satisfies ApiResponse<never>);
      return;
    }

    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const visibility = req.body?.visibility === 'team' ? 'team' : 'company';
    const categoryId = typeof req.body?.categoryId === 'string' ? req.body.categoryId : null;
    const isAnonymous = req.body?.isAnonymous === true;

    if (!title) {
      res.status(400).json({ error: 'Idea title cannot be empty.' } satisfies ApiResponse<never>);
      return;
    }
    if (title.length > MAX_TITLE_LENGTH) {
      res
        .status(400)
        .json({ error: 'Idea title must be 200 characters or fewer.' } satisfies ApiResponse<never>);
      return;
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      res
        .status(400)
        .json({ error: 'Idea description must be 2000 characters or fewer.' } satisfies ApiResponse<never>);
      return;
    }

    let teamId: string | null = null;
    if (visibility === 'team') {
      const memberTeamIds = req.user!.teamIds;
      if (memberTeamIds.length === 0) {
        res
          .status(400)
          .json({ error: 'You must belong to a team to submit a team-only idea.' } satisfies ApiResponse<never>);
        return;
      }
      const requestedTeamId = typeof req.body?.teamId === 'string' ? req.body.teamId : memberTeamIds[0];
      if (!memberTeamIds.includes(requestedTeamId)) {
        res
          .status(400)
          .json({ error: 'You can only submit a team-only idea to a team you belong to.' } satisfies ApiResponse<never>);
        return;
      }
      teamId = requestedTeamId;
    }

    if (categoryId) {
      const category = await getCategoryById(categoryId);
      if (!category) {
        res.status(400).json({ error: 'Category not found.' } satisfies ApiResponse<never>);
        return;
      }
    }

    const idea = await createIdea({
      title,
      description,
      submitterId: req.user!.id,
      teamId,
      visibility,
      categoryId,
      isAnonymous,
    });
    res.status(201).json({ data: idea } satisfies ApiResponse<Idea>);
  } catch (err) {
    next(err);
  }
});
