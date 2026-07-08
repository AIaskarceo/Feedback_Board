import { Router } from 'express';
import type { ApiResponse, User } from '@feedback-board/shared';
import {
  clearUserAvatar,
  getUserAvatar,
  setUserAvatar,
  updateNotificationPreference,
} from '../repositories/users.repository';
import { requireAuth } from '../middleware/requireAuth';

export const meRouter = Router();

meRouter.use(requireAuth);

// Profile-photo constraints: images only, capped small since it's just an
// avatar (base64 JSON, same upload style as idea documents).
const ALLOWED_AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

meRouter.get('/', (req, res) => {
  res.json({ data: req.user } satisfies ApiResponse<User>);
});

meRouter.get('/avatar', async (req, res, next) => {
  try {
    const avatar = await getUserAvatar(req.user!.id);
    if (!avatar) {
      res.status(404).json({ error: 'No avatar set.' } satisfies ApiResponse<never>);
      return;
    }
    res.setHeader('Content-Type', avatar.mimeType);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(avatar.data);
  } catch (err) {
    next(err);
  }
});

meRouter.put('/avatar', async (req, res, next) => {
  try {
    const mimeType = req.body?.mimeType;
    const dataBase64 = typeof req.body?.dataBase64 === 'string' ? req.body.dataBase64 : '';

    if (typeof mimeType !== 'string' || !ALLOWED_AVATAR_MIME_TYPES.includes(mimeType)) {
      res
        .status(400)
        .json({ error: 'Unsupported image type. Allowed: PNG, JPEG, WebP.' } satisfies ApiResponse<never>);
      return;
    }
    if (!dataBase64) {
      res.status(400).json({ error: 'Image data is required.' } satisfies ApiResponse<never>);
      return;
    }

    const data = Buffer.from(dataBase64, 'base64');
    if (data.length === 0 || data.length > MAX_AVATAR_BYTES) {
      res.status(400).json({ error: 'Image must be between 1 byte and 2MB.' } satisfies ApiResponse<never>);
      return;
    }

    const user = await setUserAvatar(req.user!.id, mimeType, data);
    res.json({ data: user ?? undefined } satisfies ApiResponse<User>);
  } catch (err) {
    next(err);
  }
});

meRouter.delete('/avatar', async (req, res, next) => {
  try {
    const user = await clearUserAvatar(req.user!.id);
    res.json({ data: user ?? undefined } satisfies ApiResponse<User>);
  } catch (err) {
    next(err);
  }
});

const VALID_PREFERENCES = ['immediate', 'digest', 'off'];

meRouter.patch('/notification-preference', async (req, res, next) => {
  try {
    const preference = req.body?.notificationPreference;
    if (!VALID_PREFERENCES.includes(preference)) {
      res.status(400).json({ error: 'Invalid notification preference.' } satisfies ApiResponse<never>);
      return;
    }
    const user = await updateNotificationPreference(req.user!.id, preference);
    res.json({ data: user ?? undefined } satisfies ApiResponse<User>);
  } catch (err) {
    next(err);
  }
});
