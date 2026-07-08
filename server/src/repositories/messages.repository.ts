import type { IdeaMessage } from '@feedback-board/shared';
import { pool } from '../db/client';

interface MessageRow {
  id: string;
  idea_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: Date;
}

const MESSAGE_SELECT = `
  SELECT m.id, m.idea_id, m.sender_id, u.name AS sender_name, m.body, m.created_at
  FROM idea_messages m
  JOIN users u ON u.id = m.sender_id
`;

function toMessage(row: MessageRow): IdeaMessage {
  return {
    id: row.id,
    ideaId: row.idea_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    body: row.body,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listMessages(ideaId: string): Promise<IdeaMessage[]> {
  const { rows } = await pool.query<MessageRow>(
    `${MESSAGE_SELECT} WHERE m.idea_id = $1 ORDER BY m.created_at ASC`,
    [ideaId]
  );
  return rows.map(toMessage);
}

export async function createMessage(ideaId: string, senderId: string, body: string): Promise<IdeaMessage> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO idea_messages (idea_id, sender_id, body) VALUES ($1, $2, $3) RETURNING id`,
    [ideaId, senderId, body]
  );
  const { rows: messageRows } = await pool.query<MessageRow>(`${MESSAGE_SELECT} WHERE m.id = $1`, [rows[0].id]);
  return toMessage(messageRows[0]);
}
