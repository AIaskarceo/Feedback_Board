import { Resend } from 'resend';
import type { Idea, User } from '@feedback-board/shared';

const FROM_EMAIL = process.env.EMAIL_FROM ?? 'Feedback Board <onboarding@resend.dev>';

let resend: Resend | undefined;

function getResendClient(): Resend {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

export async function sendIdeaDoneEmail(idea: Idea, submitter: User): Promise<void> {
  await getResendClient().emails.send({
    from: FROM_EMAIL,
    to: submitter.email,
    subject: 'Your idea was marked as Done! 🎉',
    text: `Hi ${submitter.name},\n\nYour idea has been marked as done:\n\n"${idea.text}"\n\nThanks for contributing!`,
  });
}
