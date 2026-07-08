import type { NextFunction, Request, Response } from 'express';

// PRD §8.5: rate limiting on idea/vote submissions to prevent spam. A tiny
// in-memory fixed-window counter keyed by user id — no new dependency, and
// good enough for this app's single-instance deployment (see DEPLOY.md).
// Must run after requireAuth so req.user is populated.
export function rateLimit(options: { windowMs: number; max: number; message: string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.user?.id;
    if (!key) {
      next();
      return;
    }

    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (entry.count >= options.max) {
      res.status(429).json({ error: options.message });
      return;
    }

    entry.count += 1;
    next();
  };
}
