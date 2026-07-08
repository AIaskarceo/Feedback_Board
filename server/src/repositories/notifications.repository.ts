import type { Notification, NotificationType } from '@feedback-board/shared';
import { pool } from '../db/client';

interface NotificationRow {
  id: string;
  idea_id: string;
  type: NotificationType;
  message: string;
  is_read: boolean;
  created_at: Date;
}

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    ideaId: row.idea_id,
    type: row.type,
    message: row.message,
    isRead: row.is_read,
    createdAt: row.created_at.toISOString(),
  };
}

export async function createNotification(
  userId: string,
  ideaId: string,
  type: NotificationType,
  message: string
): Promise<void> {
  await pool.query(
    `INSERT INTO notifications (user_id, idea_id, type, message) VALUES ($1, $2, $3, $4)`,
    [userId, ideaId, type, message]
  );
}

// Fire-and-forget helper for call sites where a notification failure
// shouldn't fail the underlying action (status change, comment, vote).
export async function createNotificationSafely(
  userId: string,
  ideaId: string,
  type: NotificationType,
  message: string
): Promise<void> {
  try {
    await createNotification(userId, ideaId, type, message);
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}

export async function listNotifications(userId: string): Promise<Notification[]> {
  const { rows } = await pool.query<NotificationRow>(
    `SELECT id, idea_id, type, message, is_read, created_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [userId]
  );
  return rows.map(toNotification);
}

export async function markNotificationRead(id: string, userId: string): Promise<Notification | null> {
  const { rows } = await pool.query<NotificationRow>(
    `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2
     RETURNING id, idea_id, type, message, is_read, created_at`,
    [id, userId]
  );
  return rows[0] ? toNotification(rows[0]) : null;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await pool.query(`UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`, [userId]);
}
