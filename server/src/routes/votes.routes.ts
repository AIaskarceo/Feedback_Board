import { Router } from 'express';
import type { ApiResponse, Idea } from '@feedback-board/shared';
import { castVote, DuplicateVoteError, maskAnonymousIdea, SelfVoteError } from '../repositories/ideas.repository';
import { requireAuth } from '../middleware/requireAuth';
import { requireApproved } from '../middleware/requireApproved';
import { rateLimit } from '../middleware/rateLimit';

export const votesRouter = Router();

votesRouter.use(requireAuth, requireApproved);

// PRD §8.5: spam prevention on voting.
const voteRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 40,
  message: 'Too many votes cast. Please wait a few minutes and try again.',
});

votesRouter.post('/:id/vote', voteRateLimit, async (req, res, next) => {
  try {
    const viewer = { id: req.user!.id, role: req.user!.role, teamId: req.user!.teamId, teamIds: req.user!.teamIds };
    const idea = await castVote(req.params.id, viewer);
    if (!idea) {
      res.status(404).json({ error: 'Idea not found.' } satisfies ApiResponse<never>);
      return;
    }
    res.json({ data: maskAnonymousIdea(idea) } satisfies ApiResponse<Idea>);
  } catch (err) {
    if (err instanceof SelfVoteError) {
      res.status(400).json({ error: 'You cannot vote on your own idea.' } satisfies ApiResponse<never>);
      return;
    }
    if (err instanceof DuplicateVoteError) {
      res.status(400).json({ error: 'You have already voted on this idea.' } satisfies ApiResponse<never>);
      return;
    }
    next(err);
  }
});
