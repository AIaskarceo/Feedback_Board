import type { NextFunction, Request, Response } from 'express';

// Must run after requireAuth so req.user is populated. Blocks anyone whose
// signup hasn't been approved by a company_admin yet (see
// PATCH /api/users/:id/approve|reject) from every route except GET /api/me
// (so the frontend can detect and display the pending/rejected state) and the
// admin-only user-management routes (already gated by requireAdmin, and
// admins are auto-approved on first login — see syncUser.ts).
export function requireApproved(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.approvalStatus !== 'approved') {
    res.status(403).json({ error: 'Your account is pending admin approval.' });
    return;
  }
  next();
}
