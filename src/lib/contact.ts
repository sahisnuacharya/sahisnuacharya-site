import { z } from 'zod';

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_MESSAGES_PER_HOUR = 5;

export const ALLOWED_FILES: Record<string, string[]> = {
  pdf: ['application/pdf'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  webp: ['image/webp'],
  gif: ['image/gif'],
  zip: ['application/zip', 'application/x-zip-compressed'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  txt: ['text/plain'],
};
export const ACCEPT_ATTRIBUTE = Object.keys(ALLOWED_FILES)
  .map((ext) => `.${ext}`)
  .join(',');

export const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Please enter your name.')
    .max(100, 'Please keep your name under 100 characters.'),
  email: z
    .string()
    .trim()
    .max(200, 'This email address is too long.')
    .pipe(z.email('Please enter a valid email address, like name@example.com.')),
  service: z.string().trim().max(100).default(''),
  budget: z.string().trim().max(100, 'Please keep the budget under 100 characters.').default(''),
  message: z
    .string()
    .trim()
    .min(10, 'Please tell me a little more, at least 10 characters.')
    .max(5000, 'Please keep your message under 5,000 characters.'),
});

export type ContactInput = z.infer<typeof contactSchema>;
export type FieldErrors = Partial<Record<keyof ContactInput | 'attachment' | 'form', string>>;

/** Checks the first bytes of a file so a renamed program cannot pass as an image or PDF. */
export function matchesSignature(ext: string, bytes: Uint8Array): boolean {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  switch (ext) {
    case 'pdf':
      return starts(0x25, 0x50, 0x44, 0x46);
    case 'jpg':
    case 'jpeg':
      return starts(0xff, 0xd8, 0xff);
    case 'png':
      return starts(0x89, 0x50, 0x4e, 0x47);
    case 'gif':
      return starts(0x47, 0x49, 0x46, 0x38);
    case 'webp':
      return starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45;
    case 'zip':
    case 'docx':
    case 'pptx':
      return starts(0x50, 0x4b, 0x03, 0x04);
    case 'txt':
      return !bytes.slice(0, 512).includes(0);
    default:
      return false;
  }
}

export function fileExtension(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match?.[1]?.toLowerCase() ?? '';
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyTurnstile(token: string, secret: string, ip: string): Promise<boolean> {
  try {
    const body = new FormData();
    body.append('secret', secret);
    body.append('response', token);
    if (ip) body.append('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    if (!res.ok) return false;
    const data: { success?: boolean } = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}
