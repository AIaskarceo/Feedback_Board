import type { User } from '@feedback-board/shared';
import { query } from './client';
import { getAdminEmails } from '../config/adminEmails';

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

const DEFAULT_ADMIN_EMAILS = new Set(getAdminEmails().map((email) => email.toLowerCase()));

// Upserts by clerk_id. Role is set once on first insert — 'admin' if the
// email is in ADMIN_EMAILS (a config-driven default-admin allowlist),
// otherwise the column default 'member' — and is never overwritten by
// subsequent syncs, so promoting/demoting a user afterward (done directly in
// the database) survives future logins.
export async function syncUser({ clerkId, email, name }: ClerkIdentity): Promise<User> {
  const role = DEFAULT_ADMIN_EMAILS.has(email.toLowerCase()) ? 'admin' : 'member';

  const result = await query<UserRow>(
    `INSERT INTO users (clerk_id, email, name, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (clerk_id)
     DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name
     RETURNING id, clerk_id, email, name, role`,
    [clerkId, email, name, role]
  );

  return toUser(result.rows[0]);
}
