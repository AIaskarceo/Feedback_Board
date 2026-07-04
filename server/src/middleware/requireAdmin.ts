import type { NextFunction, Request, Response } from 'express';

// Must run after requireAuth so req.user is populated.
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Only admins can perform this action.' });
    return;
  }
  next();
}
