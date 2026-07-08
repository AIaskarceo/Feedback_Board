import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@feedback-board/shared';

// Must run after requireAuth so req.user is populated.
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'You do not have permission to perform this action.' });
      return;
    }
    next();
  };
}

// Coarse-grained gate for team-scoped actions (status transitions, comment
// deletion, category management). Fine-grained "is this team_lead allowed to
// act on *this specific* idea/team" ownership checks happen in the route
// handler, since that requires the resource's team_id, not just the caller's role.
export const requireTeamLeadOrAdmin = requireRole('team_lead', 'company_admin');
