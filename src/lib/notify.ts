import { env } from 'cloudflare:workers';

interface NewMessage {
  name: string;
  email: string;
  service: string;
  budget: string;
  message: string;
  attachmentName: string | null;
}

interface EmailBinding {
  send(message: unknown): Promise<void>;
}

const FROM = 'website@sahisnuacharya.com.np';

function clean(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function encodeHeader(value: string): string {
  const bytes = new TextEncoder().encode(clean(value));
  return `=?UTF-8?B?${btoa(String.fromCharCode(...bytes))}?=`;
}

/**
 * Emails a short notice about a new contact message. It only runs after Email Routing
 * is set up and the EMAIL binding is turned on in wrangler.jsonc (see README).
 */
export async function notifyNewMessage(msg: NewMessage): Promise<void> {
  const vars = env as unknown as { EMAIL?: EmailBinding; NOTIFY_EMAIL?: string };
  const to = vars.NOTIFY_EMAIL;
  if (!vars.EMAIL || !to) return;
  try {
    const { EmailMessage } = await import('cloudflare:email');
    const lines = [
      `Name: ${msg.name}`,
      `Email: ${msg.email}`,
      msg.service && `Service: ${msg.service}`,
      msg.budget && `Budget: ${msg.budget}`,
      msg.attachmentName && `Attachment: ${msg.attachmentName} (see the admin panel)`,
      '',
      msg.message,
      '',
      'Reply to this email to answer them directly.',
    ].filter((l): l is string => typeof l === 'string');
    const raw = [
      `From: ${encodeHeader('Website contact form')} <${FROM}>`,
      `To: <${to}>`,
      `Reply-To: ${encodeHeader(msg.name)} <${clean(msg.email)}>`,
      `Subject: ${encodeHeader(`New message from ${msg.name}`)}`,
      `Message-ID: <${crypto.randomUUID()}@sahisnuacharya.com.np>`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      lines.join('\r\n'),
    ].join('\r\n');
    await vars.EMAIL.send(new EmailMessage(FROM, to, raw));
  } catch (error) {
    console.error('Could not send notification email', error);
  }
}
