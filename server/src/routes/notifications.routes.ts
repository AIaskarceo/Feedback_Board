import { Router } from 'express';
import type { ApiResponse, Notification } from '@feedback-board/shared';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../repositories/notifications.repository';
import { requireAuth } from '../middleware/requireAuth';
import { requireApproved } from '../middleware/requireApproved';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth, requireApproved);

notificationsRouter.get('/', async (req, res, next) => {
  try {
    const notifications = await listNotifications(req.user!.id);
    res.json({ data: notifications } satisfies ApiResponse<Notification[]>);
  } catch (err) {
    next(err);
  }
});

notificationsRouter.patch('/:id/read', async (req, res, next) => {
  try {
    const notification = await markNotificationRead(req.params.id, req.user!.id);
    if (!notification) {
      res.status(404).json({ error: 'Notification not found.' } satisfies ApiResponse<never>);
      return;
    }
    res.json({ data: notification } satisfies ApiResponse<Notification>);
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post('/read-all', async (req, res, next) => {
  try {
    await markAllNotificationsRead(req.user!.id);
    res.json({ data: null } satisfies ApiResponse<null>);
  } catch (err) {
    next(err);
  }
});
