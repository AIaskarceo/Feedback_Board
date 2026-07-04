import { Router } from 'express';
import type { ApiResponse, Idea } from '@feedback-board/shared';
import { markIdeaDone } from '../repositories/ideas.repository';
import { getUserById } from '../repositories/users.repository';
import { sendIdeaDoneEmail } from '../services/email';

export const adminRouter = Router();

// TODO: apply Dev A's requireAdmin middleware here once available:
// adminRouter.use(requireAdmin)

adminRouter.post('/:id/done', async (req, res, next) => {
  try {
    const result = await markIdeaDone(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Idea not found.' } satisfies ApiResponse<never>);
      return;
    }

    const { idea, wasAlreadyDone } = result;

    // api-contract.md doesn't define an "already done" error string, so this
    // endpoint is idempotent: re-marking a done idea succeeds without
    // re-sending the notification email. Flag with the team if a rejection
    // with a specific error string is actually wanted here.
    if (!wasAlreadyDone) {
      const submitter = await getUserById(idea.submitterId);
      if (submitter) {
        try {
          await sendIdeaDoneEmail(idea, submitter);
        } catch (emailErr) {
          console.error('Failed to send idea-done email:', emailErr);
        }
      }
    }

    res.json({ data: idea } satisfies ApiResponse<Idea>);
  } catch (err) {
    next(err);
  }
});
