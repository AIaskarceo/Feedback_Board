import express, { type Express } from 'express';
import cors from 'cors';
import { registerRoutes } from '../src/routes';

// Mirrors src/server.ts's app construction, minus the `.listen()` call, so
// tests exercise the real route/middleware stack without binding a port.
export function buildTestApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '12mb' }));
  registerRoutes(app);
  return app;
}
