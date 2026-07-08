import { Router } from 'express';
import type { ApiResponse, Team } from '@feedback-board/shared';
import { createTeam, DuplicateTeamNameError, listTeams, renameTeam } from '../repositories/teams.repository';
import { requireAuth } from '../middleware/requireAuth';
import { requireApproved } from '../middleware/requireApproved';
import { requireAdmin } from '../middleware/requireAdmin';

export const teamsRouter = Router();

teamsRouter.use(requireAuth, requireApproved);

const MAX_TEAM_NAME_LENGTH = 100;

function validateName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_TEAM_NAME_LENGTH) return null;
  return trimmed;
}

teamsRouter.get('/', async (_req, res, next) => {
  try {
    const teams = await listTeams();
    res.json({ data: teams } satisfies ApiResponse<Team[]>);
  } catch (err) {
    next(err);
  }
});

teamsRouter.post('/', requireAdmin, async (req, res, next) => {
  try {
    const name = validateName(req.body?.name);
    if (!name) {
      res
        .status(400)
        .json({ error: 'Team name is required and must be 100 characters or fewer.' } satisfies ApiResponse<never>);
      return;
    }
    const team = await createTeam(name);
    res.status(201).json({ data: team } satisfies ApiResponse<Team>);
  } catch (err) {
    if (err instanceof DuplicateTeamNameError) {
      res.status(400).json({ error: 'A team with this name already exists.' } satisfies ApiResponse<never>);
      return;
    }
    next(err);
  }
});

teamsRouter.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const name = validateName(req.body?.name);
    if (!name) {
      res
        .status(400)
        .json({ error: 'Team name is required and must be 100 characters or fewer.' } satisfies ApiResponse<never>);
      return;
    }
    const team = await renameTeam(req.params.id, name);
    if (!team) {
      res.status(404).json({ error: 'Team not found.' } satisfies ApiResponse<never>);
      return;
    }
    res.json({ data: team } satisfies ApiResponse<Team>);
  } catch (err) {
    if (err instanceof DuplicateTeamNameError) {
      res.status(400).json({ error: 'A team with this name already exists.' } satisfies ApiResponse<never>);
      return;
    }
    next(err);
  }
});
