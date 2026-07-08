import nodemailer, { type Transporter } from 'nodemailer';
import type { Idea, User } from '@feedback-board/shared';

const FROM_EMAIL = process.env.EMAIL_FROM ?? process.env.GMAIL_USER ?? 'Feedback Board';

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT ?? 465),
      secure: true,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return transporter;
}

export async function sendIdeaDoneEmail(idea: Idea, submitter: User): Promise<void> {
  await getTransporter().sendMail({
    from: FROM_EMAIL,
    to: submitter.email,
    subject: 'Your idea was marked as Done! 🎉',
    text: `Hi ${submitter.name},\n\nYour idea has been marked as done:\n\n"${idea.title}"\n\nThanks for contributing!`,
  });
}

// PRD §8.4: weekly digest for users whose notification_preference is 'digest'.
export async function sendDigestEmail(recipient: User, newIdeas: Idea[], trendingIdeas: Idea[]): Promise<void> {
  const section = (title: string, ideas: Idea[]) =>
    ideas.length === 0
      ? ''
      : `${title}:\n${ideas.map((idea) => `  - "${idea.title}" (${idea.voteCount} votes)`).join('\n')}\n\n`;

  await getTransporter().sendMail({
    from: FROM_EMAIL,
    to: recipient.email,
    subject: 'Your weekly Idea Board digest',
    text:
      `Hi ${recipient.name},\n\nHere's what happened on the Idea Board this week:\n\n` +
      section('New ideas', newIdeas) +
      section('Trending this week', trendingIdeas) +
      'Change your notification preference anytime from your profile.',
  });
}
