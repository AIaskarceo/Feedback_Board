import type { User } from '@feedback-board/shared';
import { query } from './client';

interface ClerkIdentity {
  clerkId: string;
  email: string;
  name: string;
}

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

// Upserts by clerk_id. Role is set once on first insert (default 'member') and
// is never overwritten by subsequent syncs, so promoting a user to admin
// (done directly in the database) survives future logins.
export async function syncUser({ clerkId, email, name }: ClerkIdentity): Promise<User> {
  const result = await query<UserRow>(
    `INSERT INTO users (clerk_id, email, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (clerk_id)
     DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name
     RETURNING id, clerk_id, email, name, role`,
    [clerkId, email, name]
  );

  return toUser(result.rows[0]);
}
