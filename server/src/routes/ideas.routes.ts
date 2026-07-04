import { Router } from 'express';
import type { ApiResponse, Idea } from '@feedback-board/shared';
import { createIdea, listIdeas } from '../repositories/ideas.repository';

export const ideasRouter = Router();

// TODO: apply Dev A's requireAuth middleware here once available:
// ideasRouter.use(requireAuth)

const MAX_IDEA_TEXT_LENGTH = 200;

ideasRouter.get('/', async (req, res, next) => {
  try {
    const ideas = await listIdeas(req.userId ?? null);
    res.json({ data: ideas } satisfies ApiResponse<Idea[]>);
  } catch (err) {
    next(err);
  }
});

ideasRouter.post('/', async (req, res, next) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';

    if (!text) {
      res.status(400).json({ error: 'Idea text cannot be empty.' } satisfies ApiResponse<never>);
      return;
    }
    if (text.length > MAX_IDEA_TEXT_LENGTH) {
      res.status(400).json({ error: 'Idea text must be 200 characters or fewer.' } satisfies ApiResponse<never>);
      return;
    }

    const idea = await createIdea(text, req.userId);
    res.status(201).json({ data: idea } satisfies ApiResponse<Idea>);
  } catch (err) {
    next(err);
  }
});
