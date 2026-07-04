import { Router } from 'express';
import type { ApiResponse, Idea } from '@feedback-board/shared';
import { castVote, DuplicateVoteError, SelfVoteError } from '../repositories/ideas.repository';

export const votesRouter = Router();

// TODO: apply Dev A's requireAuth middleware here once available:
// votesRouter.use(requireAuth)

votesRouter.post('/:id/vote', async (req, res, next) => {
  try {
    const idea = await castVote(req.params.id, req.userId);
    if (!idea) {
      res.status(404).json({ error: 'Idea not found.' } satisfies ApiResponse<never>);
      return;
    }
    res.json({ data: idea } satisfies ApiResponse<Idea>);
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
