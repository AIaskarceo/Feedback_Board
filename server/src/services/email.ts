import { Resend } from 'resend';
import type { Idea, User } from '@feedback-board/shared';
import { getAdminEmails } from '../config/adminEmails';

const FROM_EMAIL = process.env.EMAIL_FROM ?? 'Feedback Board <onboarding@resend.dev>';

let resend: Resend | undefined;

function getResendClient(): Resend {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

export async function sendIdeaDoneEmail(idea: Idea, submitter: User): Promise<void> {
  const { error } = await getResendClient().emails.send({
    from: FROM_EMAIL,
    to: submitter.email,
    subject: 'Your idea was marked as Done! 🎉',
    text: `Hi ${submitter.name},\n\nYour idea has been marked as done:\n\n"${idea.text}"\n\nThanks for contributing!`,
  });

  // The Resend SDK resolves (doesn't reject) on API errors, so without this
  // check a failed send looks identical to a successful one to the caller.
  if (error) {
    throw new Error(`Resend API error: ${error.message}`);
  }
}

export async function sendNewIdeaEmail(idea: Idea, submitter: User): Promise<void> {
  const adminEmails = getAdminEmails();
  if (adminEmails.length === 0) {
    return;
  }

  const { error } = await getResendClient().emails.send({
    from: FROM_EMAIL,
    to: adminEmails,
    subject: 'New feedback submitted',
    text: `${submitter.name} (${submitter.email}) submitted new feedback:\n\n"${idea.text}"`,
  });

  if (error) {
    throw new Error(`Resend API error: ${error.message}`);
  }
}
