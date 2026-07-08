import { Router } from 'express';
import type { ApiResponse, User } from '@feedback-board/shared';
import {
  addUserTeam,
  listPendingUsers,
  listUsers,
  removeUserTeam,
  updateUserApproval,
  updateUserRestricted,
  updateUserRole,
  updateUserTeam,
} from '../repositories/users.repository';
import { getTeamById } from '../repositories/teams.repository';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import { isRole } from '../lib/enums';

export const usersRouter = Router();

usersRouter.use(requireAuth, requireAdmin);

usersRouter.get('/', async (_req, res, next) => {
  try {
    const users = await listUsers();
    res.json({ data: users } satisfies ApiResponse<User[]>);
  } catch (err) {
    next(err);
  }
});

// Signup approval queue: company-internal tool, so new signups must be
// approved by a company_admin before requireApproved lets them use the app.
usersRouter.get('/pending', async (_req, res, next) => {
  try {
    const users = await listPendingUsers();
    res.json({ data: users } satisfies ApiResponse<User[]>);
  } catch (err) {
    next(err);
  }
});

usersRouter.patch('/:id/approve', async (req, res, next) => {
  try {
    const user = await updateUserApproval(req.params.id, 'approved', req.user!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found.' } satisfies ApiResponse<never>);
      return;
    }
    res.json({ data: user } satisfies ApiResponse<User>);
  } catch (err) {
    next(err);
  }
});

usersRouter.patch('/:id/reject', async (req, res, next) => {
  try {
    const user = await updateUserApproval(req.params.id, 'rejected', req.user!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found.' } satisfies ApiResponse<never>);
      return;
    }
    res.json({ data: user } satisfies ApiResponse<User>);
  } catch (err) {
    next(err);
  }
});

usersRouter.patch('/:id/role', async (req, res, next) => {
  try {
    const role = req.body?.role;
    if (!isRole(role)) {
      res.status(400).json({ error: 'Invalid role.' } satisfies ApiResponse<never>);
      return;
    }
    const user = await updateUserRole(req.params.id, role);
    if (!user) {
      res.status(404).json({ error: 'User not found.' } satisfies ApiResponse<never>);
      return;
    }
    res.json({ data: user } satisfies ApiResponse<User>);
  } catch (err) {
    next(err);
  }
});

usersRouter.patch('/:id/team', async (req, res, next) => {
  try {
    const teamId = req.body?.teamId;
    if (teamId !== null && typeof teamId !== 'string') {
      res.status(400).json({ error: 'teamId must be a string or null.' } satisfies ApiResponse<never>);
      return;
    }
    if (teamId !== null) {
      const team = await getTeamById(teamId);
      if (!team) {
        res.status(400).json({ error: 'Team not found.' } satisfies ApiResponse<never>);
        return;
      }
    }
    const user = await updateUserTeam(req.params.id, teamId);
    if (!user) {
      res.status(404).json({ error: 'User not found.' } satisfies ApiResponse<never>);
      return;
    }
    res.json({ data: user } satisfies ApiResponse<User>);
  } catch (err) {
    next(err);
  }
});

// Multi-team membership: a user can belong to several teams (governs
// team-only idea visibility and which team they can post into). team_id
// stays the "primary" team, updated separately via PATCH /:id/team.
usersRouter.post('/:id/teams', async (req, res, next) => {
  try {
    const teamId = req.body?.teamId;
    if (typeof teamId !== 'string') {
      res.status(400).json({ error: 'teamId is required.' } satisfies ApiResponse<never>);
      return;
    }
    const team = await getTeamById(teamId);
    if (!team) {
      res.status(400).json({ error: 'Team not found.' } satisfies ApiResponse<never>);
      return;
    }
    const user = await addUserTeam(req.params.id, teamId);
    if (!user) {
      res.status(404).json({ error: 'User not found.' } satisfies ApiResponse<never>);
      return;
    }
    res.json({ data: user } satisfies ApiResponse<User>);
  } catch (err) {
    next(err);
  }
});

usersRouter.delete('/:id/teams/:teamId', async (req, res, next) => {
  try {
    const user = await removeUserTeam(req.params.id, req.params.teamId);
    if (!user) {
      res.status(404).json({ error: 'User not found.' } satisfies ApiResponse<never>);
      return;
    }
    res.json({ data: user } satisfies ApiResponse<User>);
  } catch (err) {
    next(err);
  }
});

// PRD §6.10 / §8.5: restrict a user's posting ability after repeated abuse.
usersRouter.patch('/:id/restrict', async (req, res, next) => {
  try {
    const isRestricted = req.body?.isRestricted;
    if (typeof isRestricted !== 'boolean') {
      res.status(400).json({ error: 'isRestricted must be a boolean.' } satisfies ApiResponse<never>);
      return;
    }
    const user = await updateUserRestricted(req.params.id, isRestricted);
    if (!user) {
      res.status(404).json({ error: 'User not found.' } satisfies ApiResponse<never>);
      return;
    }
    res.json({ data: user } satisfies ApiResponse<User>);
  } catch (err) {
    next(err);
  }
});
