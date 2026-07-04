import type { User } from '@feedback-board/shared';
import { pool } from '../db/client';

interface UserRow {
  id: string;
  clerk_id: string;
  email: string;
  name: string;
  role: 'member' | 'admin';
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    clerkId: row.clerk_id,
    email: row.email,
    name: row.name,
    role: row.role,
  };
}

export async function getUserById(id: string): Promise<User | null> {
  const { rows } = await pool.query<UserRow>(
    `SELECT id, clerk_id, email, name, role FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] ? toUser(rows[0]) : null;
}
