import type { Express } from 'express';
import type { ApiOk } from '@feedback-board/shared';

export function registerRoutes(app: Express): void {
  app.get('/api/health', (_req, res) => {
    const body: ApiOk = { ok: true };
    res.json(body);
  });

  // === Dev B route registrations — append only below ===
}
