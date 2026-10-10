import { env } from 'cloudflare:workers';
import { sendMail } from './mail';

interface NewMessage {
  name: string;
  email: string;
  service: string;
  budget: string;
  message: string;
  attachmentName: string | null;
}

/** Emails a short notice about a new contact message. */
export async function notifyNewMessage(msg: NewMessage): Promise<void> {
  const to = (env as unknown as { NOTIFY_EMAIL?: string }).NOTIFY_EMAIL;
  if (!to) return;
  const lines = [
    `Name: ${msg.name}`,
    `Email: ${msg.email}`,
    msg.service ? `Service: ${msg.service}` : '',
    msg.budget ? `Budget: ${msg.budget}` : '',
    msg.attachmentName ? `Attachment: ${msg.attachmentName} (open it in the admin panel)` : '',
    '',
    msg.message,
    '',
    'Reply to this email to answer them directly.',
  ].filter((line, i) => line !== '' || i > 0);
  await sendMail({
    to,
    subject: `New message from ${msg.name}`,
    text: lines.join('\n'),
    replyTo: { name: msg.name, email: msg.email },
    fromName: 'Website contact form',
  });
}
