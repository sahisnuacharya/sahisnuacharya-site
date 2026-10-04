import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getDb } from '../../lib/db';
import {
  ALLOWED_FILES,
  MAX_FILE_BYTES,
  MAX_MESSAGES_PER_HOUR,
  contactSchema,
  fileExtension,
  matchesSignature,
  sha256Hex,
  verifyTurnstile,
  type FieldErrors,
} from '../../lib/contact';
import { notifyNewMessage } from '../../lib/notify';

function wantsJson(request: Request): boolean {
  return (request.headers.get('Accept') ?? '').includes('application/json');
}

function reply(
  request: Request,
  status: number,
  body: { ok: boolean; message: string; errors?: FieldErrors },
): Response {
  if (wantsJson(request)) {
    return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  }
  // Without JavaScript: go back to the contact page with a short status code.
  const reason =
    status === 429 ? 'limit' : status === 413 ? 'size' : status >= 500 ? 'server' : 'invalid';
  const code = body.ok ? 'sent=1' : `error=${reason}`;
  return new Response(null, {
    status: 303,
    headers: { Location: `/contact?${code}#contact-form` },
  });
}

async function ipSalt(db: D1Database): Promise<string> {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = 'ip_salt'")
    .first<{ value: string }>();
  if (row?.value) return row.value;
  const salt = crypto.randomUUID();
  await db
    .prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('ip_salt', ?)")
    .bind(salt)
    .run();
  const saved = await db
    .prepare("SELECT value FROM settings WHERE key = 'ip_salt'")
    .first<{ value: string }>();
  return saved?.value ?? salt;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const length = Number(request.headers.get('Content-Length') ?? '0');
  if (length > MAX_FILE_BYTES + 512 * 1024) {
    return reply(request, 413, {
      ok: false,
      message: 'The file is too large. Please attach a file under 10 MB.',
      errors: { attachment: 'Please attach a file under 10 MB.' },
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply(request, 400, {
      ok: false,
      message: 'The form could not be read. Please try again.',
    });
  }

  // Bots fill in the hidden field. Pretend it worked and save nothing.
  const trap = form.get('website');
  if (typeof trap === 'string' && trap.trim() !== '') {
    return reply(request, 200, { ok: true, message: 'Thanks! Your message is on its way.' });
  }

  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === 'string' ? value : '';
  };
  const parsed = contactSchema.safeParse({
    name: text('name'),
    email: text('email'),
    service: text('service'),
    budget: text('budget'),
    message: text('message'),
  });

  const errors: FieldErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof FieldErrors | undefined;
      if (field && !errors[field]) errors[field] = issue.message;
    }
  }

  // Optional attachment
  const upload = form.get('attachment');
  let file: { ext: string; type: string; name: string; bytes: ArrayBuffer } | null = null;
  if (upload instanceof File && upload.size > 0) {
    const ext = fileExtension(upload.name);
    const allowed = ALLOWED_FILES[ext];
    if (!allowed) {
      errors.attachment = 'Please attach a PDF, image, ZIP, Word, PowerPoint or text file.';
    } else if (upload.size > MAX_FILE_BYTES) {
      errors.attachment = 'Please attach a file under 10 MB.';
    } else {
      const bytes = await upload.arrayBuffer();
      if (!matchesSignature(ext, new Uint8Array(bytes.slice(0, 1024)))) {
        errors.attachment = 'This file does not look like a real ' + ext.toUpperCase() + ' file.';
      } else {
        const type = allowed[0] ?? 'application/octet-stream';
        const name = upload.name.replace(/[^\w.\- ]+/g, '_').slice(-120);
        file = { ext, type, name, bytes };
      }
    }
  }

  if (!parsed.success || Object.keys(errors).length > 0) {
    return reply(request, 400, {
      ok: false,
      message: 'Please check the highlighted fields.',
      errors,
    });
  }
  const input = parsed.data;
  const ip = request.headers.get('CF-Connecting-IP') ?? '';

  // Spam check with Cloudflare Turnstile, once keys are set up.
  const secret = (env as unknown as { TURNSTILE_SECRET_KEY?: string }).TURNSTILE_SECRET_KEY;
  if (env.TURNSTILE_SITE_KEY && secret) {
    const token = text('cf-turnstile-response');
    if (!token || !(await verifyTurnstile(token, secret, ip))) {
      return reply(request, 400, {
        ok: false,
        message: 'The spam check did not pass. Please wait a moment and try again.',
        errors: { form: 'The spam check did not pass. Please try again.' },
      });
    }
  }

  try {
    const db = await getDb();
    const ipHash = ip ? await sha256Hex(`${await ipSalt(db)}:${ip}`) : '';

    // Local test runs come from the machine itself and are not rate limited.
    const isLocal = ip === '127.0.0.1' || ip === '::1';
    if (ipHash && !isLocal) {
      const recent = await db
        .prepare(
          "SELECT COUNT(*) AS n FROM messages WHERE ip_hash = ? AND created_at > datetime('now', '-1 hour')",
        )
        .bind(ipHash)
        .first<{ n: number }>();
      if ((recent?.n ?? 0) >= MAX_MESSAGES_PER_HOUR) {
        return reply(request, 429, {
          ok: false,
          message:
            'You have sent several messages already. Please try again in an hour, or use WhatsApp.',
        });
      }
    }

    let attachmentKey: string | null = null;
    if (file) {
      attachmentKey = `upload/${crypto.randomUUID()}`;
      await env.MEDIA.put(attachmentKey, file.bytes, {
        metadata: { name: file.name, type: file.type },
      });
    }

    await db
      .prepare(
        `INSERT INTO messages (name, email, service, budget, body, attachment_key, attachment_name,
           attachment_type, attachment_size, ip_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.name,
        input.email,
        input.service,
        input.budget,
        input.message,
        attachmentKey,
        file?.name ?? null,
        file?.type ?? null,
        file ? file.bytes.byteLength : null,
        ipHash,
      )
      .run();

    const notice = notifyNewMessage({
      name: input.name,
      email: input.email,
      service: input.service,
      budget: input.budget,
      message: input.message,
      attachmentName: file?.name ?? null,
    });
    const ctx = (locals as { cfContext?: { waitUntil(p: Promise<unknown>): void } }).cfContext;
    if (ctx) ctx.waitUntil(notice);
    else await notice;
  } catch (error) {
    console.error('Contact form failed', error);
    return reply(request, 500, {
      ok: false,
      message: 'Something went wrong while sending. Please try again, or use email or WhatsApp.',
    });
  }

  return reply(request, 200, {
    ok: true,
    message: 'Thanks! Your message is on its way. I usually reply within a day.',
  });
};
