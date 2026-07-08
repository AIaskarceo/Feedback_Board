import type { NextFunction, Request, Response } from 'express';

// Must run after requireAuth so req.user is populated.
// 'admin' was renamed to 'company_admin' in the Idea Board Phase 0 role model.
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'company_admin') {
    res.status(403).json({ error: 'Only admins can perform this action.' });
    return;
  }
  next();
}
