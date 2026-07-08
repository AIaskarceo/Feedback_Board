import { listIdeas, maskAnonymousIdea } from '../repositories/ideas.repository';
import { listUsersByNotificationPreference } from '../repositories/users.repository';
import { sendDigestEmail } from './email';

const DIGEST_ITEM_LIMIT = 5;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// PRD §8.4: weekly digest — new ideas and this-week's trending ideas, scoped
// to what each recipient can actually see, sent only to users who opted into
// 'digest' notifications.
export async function sendWeeklyDigest(): Promise<{ sent: number; failed: number }> {
  const recipients = await listUsersByNotificationPreference('digest');
  let sent = 0;
  let failed = 0;

  for (const user of recipients) {
    try {
      const viewer = { id: user.id, role: user.role, teamId: user.teamId };
      const [newest, trending] = await Promise.all([
        listIdeas(viewer, { sort: 'newest' }),
        listIdeas(viewer, { sort: 'votes_week' }),
      ]);

      const weekAgo = Date.now() - ONE_WEEK_MS;
      const newIdeas = newest
        .filter((idea) => new Date(idea.createdAt).getTime() >= weekAgo)
        .slice(0, DIGEST_ITEM_LIMIT)
        .map(maskAnonymousIdea);
      const trendingIdeas = trending
        .filter((idea) => idea.voteCount > 0)
        .slice(0, DIGEST_ITEM_LIMIT)
        .map(maskAnonymousIdea);

      if (newIdeas.length === 0 && trendingIdeas.length === 0) continue;

      await sendDigestEmail(user, newIdeas, trendingIdeas);
      sent += 1;
    } catch (err) {
      console.error(`Failed to send digest to ${user.email}:`, err);
      failed += 1;
    }
  }

  return { sent, failed };
}
