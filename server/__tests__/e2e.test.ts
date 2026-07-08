import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

// Fake Clerk identities keyed by the bearer token a test request presents.
// Real Clerk verification/network calls are mocked out; everything else
// (requireAuth, syncUser, the real Postgres tables) runs for real.
const { TOKEN_IDENTITIES } = vi.hoisted(() => ({
  TOKEN_IDENTITIES: {
    'token-submitter': { clerkId: 'clerk_submitter', email: 'submitter@example.com', name: 'Sam Submitter' },
    'token-voter': { clerkId: 'clerk_voter', email: 'voter@example.com', name: 'Vera Voter' },
    'token-admin': { clerkId: 'clerk_admin', email: 'admin@example.com', name: 'Amy Admin' },
    'token-teamlead': { clerkId: 'clerk_teamlead', email: 'lead@example.com', name: 'Tara Lead' },
    'token-outsider': { clerkId: 'clerk_outsider', email: 'outsider@example.com', name: 'Otto Outsider' },
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

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// Provisions the user's row via a real sign-in request (same path production
// traffic takes), then returns their DB id. Auto-approves the new signup
// (mirroring an admin's PATCH /:id/approve) so existing tests don't have to
// deal with the pending-approval gate (server/src/middleware/requireApproved.ts)
// on every single request — that gate itself is covered by its own test.
async function signIn(token: string): Promise<string> {
  const res = await request(app).get('/api/me').set(auth(token));
  await pool.query(`UPDATE users SET approval_status = 'approved' WHERE clerk_id = $1`, [
    TOKEN_IDENTITIES[token].clerkId,
  ]);
  return res.body.data.id as string;
}

async function setRole(token: string, role: 'member' | 'team_lead' | 'company_admin') {
  await pool.query(`UPDATE users SET role = $2 WHERE clerk_id = $1`, [TOKEN_IDENTITIES[token].clerkId, role]);
}

// Mirrors updateUserTeam's behavior: sets the primary team and ensures a
// matching user_teams membership row exists (the real source of truth for
// team-only visibility/posting since multi-team support was added).
async function setTeam(token: string, teamId: string | null) {
  const clerkId = TOKEN_IDENTITIES[token].clerkId;
  await pool.query(`UPDATE users SET team_id = $2 WHERE clerk_id = $1`, [clerkId, teamId]);
  if (teamId) {
    await pool.query(
      `INSERT INTO user_teams (user_id, team_id) SELECT id, $2 FROM users WHERE clerk_id = $1 ON CONFLICT DO NOTHING`,
      [clerkId, teamId]
    );
  }
}

async function createTeamDirect(name: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(`INSERT INTO teams (name) VALUES ($1) RETURNING id`, [name]);
  return rows[0].id;
}

describe('Idea Board end-to-end flow', () => {
  beforeAll(async () => {
    await runMigration();
  });

  beforeEach(async () => {
    sendMock.mockClear();
    await pool.query(
      'TRUNCATE flags, notifications, admin_reveal_log, idea_merge_log, export_log, idea_resources, idea_documents, idea_collaborators, user_teams, idea_messages, idea_status_history, comments, votes, ideas, categories, teams, users RESTART IDENTITY CASCADE'
    );
    await pool.query('UPDATE app_settings SET retention_months = 6 WHERE id = 1');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/ideas');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized.' });
  });

  it('validates idea submission input', async () => {
    await signIn('token-submitter');

    const empty = await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: '   ' });
    expect(empty.status).toBe(400);
    expect(empty.body).toEqual({ error: 'Idea title cannot be empty.' });

    const overflowTitle = await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: 'x'.repeat(201) });
    expect(overflowTitle.status).toBe(400);
    expect(overflowTitle.body).toEqual({ error: 'Idea title must be 200 characters or fewer.' });

    const overflowDescription = await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: 'Add dark mode', description: 'x'.repeat(2001) });
    expect(overflowDescription.status).toBe(400);
    expect(overflowDescription.body).toEqual({
      error: 'Idea description must be 2000 characters or fewer.',
    });

    const teamWithoutMembership = await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: 'Add dark mode', visibility: 'team' });
    expect(teamWithoutMembership.status).toBe(400);
    expect(teamWithoutMembership.body).toEqual({
      error: 'You must belong to a team to submit a team-only idea.',
    });
  });

  it('walks the full lifecycle to done and notifies the submitter exactly once', async () => {
    await signIn('token-submitter');
    await signIn('token-admin');
    await setRole('token-admin', 'company_admin');

    const createRes = await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: 'Add dark mode', description: 'Easier on the eyes at night.' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data).toMatchObject({
      title: 'Add dark mode',
      description: 'Easier on the eyes at night.',
      status: 'submitted',
      visibility: 'company',
      voteCount: 0,
      commentCount: 0,
      isOwn: true,
    });
    const ideaId: string = createRes.body.data.id;

    // A non team_lead/admin cannot drive the lifecycle at all.
    const forbidden = await request(app)
      .patch(`/api/ideas/${ideaId}/status`)
      .set(auth('token-submitter'))
      .send({ status: 'under_review' });
    expect(forbidden.status).toBe(403);

    const toReview = await request(app)
      .patch(`/api/ideas/${ideaId}/status`)
      .set(auth('token-admin'))
      .send({ status: 'under_review' });
    expect(toReview.status).toBe(200);
    expect(toReview.body.data.status).toBe('under_review');

    const toPlanned = await request(app)
      .patch(`/api/ideas/${ideaId}/status`)
      .set(auth('token-admin'))
      .send({ status: 'planned' });
    expect(toPlanned.status).toBe(200);

    const toInProgress = await request(app)
      .patch(`/api/ideas/${ideaId}/status`)
      .set(auth('token-admin'))
      .send({ status: 'in_progress' });
    expect(toInProgress.status).toBe(200);

    const toDone = await request(app)
      .patch(`/api/ideas/${ideaId}/status`)
      .set(auth('token-admin'))
      .send({ status: 'done' });
    expect(toDone.status).toBe(200);
    expect(toDone.body.data.status).toBe('done');
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: TOKEN_IDENTITIES['token-submitter'].email })
    );

    const history = await request(app)
      .get(`/api/ideas/${ideaId}/status-history`)
      .set(auth('token-admin'));
    expect(history.status).toBe(200);
    expect(history.body.data.map((entry: { fromStatus: string | null; toStatus: string }) => [entry.fromStatus, entry.toStatus])).toEqual([
      [null, 'submitted'],
      ['submitted', 'under_review'],
      ['under_review', 'planned'],
      ['planned', 'in_progress'],
      ['in_progress', 'done'],
    ]);
  });

  it('rejects illegal transitions and requires a reason to decline', async () => {
    await signIn('token-submitter');
    await signIn('token-admin');
    await setRole('token-admin', 'company_admin');

    const createRes = await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: 'Skip the queue' });
    const ideaId: string = createRes.body.data.id;

    const illegal = await request(app)
      .patch(`/api/ideas/${ideaId}/status`)
      .set(auth('token-admin'))
      .send({ status: 'done' });
    expect(illegal.status).toBe(400);
    expect(illegal.body.error).toMatch(/Cannot move an idea from 'submitted' to 'done'/);

    const missingReason = await request(app)
      .patch(`/api/ideas/${ideaId}/status`)
      .set(auth('token-admin'))
      .send({ status: 'declined' });
    expect(missingReason.status).toBe(400);
    expect(missingReason.body).toEqual({ error: 'A reason is required when declining an idea.' });

    const declined = await request(app)
      .patch(`/api/ideas/${ideaId}/status`)
      .set(auth('token-admin'))
      .send({ status: 'declined', reason: 'Not aligned with roadmap.' });
    expect(declined.status).toBe(200);
    expect(declined.body.data.status).toBe('declined');

    const terminal = await request(app)
      .patch(`/api/ideas/${ideaId}/status`)
      .set(auth('token-admin'))
      .send({ status: 'under_review' });
    expect(terminal.status).toBe(400);
  });

  it('enforces team-scoped visibility and management', async () => {
    const alphaTeamId = await createTeamDirect('Team Alpha');
    const betaTeamId = await createTeamDirect('Team Beta');

    await signIn('token-teamlead');
    await setRole('token-teamlead', 'team_lead');
    await setTeam('token-teamlead', alphaTeamId);

    await signIn('token-outsider');
    await setTeam('token-outsider', betaTeamId);

    await signIn('token-admin');
    await setRole('token-admin', 'company_admin');

    const createRes = await request(app)
      .post('/api/ideas')
      .set(auth('token-teamlead'))
      .send({ title: 'Team-only rollout plan', visibility: 'team' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data).toMatchObject({ visibility: 'team', teamId: alphaTeamId });
    const ideaId: string = createRes.body.data.id;

    const outsiderList = await request(app).get('/api/ideas').set(auth('token-outsider'));
    expect(outsiderList.body.data.find((idea: { id: string }) => idea.id === ideaId)).toBeUndefined();

    const outsiderDirect = await request(app)
      .post(`/api/ideas/${ideaId}/vote`)
      .set(auth('token-outsider'));
    expect(outsiderDirect.status).toBe(404);

    const teamLeadList = await request(app).get('/api/ideas').set(auth('token-teamlead'));
    expect(teamLeadList.body.data.find((idea: { id: string }) => idea.id === ideaId)).toBeDefined();

    const adminList = await request(app).get('/api/ideas').set(auth('token-admin'));
    expect(adminList.body.data.find((idea: { id: string }) => idea.id === ideaId)).toBeDefined();

    // An outsider team_lead (different team) can't even see this team-scoped
    // idea, so the attempt 404s rather than leaking its existence via a 403.
    await setRole('token-outsider', 'team_lead');
    const outsiderLeadTransition = await request(app)
      .patch(`/api/ideas/${ideaId}/status`)
      .set(auth('token-outsider'))
      .send({ status: 'under_review' });
    expect(outsiderLeadTransition.status).toBe(404);

    const ownLeadTransition = await request(app)
      .patch(`/api/ideas/${ideaId}/status`)
      .set(auth('token-teamlead'))
      .send({ status: 'under_review' });
    expect(ownLeadTransition.status).toBe(200);
  });

  it('supports threaded comments with role-gated moderation', async () => {
    await signIn('token-submitter');
    await signIn('token-voter');
    await signIn('token-admin');
    await setRole('token-admin', 'company_admin');

    const createRes = await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: 'Add a changelog page' });
    const ideaId: string = createRes.body.data.id;

    const rootComment = await request(app)
      .post(`/api/ideas/${ideaId}/comments`)
      .set(auth('token-voter'))
      .send({ body: 'Love this idea!' });
    expect(rootComment.status).toBe(201);
    const rootCommentId: string = rootComment.body.data.id;

    const badParent = await request(app)
      .post(`/api/ideas/${ideaId}/comments`)
      .set(auth('token-submitter'))
      .send({ body: 'Thanks!', parentCommentId: '00000000-0000-0000-0000-000000000000' });
    expect(badParent.status).toBe(400);
    expect(badParent.body).toEqual({ error: 'Parent comment not found.' });

    const reply = await request(app)
      .post(`/api/ideas/${ideaId}/comments`)
      .set(auth('token-submitter'))
      .send({ body: 'Thanks!', parentCommentId: rootCommentId });
    expect(reply.status).toBe(201);
    expect(reply.body.data.parentCommentId).toBe(rootCommentId);

    const list = await request(app).get(`/api/ideas/${ideaId}/comments`).set(auth('token-voter'));
    expect(list.body.data).toHaveLength(2);

    const forbiddenDelete = await request(app)
      .delete(`/api/comments/${rootCommentId}`)
      .set(auth('token-voter'));
    expect(forbiddenDelete.status).toBe(403);

    const adminDelete = await request(app)
      .delete(`/api/comments/${rootCommentId}`)
      .set(auth('token-admin'));
    expect(adminDelete.status).toBe(200);
    expect(adminDelete.body.data.body).toBe('[comment removed]');

    const listAfterDelete = await request(app).get(`/api/ideas/${ideaId}/comments`).set(auth('token-voter'));
    expect(listAfterDelete.body.data).toHaveLength(2);
    expect(listAfterDelete.body.data.find((c: { id: string }) => c.id === rootCommentId).body).toBe(
      '[comment removed]'
    );
  });

  it('mirrors username to the display name', async () => {
    await signIn('token-submitter');
    await signIn('token-admin');
    await setRole('token-admin', 'company_admin');

    const users = await request(app).get('/api/users').set(auth('token-admin'));
    const submitter = users.body.data.find(
      (u: { email: string }) => u.email === TOKEN_IDENTITIES['token-submitter'].email
    );

    expect(submitter.username).toBe(TOKEN_IDENTITIES['token-submitter'].name);
    expect(submitter.username).toBe(submitter.name);
  });

  it('supports "my ideas" (oldest-first, by submitter) and searching by name', async () => {
    await signIn('token-submitter');
    await signIn('token-voter');

    const first = await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: 'First idea' });
    const second = await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: 'Second idea' });
    await request(app).post('/api/ideas').set(auth('token-voter')).send({ title: "Voter's idea" });

    const myIdeas = await request(app)
      .get(`/api/ideas?submitterId=${first.body.data.submitterId}&sort=oldest`)
      .set(auth('token-submitter'));
    expect(myIdeas.status).toBe(200);
    expect(myIdeas.body.data.map((i: { id: string }) => i.id)).toEqual([first.body.data.id, second.body.data.id]);

    const nameSearch = await request(app)
      .get(`/api/ideas?search=${encodeURIComponent(TOKEN_IDENTITIES['token-submitter'].name)}`)
      .set(auth('token-voter'));
    expect(nameSearch.status).toBe(200);
    expect(nameSearch.body.data.map((i: { id: string }) => i.id).sort()).toEqual(
      [first.body.data.id, second.body.data.id].sort()
    );
  });

  it('keeps private idea messages restricted to the submitter and managers', async () => {
    await signIn('token-submitter');
    await signIn('token-voter');
    await signIn('token-admin');
    await setRole('token-admin', 'company_admin');

    const createRes = await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: 'Add a referral program' });
    const ideaId: string = createRes.body.data.id;

    const outsiderRead = await request(app).get(`/api/ideas/${ideaId}/messages`).set(auth('token-voter'));
    expect(outsiderRead.status).toBe(403);

    const outsiderWrite = await request(app)
      .post(`/api/ideas/${ideaId}/messages`)
      .set(auth('token-voter'))
      .send({ body: 'Sneaking in' });
    expect(outsiderWrite.status).toBe(403);

    const adminMessage = await request(app)
      .post(`/api/ideas/${ideaId}/messages`)
      .set(auth('token-admin'))
      .send({ body: 'Can you share more detail on the referral payout?' });
    expect(adminMessage.status).toBe(201);
    expect(adminMessage.body.data).toMatchObject({ senderName: 'Amy Admin' });

    const submitterReply = await request(app)
      .post(`/api/ideas/${ideaId}/messages`)
      .set(auth('token-submitter'))
      .send({ body: 'Sure — 10% of first purchase.' });
    expect(submitterReply.status).toBe(201);

    const submitterRead = await request(app)
      .get(`/api/ideas/${ideaId}/messages`)
      .set(auth('token-submitter'));
    expect(submitterRead.status).toBe(200);
    expect(submitterRead.body.data).toHaveLength(2);
    expect(submitterRead.body.data.map((m: { body: string }) => m.body)).toEqual([
      'Can you share more detail on the referral payout?',
      'Sure — 10% of first purchase.',
    ]);

    const emptyMessage = await request(app)
      .post(`/api/ideas/${ideaId}/messages`)
      .set(auth('token-admin'))
      .send({ body: '   ' });
    expect(emptyMessage.status).toBe(400);
    expect(emptyMessage.body).toEqual({ error: 'Message cannot be empty.' });
  });

  it('flags similar ideas as possible duplicates', async () => {
    await signIn('token-submitter');
    await signIn('token-voter');

    await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: 'Add dark mode to the settings page' });

    const similar = await request(app)
      .post('/api/ideas/check-duplicates')
      .set(auth('token-voter'))
      .send({ title: 'Add a dark mode option to settings' });
    expect(similar.status).toBe(200);
    expect(similar.body.data.length).toBeGreaterThan(0);
    expect(similar.body.data[0].idea.title).toBe('Add dark mode to the settings page');
    expect(similar.body.data[0].similarity).toBeGreaterThan(0);

    const different = await request(app)
      .post('/api/ideas/check-duplicates')
      .set(auth('token-voter'))
      .send({ title: 'Completely unrelated cafeteria menu request' });
    expect(different.status).toBe(200);
    expect(different.body.data).toEqual([]);
  });

  it('masks anonymous idea submitters until an admin explicitly reveals them', async () => {
    await signIn('token-submitter');
    await signIn('token-voter');
    await signIn('token-admin');
    await setRole('token-admin', 'company_admin');

    const createRes = await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: 'Sensitive feedback about process', isAnonymous: true });
    const ideaId: string = createRes.body.data.id;
    expect(createRes.body.data.submitterName).toBe('Sam Submitter'); // own idea, not masked for self

    const voterView = await request(app).get('/api/ideas').set(auth('token-voter'));
    const voterIdea = voterView.body.data.find((i: { id: string }) => i.id === ideaId);
    expect(voterIdea.submitterName).toBe('Anonymous');
    expect(voterIdea.submitterId).toBe('');

    const adminView = await request(app).get('/api/ideas').set(auth('token-admin'));
    const adminIdea = adminView.body.data.find((i: { id: string }) => i.id === ideaId);
    expect(adminIdea.submitterName).toBe('Anonymous');

    const forbiddenReveal = await request(app).get(`/api/ideas/${ideaId}/identity`).set(auth('token-voter'));
    expect(forbiddenReveal.status).toBe(403);

    const reveal = await request(app).get(`/api/ideas/${ideaId}/identity`).set(auth('token-admin'));
    expect(reveal.status).toBe(200);
    expect(reveal.body.data.submitterName).toBe('Sam Submitter');

    const revealLog = await request(app).get('/api/admin-reveal-log').set(auth('token-admin'));
    expect(revealLog.status).toBe(200);
    expect(revealLog.body.data).toHaveLength(1);
    expect(revealLog.body.data[0]).toMatchObject({ ideaId, adminName: 'Amy Admin' });
  });

  it('scopes analytics to the caller and gates it to team_lead/admin', async () => {
    await signIn('token-submitter');
    await signIn('token-admin');
    await setRole('token-admin', 'company_admin');

    const memberAccess = await request(app).get('/api/analytics').set(auth('token-submitter'));
    expect(memberAccess.status).toBe(403);

    await request(app).post('/api/ideas').set(auth('token-submitter')).send({ title: 'Analytics test idea' });

    const adminAnalytics = await request(app).get('/api/analytics').set(auth('token-admin'));
    expect(adminAnalytics.status).toBe(200);
    expect(adminAnalytics.body.data.ideasByStatus.some((s: { status: string }) => s.status === 'submitted')).toBe(
      true
    );
  });

  it('supports flagging content, team-scoped moderation, and user restriction', async () => {
    await signIn('token-submitter');
    await signIn('token-voter');
    await signIn('token-admin');
    await setRole('token-admin', 'company_admin');

    const ideaRes = await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: 'Idea with a bad comment' });
    const ideaId: string = ideaRes.body.data.id;

    const commentRes = await request(app)
      .post(`/api/ideas/${ideaId}/comments`)
      .set(auth('token-voter'))
      .send({ body: 'inappropriate comment' });
    const commentId: string = commentRes.body.data.id;

    const flagRes = await request(app)
      .post('/api/flags')
      .set(auth('token-submitter'))
      .send({ contentType: 'comment', contentId: commentId, reason: 'Inappropriate language' });
    expect(flagRes.status).toBe(201);
    const flagId: string = flagRes.body.data.id;

    const memberList = await request(app).get('/api/flags').set(auth('token-submitter'));
    expect(memberList.status).toBe(403);

    const adminList = await request(app).get('/api/flags').set(auth('token-admin'));
    expect(adminList.status).toBe(200);
    expect(adminList.body.data.some((f: { id: string }) => f.id === flagId)).toBe(true);

    const removeRes = await request(app)
      .patch(`/api/flags/${flagId}`)
      .set(auth('token-admin'))
      .send({ status: 'removed' });
    expect(removeRes.status).toBe(200);
    expect(removeRes.body.data.status).toBe('removed');

    const commentsAfter = await request(app).get(`/api/ideas/${ideaId}/comments`).set(auth('token-submitter'));
    expect(commentsAfter.body.data.find((c: { id: string }) => c.id === commentId).body).toBe(
      '[comment removed]'
    );

    // Restrict the voter's posting ability.
    const usersRes = await request(app).get('/api/users').set(auth('token-admin'));
    const voterId = usersRes.body.data.find(
      (u: { email: string }) => u.email === TOKEN_IDENTITIES['token-voter'].email
    ).id;

    const restrictRes = await request(app)
      .patch(`/api/users/${voterId}/restrict`)
      .set(auth('token-admin'))
      .send({ isRestricted: true });
    expect(restrictRes.status).toBe(200);
    expect(restrictRes.body.data.isRestricted).toBe(true);

    const blockedSubmit = await request(app)
      .post('/api/ideas')
      .set(auth('token-voter'))
      .send({ title: 'Should be blocked' });
    expect(blockedSubmit.status).toBe(403);

    const blockedComment = await request(app)
      .post(`/api/ideas/${ideaId}/comments`)
      .set(auth('token-voter'))
      .send({ body: 'Should also be blocked' });
    expect(blockedComment.status).toBe(403);
  });

  it('creates in-app notifications for status changes and comments', async () => {
    await signIn('token-submitter');
    await signIn('token-voter');
    await signIn('token-admin');
    await setRole('token-admin', 'company_admin');

    const ideaRes = await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: 'Notify me please' });
    const ideaId: string = ideaRes.body.data.id;

    await request(app).post(`/api/ideas/${ideaId}/vote`).set(auth('token-voter'));

    await request(app)
      .patch(`/api/ideas/${ideaId}/status`)
      .set(auth('token-admin'))
      .send({ status: 'under_review' });

    const submitterNotifs = await request(app).get('/api/notifications').set(auth('token-submitter'));
    expect(submitterNotifs.body.data.some((n: { type: string }) => n.type === 'status_change')).toBe(true);

    const voterNotifs = await request(app).get('/api/notifications').set(auth('token-voter'));
    expect(voterNotifs.body.data.some((n: { type: string }) => n.type === 'voted_status_change')).toBe(true);

    await request(app)
      .post(`/api/ideas/${ideaId}/comments`)
      .set(auth('token-voter'))
      .send({ body: 'Nice idea!' });

    const submitterNotifsAfterComment = await request(app)
      .get('/api/notifications')
      .set(auth('token-submitter'));
    const commentNotif = submitterNotifsAfterComment.body.data.find((n: { type: string }) => n.type === 'comment');
    expect(commentNotif).toBeDefined();
    expect(commentNotif.isRead).toBe(false);

    const markRead = await request(app)
      .patch(`/api/notifications/${commentNotif.id}/read`)
      .set(auth('token-submitter'));
    expect(markRead.status).toBe(200);
    expect(markRead.body.data.isRead).toBe(true);

    const readAll = await request(app).post('/api/notifications/read-all').set(auth('token-submitter'));
    expect(readAll.status).toBe(200);

    const afterReadAll = await request(app).get('/api/notifications').set(auth('token-submitter'));
    expect(afterReadAll.body.data.every((n: { isRead: boolean }) => n.isRead)).toBe(true);
  });

  it('sends a weekly digest only to users opted into digest notifications', async () => {
    await signIn('token-submitter');
    await signIn('token-voter');
    await signIn('token-admin');
    await setRole('token-admin', 'company_admin');

    await request(app)
      .patch('/api/me/notification-preference')
      .set(auth('token-voter'))
      .send({ notificationPreference: 'digest' });

    await request(app).post('/api/ideas').set(auth('token-submitter')).send({ title: 'Fresh idea for the digest' });

    sendMock.mockClear();
    const digestRes = await request(app).post('/api/admin/send-digest').set(auth('token-admin'));
    expect(digestRes.status).toBe(200);
    expect(digestRes.body.data.sent).toBeGreaterThanOrEqual(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: TOKEN_IDENTITIES['token-voter'].email, subject: expect.stringContaining('digest') })
    );
  });

  it('gates team, category, and user management endpoints to admins', async () => {
    await signIn('token-submitter');
    await signIn('token-teamlead');
    await setRole('token-teamlead', 'team_lead');
    await signIn('token-admin');
    await setRole('token-admin', 'company_admin');

    const memberCreateTeam = await request(app)
      .post('/api/teams')
      .set(auth('token-submitter'))
      .send({ name: 'Engineering' });
    expect(memberCreateTeam.status).toBe(403);

    const adminCreateTeam = await request(app)
      .post('/api/teams')
      .set(auth('token-admin'))
      .send({ name: 'Engineering' });
    expect(adminCreateTeam.status).toBe(201);

    const duplicateTeam = await request(app)
      .post('/api/teams')
      .set(auth('token-admin'))
      .send({ name: 'Engineering' });
    expect(duplicateTeam.status).toBe(400);

    const memberCreateCategory = await request(app)
      .post('/api/categories')
      .set(auth('token-submitter'))
      .send({ name: 'Process' });
    expect(memberCreateCategory.status).toBe(403);

    const leadCreateCategory = await request(app)
      .post('/api/categories')
      .set(auth('token-teamlead'))
      .send({ name: 'Process' });
    expect(leadCreateCategory.status).toBe(201);

    const memberListUsers = await request(app).get('/api/users').set(auth('token-submitter'));
    expect(memberListUsers.status).toBe(403);

    const adminListUsers = await request(app).get('/api/users').set(auth('token-admin'));
    expect(adminListUsers.status).toBe(200);
    expect(adminListUsers.body.data.length).toBeGreaterThanOrEqual(3);

    const submitterId = adminListUsers.body.data.find(
      (u: { email: string }) => u.email === TOKEN_IDENTITIES['token-submitter'].email
    ).id;

    const invalidRole = await request(app)
      .patch(`/api/users/${submitterId}/role`)
      .set(auth('token-admin'))
      .send({ role: 'superuser' });
    expect(invalidRole.status).toBe(400);

    const promote = await request(app)
      .patch(`/api/users/${submitterId}/role`)
      .set(auth('token-admin'))
      .send({ role: 'team_lead' });
    expect(promote.status).toBe(200);
    expect(promote.body.data.role).toBe('team_lead');

    const assignTeam = await request(app)
      .patch(`/api/users/${submitterId}/team`)
      .set(auth('token-admin'))
      .send({ teamId: adminCreateTeam.body.data.id });
    expect(assignTeam.status).toBe(200);
    expect(assignTeam.body.data.teamId).toBe(adminCreateTeam.body.data.id);

    const clearTeam = await request(app)
      .patch(`/api/users/${submitterId}/team`)
      .set(auth('token-admin'))
      .send({ teamId: null });
    expect(clearTeam.status).toBe(200);
    expect(clearTeam.body.data.teamId).toBeNull();
  });

  it('preserves vote self/duplicate rejection and 404 handling', async () => {
    await signIn('token-submitter');
    await signIn('token-voter');

    const createRes = await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: 'Add dark mode' });
    const ideaId: string = createRes.body.data.id;

    const voteRes = await request(app).post(`/api/ideas/${ideaId}/vote`).set(auth('token-voter'));
    expect(voteRes.status).toBe(200);
    expect(voteRes.body.data).toMatchObject({ id: ideaId, voteCount: 1, hasVoted: true, isOwn: false });

    const selfVoteRes = await request(app).post(`/api/ideas/${ideaId}/vote`).set(auth('token-submitter'));
    expect(selfVoteRes.status).toBe(400);
    expect(selfVoteRes.body).toEqual({ error: 'You cannot vote on your own idea.' });

    const dupVoteRes = await request(app).post(`/api/ideas/${ideaId}/vote`).set(auth('token-voter'));
    expect(dupVoteRes.status).toBe(400);
    expect(dupVoteRes.body).toEqual({ error: 'You have already voted on this idea.' });

    const notFoundRes = await request(app)
      .post('/api/ideas/00000000-0000-0000-0000-000000000000/vote')
      .set(auth('token-voter'));
    expect(notFoundRes.status).toBe(404);
    expect(notFoundRes.body).toEqual({ error: 'Idea not found.' });
  });

  it('merges a duplicate idea into another, carrying over votes/comments', async () => {
    await signIn('token-submitter');
    await signIn('token-voter');
    await signIn('token-admin');
    await setRole('token-admin', 'company_admin');

    const targetRes = await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: 'Add dark mode' });
    const sourceRes = await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: 'Dark mode please' });
    const targetId: string = targetRes.body.data.id;
    const sourceId: string = sourceRes.body.data.id;

    await request(app).post(`/api/ideas/${sourceId}/vote`).set(auth('token-voter'));
    await request(app)
      .post(`/api/ideas/${sourceId}/comments`)
      .set(auth('token-voter'))
      .send({ body: 'Same as my idea!' });

    const selfMerge = await request(app)
      .post(`/api/ideas/${sourceId}/merge`)
      .set(auth('token-admin'))
      .send({ intoIdeaId: sourceId });
    expect(selfMerge.status).toBe(400);
    expect(selfMerge.body).toEqual({ error: 'An idea cannot be merged into itself.' });

    const memberAttempt = await request(app)
      .post(`/api/ideas/${sourceId}/merge`)
      .set(auth('token-submitter'))
      .send({ intoIdeaId: targetId });
    expect(memberAttempt.status).toBe(403);
    expect(memberAttempt.body).toEqual({ error: 'You do not have permission to perform this action.' });

    const mergeRes = await request(app)
      .post(`/api/ideas/${sourceId}/merge`)
      .set(auth('token-admin'))
      .send({ intoIdeaId: targetId });
    expect(mergeRes.status).toBe(200);
    expect(mergeRes.body.data.source).toMatchObject({ id: sourceId, status: 'declined', mergedIntoId: targetId });
    expect(mergeRes.body.data.target).toMatchObject({ id: targetId, voteCount: 1, commentCount: 1 });

    const alreadyTerminal = await request(app)
      .post(`/api/ideas/${sourceId}/merge`)
      .set(auth('token-admin'))
      .send({ intoIdeaId: targetId });
    expect(alreadyTerminal.status).toBe(400);
    expect(alreadyTerminal.body).toEqual({ error: 'Cannot merge an idea that is already done or declined.' });
  });

  it('bulk re-tags ideas the caller can manage, validating input', async () => {
    await signIn('token-submitter');
    await signIn('token-admin');
    await setRole('token-admin', 'company_admin');

    const categoryRes = await request(app)
      .post('/api/categories')
      .set(auth('token-admin'))
      .send({ name: 'Ops' });
    const categoryId: string = categoryRes.body.data.id;

    const idea1 = await request(app).post('/api/ideas').set(auth('token-submitter')).send({ title: 'Idea 1' });
    const idea2 = await request(app).post('/api/ideas').set(auth('token-submitter')).send({ title: 'Idea 2' });

    const emptyIds = await request(app)
      .patch('/api/ideas/bulk-retag')
      .set(auth('token-admin'))
      .send({ ideaIds: [] });
    expect(emptyIds.status).toBe(400);
    expect(emptyIds.body).toEqual({ error: 'ideaIds must be a non-empty array.' });

    const unknownCategory = await request(app)
      .patch('/api/ideas/bulk-retag')
      .set(auth('token-admin'))
      .send({ ideaIds: [idea1.body.data.id], categoryId: '00000000-0000-0000-0000-000000000000' });
    expect(unknownCategory.status).toBe(400);
    expect(unknownCategory.body).toEqual({ error: 'Category not found.' });

    const memberAttempt = await request(app)
      .patch('/api/ideas/bulk-retag')
      .set(auth('token-submitter'))
      .send({ ideaIds: [idea1.body.data.id], categoryId });
    expect(memberAttempt.status).toBe(403);
    expect(memberAttempt.body).toEqual({ error: 'You do not have permission to perform this action.' });

    const res = await request(app)
      .patch('/api/ideas/bulk-retag')
      .set(auth('token-admin'))
      .send({ ideaIds: [idea1.body.data.id, idea2.body.data.id, '00000000-0000-0000-0000-000000000000'], categoryId });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every((idea: { categoryId: string }) => idea.categoryId === categoryId)).toBe(true);
  });

  it('exports ideas as JSON and CSV (admin only) and logs each export', async () => {
    await signIn('token-submitter');
    await signIn('token-admin');
    await setRole('token-admin', 'company_admin');

    await request(app).post('/api/ideas').set(auth('token-submitter')).send({ title: 'Exportable idea' });

    const forbidden = await request(app).get('/api/export/ideas').set(auth('token-submitter'));
    expect(forbidden.status).toBe(403);

    const jsonRes = await request(app).get('/api/export/ideas?format=json').set(auth('token-admin'));
    expect(jsonRes.status).toBe(200);
    expect(jsonRes.body.data.some((idea: { title: string }) => idea.title === 'Exportable idea')).toBe(true);

    const csvRes = await request(app).get('/api/export/ideas?format=csv').set(auth('token-admin'));
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers['content-type']).toMatch(/text\/csv/);
    expect(csvRes.text).toContain('Exportable idea');

    const logRes = await request(app).get('/api/admin/export-log').set(auth('token-admin'));
    expect(logRes.status).toBe(200);
    expect(logRes.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('configures retention and archives stale done ideas on demand', async () => {
    await signIn('token-submitter');
    await signIn('token-admin');
    await setRole('token-admin', 'company_admin');

    const settingsRes = await request(app).get('/api/admin/settings').set(auth('token-admin'));
    expect(settingsRes.status).toBe(200);
    expect(settingsRes.body.data).toEqual({ retentionMonths: 6 });

    const invalidUpdate = await request(app)
      .patch('/api/admin/settings')
      .set(auth('token-admin'))
      .send({ retentionMonths: -1 });
    expect(invalidUpdate.status).toBe(400);

    const updateRes = await request(app)
      .patch('/api/admin/settings')
      .set(auth('token-admin'))
      .send({ retentionMonths: 1 });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data).toEqual({ retentionMonths: 1 });

    const createRes = await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: 'Stale idea' });
    const ideaId: string = createRes.body.data.id;

    await request(app).patch(`/api/ideas/${ideaId}/status`).set(auth('token-admin')).send({ status: 'planned' });
    await request(app).patch(`/api/ideas/${ideaId}/status`).set(auth('token-admin')).send({ status: 'in_progress' });
    await request(app).patch(`/api/ideas/${ideaId}/status`).set(auth('token-admin')).send({ status: 'done' });

    await pool.query(`UPDATE ideas SET created_at = now() - interval '2 months' WHERE id = $1`, [ideaId]);
    await pool.query(`UPDATE idea_status_history SET changed_at = now() - interval '2 months' WHERE idea_id = $1`, [
      ideaId,
    ]);

    const runRes = await request(app).post('/api/admin/run-retention').set(auth('token-admin'));
    expect(runRes.status).toBe(200);
    expect(runRes.body.data.archived).toBeGreaterThanOrEqual(1);

    const listRes = await request(app).get('/api/ideas').set(auth('token-submitter'));
    expect(listRes.body.data.some((idea: { id: string }) => idea.id === ideaId)).toBe(false);

    const includeArchivedRes = await request(app)
      .get('/api/ideas?includeArchived=true')
      .set(auth('token-submitter'));
    expect(includeArchivedRes.body.data.some((idea: { id: string }) => idea.id === ideaId)).toBe(true);
  });

  it('lets the submitter attach research links to their idea and view/remove them', async () => {
    await signIn('token-submitter');
    await signIn('token-voter');

    const createRes = await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: 'Add dark mode' });
    const ideaId: string = createRes.body.data.id;

    const outsiderAttempt = await request(app)
      .post(`/api/ideas/${ideaId}/resources`)
      .set(auth('token-voter'))
      .send({ url: 'https://example.com/research', label: 'Prior art' });
    expect(outsiderAttempt.status).toBe(403);
    expect(outsiderAttempt.body).toEqual({
      error: 'Only the submitter can attach research links to this idea.',
    });

    const invalidUrl = await request(app)
      .post(`/api/ideas/${ideaId}/resources`)
      .set(auth('token-submitter'))
      .send({ url: 'not-a-url' });
    expect(invalidUrl.status).toBe(400);

    const addRes = await request(app)
      .post(`/api/ideas/${ideaId}/resources`)
      .set(auth('token-submitter'))
      .send({ url: 'https://example.com/research', label: 'Prior art' });
    expect(addRes.status).toBe(201);
    expect(addRes.body.data).toMatchObject({
      ideaId,
      url: 'https://example.com/research',
      label: 'Prior art',
      addedByName: 'Sam Submitter',
    });
    const resourceId: string = addRes.body.data.id;

    const listRes = await request(app).get(`/api/ideas/${ideaId}/resources`).set(auth('token-voter'));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);

    const deleteByOutsider = await request(app)
      .delete(`/api/ideas/${ideaId}/resources/${resourceId}`)
      .set(auth('token-voter'));
    expect(deleteByOutsider.status).toBe(403);

    const deleteRes = await request(app)
      .delete(`/api/ideas/${ideaId}/resources/${resourceId}`)
      .set(auth('token-submitter'));
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toEqual({ data: null });

    const listAfterDelete = await request(app).get(`/api/ideas/${ideaId}/resources`).set(auth('token-voter'));
    expect(listAfterDelete.body.data).toHaveLength(0);
  });

  it('lets the submitter attach a full-description document, downloads it intact, and enforces type/size/ownership', async () => {
    await signIn('token-submitter');
    await signIn('token-voter');

    const createRes = await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: 'Add dark mode', description: 'Short summary.' });
    const ideaId: string = createRes.body.data.id;

    const fileContents = Buffer.from('Full write-up of the idea, in detail.');
    const dataBase64 = fileContents.toString('base64');

    const outsiderAttempt = await request(app)
      .post(`/api/ideas/${ideaId}/documents`)
      .set(auth('token-voter'))
      .send({ filename: 'spec.txt', mimeType: 'text/plain', dataBase64 });
    expect(outsiderAttempt.status).toBe(403);
    expect(outsiderAttempt.body).toEqual({ error: 'Only the submitter can attach documents to this idea.' });

    const badType = await request(app)
      .post(`/api/ideas/${ideaId}/documents`)
      .set(auth('token-submitter'))
      .send({ filename: 'spec.exe', mimeType: 'application/x-msdownload', dataBase64 });
    expect(badType.status).toBe(400);
    expect(badType.body).toEqual({
      error: 'Unsupported file type. Allowed: PDF, Word, plain text, PNG, JPEG.',
    });

    const uploadRes = await request(app)
      .post(`/api/ideas/${ideaId}/documents`)
      .set(auth('token-submitter'))
      .send({ filename: 'spec.txt', mimeType: 'text/plain', dataBase64 });
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.data).toMatchObject({
      ideaId,
      filename: 'spec.txt',
      mimeType: 'text/plain',
      sizeBytes: fileContents.length,
      uploadedByName: 'Sam Submitter',
    });
    const documentId: string = uploadRes.body.data.id;

    const listRes = await request(app).get(`/api/ideas/${ideaId}/documents`).set(auth('token-voter'));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].filename).toBe('spec.txt');

    const downloadRes = await request(app)
      .get(`/api/ideas/${ideaId}/documents/${documentId}/download`)
      .set(auth('token-voter'));
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers['content-type']).toMatch(/text\/plain/);
    expect(downloadRes.text).toBe(fileContents.toString());

    const deleteByOutsider = await request(app)
      .delete(`/api/ideas/${ideaId}/documents/${documentId}`)
      .set(auth('token-voter'));
    expect(deleteByOutsider.status).toBe(403);

    const deleteRes = await request(app)
      .delete(`/api/ideas/${ideaId}/documents/${documentId}`)
      .set(auth('token-submitter'));
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toEqual({ data: null });

    const listAfterDelete = await request(app).get(`/api/ideas/${ideaId}/documents`).set(auth('token-voter'));
    expect(listAfterDelete.body.data).toHaveLength(0);
  });

  it('sets, serves, and clears a user profile photo', async () => {
    await signIn('token-submitter');
    await signIn('token-voter');

    const meBefore = await request(app).get('/api/me').set(auth('token-submitter'));
    expect(meBefore.body.data.hasAvatar).toBe(false);

    // 1x1 transparent PNG.
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const badType = await request(app)
      .put('/api/me/avatar')
      .set(auth('token-submitter'))
      .send({ mimeType: 'application/pdf', dataBase64: pngBase64 });
    expect(badType.status).toBe(400);

    const setRes = await request(app)
      .put('/api/me/avatar')
      .set(auth('token-submitter'))
      .send({ mimeType: 'image/png', dataBase64: pngBase64 });
    expect(setRes.status).toBe(200);
    expect(setRes.body.data.hasAvatar).toBe(true);

    const submitterId = setRes.body.data.id;

    // Any authenticated user can fetch another user's avatar (for idea cards).
    const fetchByOther = await request(app).get(`/api/users/${submitterId}/avatar`).set(auth('token-voter'));
    expect(fetchByOther.status).toBe(200);
    expect(fetchByOther.headers['content-type']).toMatch(/image\/png/);

    // An idea now reports its submitter has an avatar.
    const ideaRes = await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: 'Idea with avatar' });
    expect(ideaRes.body.data.submitterHasAvatar).toBe(true);

    const clearRes = await request(app).delete('/api/me/avatar').set(auth('token-submitter'));
    expect(clearRes.status).toBe(200);
    expect(clearRes.body.data.hasAvatar).toBe(false);

    const fetchAfterClear = await request(app).get(`/api/users/${submitterId}/avatar`).set(auth('token-voter'));
    expect(fetchAfterClear.status).toBe(404);
  });

  it('supports multi-team membership: choosing a team-only idea into any team the user belongs to', async () => {
    await signIn('token-submitter');
    await signIn('token-admin');
    await setRole('token-admin', 'company_admin');

    const teamA = await createTeamDirect('Team A');
    const teamB = await createTeamDirect('Team B');
    await setTeam('token-submitter', teamA);

    // Not yet a member of Team B.
    const rejectedTeamId = await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: 'B idea', visibility: 'team', teamId: teamB });
    expect(rejectedTeamId.status).toBe(400);
    expect(rejectedTeamId.body).toEqual({
      error: 'You can only submit a team-only idea to a team you belong to.',
    });

    // Admin adds the submitter to Team B as a second membership.
    const addTeam = await request(app)
      .post(`/api/users/${(await request(app).get('/api/me').set(auth('token-submitter'))).body.data.id}/teams`)
      .set(auth('token-admin'))
      .send({ teamId: teamB });
    expect(addTeam.status).toBe(200);
    expect(addTeam.body.data.teamIds).toEqual(expect.arrayContaining([teamA, teamB]));

    const acceptedTeamId = await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: 'B idea', visibility: 'team', teamId: teamB });
    expect(acceptedTeamId.status).toBe(201);
    expect(acceptedTeamId.body.data.teamId).toBe(teamB);

    const submitterId = addTeam.body.data.id;
    const removeTeam = await request(app)
      .delete(`/api/users/${submitterId}/teams/${teamA}`)
      .set(auth('token-admin'));
    expect(removeTeam.status).toBe(200);
    expect(removeTeam.body.data.teamIds).toEqual([teamB]);
  });

  it('lets the submitter add and remove idea collaborators, who can then view a team-only idea', async () => {
    await signIn('token-submitter');
    await signIn('token-voter');
    await signIn('token-outsider');

    const teamId = await createTeamDirect('Collab Team');
    await setTeam('token-submitter', teamId);

    const createRes = await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: 'Team idea to collab on', visibility: 'team' });
    const ideaId: string = createRes.body.data.id;

    const outsiderView = await request(app).get(`/api/ideas/${ideaId}/members`).set(auth('token-outsider'));
    expect(outsiderView.status).toBe(404);

    const meRes = await request(app).get('/api/me').set(auth('token-outsider'));
    const outsiderId: string = meRes.body.data.id;

    const outsiderAddsSelf = await request(app)
      .post(`/api/ideas/${ideaId}/members`)
      .set(auth('token-outsider'))
      .send({ userId: outsiderId });
    expect(outsiderAddsSelf.status).toBe(404); // can't even see the idea to attempt this

    const addMember = await request(app)
      .post(`/api/ideas/${ideaId}/members`)
      .set(auth('token-submitter'))
      .send({ userId: outsiderId });
    expect(addMember.status).toBe(201);
    expect(addMember.body.data).toMatchObject({ userId: outsiderId, name: 'Otto Outsider' });

    // Now a collaborator, the outsider can view the team-only idea despite not being on the team.
    const outsiderViewsIdea = await request(app).get('/api/ideas').set(auth('token-outsider'));
    expect(outsiderViewsIdea.body.data.some((idea: { id: string }) => idea.id === ideaId)).toBe(true);

    const duplicateAdd = await request(app)
      .post(`/api/ideas/${ideaId}/members`)
      .set(auth('token-submitter'))
      .send({ userId: outsiderId });
    expect(duplicateAdd.status).toBe(400);

    // The collaborator can see the idea but isn't its submitter, so they
    // can't remove members themselves (403, not 404 — they can view it).
    const nonOwnerRemove = await request(app)
      .delete(`/api/ideas/${ideaId}/members/${outsiderId}`)
      .set(auth('token-outsider'));
    expect(nonOwnerRemove.status).toBe(403);

    const removeMember = await request(app)
      .delete(`/api/ideas/${ideaId}/members/${outsiderId}`)
      .set(auth('token-submitter'));
    expect(removeMember.status).toBe(200);

    const outsiderLosesAccess = await request(app).get('/api/ideas').set(auth('token-outsider'));
    expect(outsiderLosesAccess.body.data.some((idea: { id: string }) => idea.id === ideaId)).toBe(false);
  });

  it('exposes a member directory to any authenticated user', async () => {
    await signIn('token-submitter');
    await signIn('token-voter');

    const res = await request(app).get('/api/directory').set(auth('token-voter'));
    expect(res.status).toBe(200);
    expect(res.body.data.some((u: { name: string }) => u.name === 'Sam Submitter')).toBe(true);
    expect(res.body.data[0]).not.toHaveProperty('email');
  });

  it('rate-limits idea submissions per user', async () => {
    await signIn('token-submitter');

    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post('/api/ideas')
        .set(auth('token-submitter'))
        .send({ title: `Idea ${i}` });
      expect(res.status).toBe(201);
    }

    const blocked = await request(app)
      .post('/api/ideas')
      .set(auth('token-submitter'))
      .send({ title: 'One too many' });
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: 'Too many ideas submitted. Please wait a few minutes and try again.' });
  });

  it('blocks a pending signup from every route except GET /api/me, until an admin approves them', async () => {
    // Deliberately not using the signIn() helper, which auto-approves — this
    // exercises the real default a brand-new signup gets from syncUser.
    const meRes = await request(app).get('/api/me').set(auth('token-submitter'));
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.approvalStatus).toBe('pending');
    const pendingUserId = meRes.body.data.id as string;

    const blocked = await request(app).get('/api/ideas').set(auth('token-submitter'));
    expect(blocked.status).toBe(403);
    expect(blocked.body).toEqual({ error: 'Your account is pending admin approval.' });

    await signIn('token-admin');
    await setRole('token-admin', 'company_admin');

    const pendingList = await request(app).get('/api/users/pending').set(auth('token-admin'));
    expect(pendingList.status).toBe(200);
    expect(pendingList.body.data.map((u: { id: string }) => u.id)).toContain(pendingUserId);

    const approve = await request(app)
      .patch(`/api/users/${pendingUserId}/approve`)
      .set(auth('token-admin'));
    expect(approve.status).toBe(200);
    expect(approve.body.data.approvalStatus).toBe('approved');

    const nowAllowed = await request(app).get('/api/ideas').set(auth('token-submitter'));
    expect(nowAllowed.status).toBe(200);
  });
});
