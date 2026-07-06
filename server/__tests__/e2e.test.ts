import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';

// Fake Clerk identities keyed by the bearer token a test request presents.
// Real Clerk verification/network calls are mocked out; everything else
// (requireAuth, syncUser, the real Postgres tables) runs for real.
const { TOKEN_IDENTITIES } = vi.hoisted(() => ({
  TOKEN_IDENTITIES: {
    'token-submitter': { clerkId: 'clerk_submitter', email: 'submitter@example.com', name: 'Sam Submitter' },
    'token-voter': { clerkId: 'clerk_voter', email: 'voter@example.com', name: 'Vera Voter' },
    'token-admin': { clerkId: 'clerk_admin', email: 'admin@example.com', name: 'Amy Admin' },
  } as Record<string, { clerkId: string; email: string; name: string }>,
}));

vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(async (token: string) => {
    const identity = TOKEN_IDENTITIES[token];
    if (!identity) throw new Error('Invalid test token');
    return { sub: identity.clerkId };
  }),
  createClerkClient: vi.fn(() => ({
    users: {
      getUser: vi.fn(async (clerkId: string) => {
        const identity = Object.values(TOKEN_IDENTITIES).find((i) => i.clerkId === clerkId);
        if (!identity) throw new Error('Unknown test clerk user');
        return {
          id: identity.clerkId,
          primaryEmailAddress: { emailAddress: identity.email },
          emailAddresses: [{ emailAddress: identity.email }],
          firstName: identity.name,
          lastName: '',
          username: null,
        };
      }),
    },
  })),
}));

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(async () => ({ messageId: 'email_test' })),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: sendMock })),
  },
}));

import { buildTestApp } from './testApp';
import { pool, runMigration } from '../src/db/client';

const app = buildTestApp();

async function promoteToAdmin(clerkId: string) {
  await pool.query(`UPDATE users SET role = 'admin' WHERE clerk_id = $1`, [clerkId]);
}

describe('Feedback Board end-to-end flow', () => {
  beforeAll(async () => {
    await runMigration();
    await pool.query('TRUNCATE votes, ideas, users RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('walks sign-in -> submit -> vote -> resolve -> notify per api-contract.md', async () => {
    // Global rule: unauthenticated requests are rejected.
    const unauth = await request(app).get('/api/ideas');
    expect(unauth.status).toBe(401);
    expect(unauth.body).toEqual({ error: 'Unauthorized.' });

    // Submitter signs in (provisions their user row) and submits an idea.
    const createRes = await request(app)
      .post('/api/ideas')
      .set('Authorization', 'Bearer token-submitter')
      .send({ text: 'Add dark mode' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data).toMatchObject({
      text: 'Add dark mode',
      status: 'open',
      voteCount: 0,
      hasVoted: false,
      isOwn: true,
    });
    const ideaId: string = createRes.body.data.id;

    // Empty / overflow text is rejected.
    const emptyRes = await request(app)
      .post('/api/ideas')
      .set('Authorization', 'Bearer token-submitter')
      .send({ text: '   ' });
    expect(emptyRes.status).toBe(400);
    expect(emptyRes.body).toEqual({ error: 'Idea text cannot be empty.' });

    const overflowRes = await request(app)
      .post('/api/ideas')
      .set('Authorization', 'Bearer token-submitter')
      .send({ text: 'x'.repeat(201) });
    expect(overflowRes.status).toBe(400);
    expect(overflowRes.body).toEqual({ error: 'Idea text must be 200 characters or fewer.' });

    // A second user signs in and upvotes the idea.
    const voteRes = await request(app)
      .post(`/api/ideas/${ideaId}/vote`)
      .set('Authorization', 'Bearer token-voter');
    expect(voteRes.status).toBe(200);
    expect(voteRes.body.data).toMatchObject({ id: ideaId, voteCount: 1, hasVoted: true, isOwn: false });

    // The submitter cannot vote on their own idea.
    const selfVoteRes = await request(app)
      .post(`/api/ideas/${ideaId}/vote`)
      .set('Authorization', 'Bearer token-submitter');
    expect(selfVoteRes.status).toBe(400);
    expect(selfVoteRes.body).toEqual({ error: 'You cannot vote on your own idea.' });

    // The voter cannot vote twice.
    const dupVoteRes = await request(app)
      .post(`/api/ideas/${ideaId}/vote`)
      .set('Authorization', 'Bearer token-voter');
    expect(dupVoteRes.status).toBe(400);
    expect(dupVoteRes.body).toEqual({ error: 'You have already voted on this idea.' });

    // A non-admin cannot mark the idea done, and no email is sent.
    const nonAdminDoneRes = await request(app)
      .post(`/api/ideas/${ideaId}/done`)
      .set('Authorization', 'Bearer token-voter');
    expect(nonAdminDoneRes.status).toBe(403);
    expect(nonAdminDoneRes.body).toEqual({ error: 'Only admins can perform this action.' });
    expect(sendMock).not.toHaveBeenCalled();

    // Sign the admin identity in once (provisions their row as 'member'),
    // then promote directly in the DB — mirrors syncUser's documented
    // contract that role is never overwritten by a later sign-in sync.
    await request(app).get('/api/ideas').set('Authorization', 'Bearer token-admin');
    await promoteToAdmin(TOKEN_IDENTITIES['token-admin'].clerkId);

    // Admin marks the idea done -> triggers exactly one notification email.
    const doneRes = await request(app)
      .post(`/api/ideas/${ideaId}/done`)
      .set('Authorization', 'Bearer token-admin');
    expect(doneRes.status).toBe(200);
    expect(doneRes.body.data).toMatchObject({ id: ideaId, status: 'done' });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: TOKEN_IDENTITIES['token-submitter'].email })
    );

    // Re-marking an already-done idea is idempotent and does not re-notify.
    const redoneRes = await request(app)
      .post(`/api/ideas/${ideaId}/done`)
      .set('Authorization', 'Bearer token-admin');
    expect(redoneRes.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);

    // A non-existent idea 404s.
    const notFoundRes = await request(app)
      .post('/api/ideas/00000000-0000-0000-0000-000000000000/vote')
      .set('Authorization', 'Bearer token-voter');
    expect(notFoundRes.status).toBe(404);
    expect(notFoundRes.body).toEqual({ error: 'Idea not found.' });
  });
});
