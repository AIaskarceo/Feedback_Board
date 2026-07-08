import type { Express } from 'express';
import { ideasRouter } from './ideas.routes';
import { votesRouter } from './votes.routes';
import { statusRouter } from './status.routes';
import { ideaCommentsRouter, commentsRouter } from './comments.routes';
import { messagesRouter } from './messages.routes';
import { teamsRouter } from './teams.routes';
import { categoriesRouter } from './categories.routes';
import { usersRouter } from './users.routes';
import { auditLogRouter } from './auditLog.routes';
import { identityRouter, adminRevealLogRouter } from './identity.routes';
import { analyticsRouter } from './analytics.routes';
import { flagsRouter } from './flags.routes';
import { notificationsRouter } from './notifications.routes';
import { digestRouter } from './digest.routes';
import { meRouter } from './me.routes';
import { mergeRouter, bulkRetagRouter } from './bulkOps.routes';
import { resourcesRouter } from './resources.routes';
import { documentsRouter } from './documents.routes';
import { avatarRouter } from './avatar.routes';
import { exportRouter } from './export.routes';
import { adminOpsRouter } from './adminOps.routes';
import { membersRouter } from './members.routes';
import { directoryRouter } from './directory.routes';

export function registerRoutes(app: Express): void {
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/ideas', ideasRouter);
  app.use('/api/ideas', votesRouter);
  app.use('/api/ideas', statusRouter);
  app.use('/api/ideas', ideaCommentsRouter);
  app.use('/api/comments', commentsRouter);
  app.use('/api/ideas', messagesRouter);
  app.use('/api/teams', teamsRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/users', avatarRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/audit-log', auditLogRouter);
  app.use('/api/ideas', identityRouter);
  app.use('/api/admin-reveal-log', adminRevealLogRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/flags', flagsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/admin', digestRouter);
  app.use('/api/admin', adminOpsRouter);
  app.use('/api/ideas', resourcesRouter);
  app.use('/api/ideas', documentsRouter);
  app.use('/api/ideas', mergeRouter);
  app.use('/api/ideas', bulkRetagRouter);
  app.use('/api/export', exportRouter);
  app.use('/api/ideas', membersRouter);
  app.use('/api/directory', directoryRouter);
  app.use('/api/me', meRouter);
}
