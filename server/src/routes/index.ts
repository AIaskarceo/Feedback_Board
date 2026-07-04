import type { Express } from 'express';

export function registerRoutes(app: Express): void {
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // === Dev B route registrations — append only below ===
}
