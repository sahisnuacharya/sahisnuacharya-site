import { env } from 'cloudflare:workers';

interface EmailBinding {
  send(message: unknown): Promise<unknown>;
}

const FROM = 'website@sahisnuacharya.com.np';

function clean(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function encodeHeader(value: string): string {
  const bytes = new TextEncoder().encode(clean(value));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  replyTo?: { name: string; email: string };
  fromName?: string;
}

/** Sends a plain text email through Cloudflare. Returns false if it could not be sent. */
export async function sendMail(mail: Mail): Promise<boolean> {
  const binding = (env as unknown as { EMAIL?: EmailBinding }).EMAIL;
  if (!binding) {
    console.warn('EMAIL binding is not set, email not sent:', mail.subject);
    return false;
  }
  try {
    const { EmailMessage } = await import('cloudflare:email');
    const headers = [
      `From: ${encodeHeader(mail.fromName ?? 'Sahisnu Acharya website')} <${FROM}>`,
      `To: <${clean(mail.to)}>`,
      mail.replyTo ? `Reply-To: ${encodeHeader(mail.replyTo.name)} <${clean(mail.replyTo.email)}>` : '',
      `Subject: ${encodeHeader(mail.subject)}`,
      `Message-ID: <${crypto.randomUUID()}@sahisnuacharya.com.np>`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
    ].filter(Boolean);
    const raw = `${headers.join('\r\n')}\r\n\r\n${mail.text.replace(/\r?\n/g, '\r\n')}`;
    await binding.send(new EmailMessage(FROM, mail.to, raw));
    return true;
  } catch (error) {
    console.error('Could not send email', mail.subject, error);
    return false;
  }
}
