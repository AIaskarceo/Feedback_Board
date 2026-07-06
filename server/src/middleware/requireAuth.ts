import { createClerkClient, verifyToken } from '@clerk/backend';
import type { NextFunction, Request, Response } from 'express';
import type { User } from '@feedback-board/shared';
import { syncUser } from '../db/syncUser';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

if (!process.env.CLERK_SECRET_KEY) {
  throw new Error('CLERK_SECRET_KEY is not set.');
}

const secretKey = process.env.CLERK_SECRET_KEY;
const clerkClient = createClerkClient({ secretKey });

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }

  try {
    const { sub: clerkId } = await verifyToken(token, { secretKey });
    const clerkUser = await clerkClient.users.getUser(clerkId);

    const email =
      clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress ?? '';
    const name =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') ||
      clerkUser.username ||
      email;

    req.user = await syncUser({ clerkId, email, name });
    next();
  } catch (err) {
    console.error('requireAuth failed:', err);
    res.status(401).json({ error: 'Unauthorized.' });
  }
}
