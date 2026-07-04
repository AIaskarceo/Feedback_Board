import type { Express } from 'express';
import { ideasRouter } from './ideas.routes';
import { votesRouter } from './votes.routes';
import { adminRouter } from './admin.routes';
import { meRouter } from './me.routes';

export function registerRoutes(app: Express): void {
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // === Dev B route registrations — append only below ===
  app.use('/api/ideas', ideasRouter);
  app.use('/api/ideas', votesRouter);
  app.use('/api/ideas', adminRouter);
  app.use('/api/me', meRouter);
}
