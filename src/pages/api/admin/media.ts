import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getDb } from '../../../lib/db';
import { listMedia, thumbUrl } from '../../../lib/admin';
import { imageKey } from '../../../lib/media';

const MAX_VARIANT_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const VARIANT_FIELD = /^v-(\d{2,4})-(avif|webp|jpg|png)$/;
const MIME: Record<string, string> = { avif: 'image/avif', webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' };

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Checks the first bytes so only real images of the stated type are stored. */
function looksLike(format: string, b: Uint8Array): boolean {
  const ascii = (start: number, end: number) => String.fromCharCode(...b.slice(start, end));
  switch (format) {
    case 'avif':
      return ascii(4, 8) === 'ftyp' && /avi[fs]/.test(ascii(8, 40));
    case 'webp':
      return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    case 'jpg':
      return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case 'png':
      return b[0] === 0x89 && ascii(1, 4) === 'PNG';
    default:
      return false;
  }
}

function newId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Image list for the picker. */
export const GET: APIRoute = async () => {
  const images = await listMedia('image');
  return json(200, {
    images: images.map((m) => ({ id: m.id, thumb: thumbUrl(m), alt: m.alt, name: m.originalName })),
  });
};

/** Saves an image that the browser already resized and compressed. */
export const POST: APIRoute = async ({ request }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { ok: false, message: 'The upload could not be read. Please try again.' });
  }

  let meta: { width?: unknown; height?: unknown; name?: unknown } = {};
  try {
    meta = JSON.parse(String(form.get('meta') ?? '{}')) as typeof meta;
  } catch {
    meta = {};
  }
  const width = Number(meta.width);
  const height = Number(meta.height);
  const name = String(meta.name ?? '').replace(/[^\w.\- ()]+/g, '_').slice(0, 120);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 20000 || height > 20000) {
    return json(400, { ok: false, message: 'The image size is not valid.' });
  }

  const variants: { width: number; format: string; bytes: ArrayBuffer }[] = [];
  let total = 0;
  for (const [key, value] of form.entries()) {
    const match = VARIANT_FIELD.exec(key);
    if (!match) continue;
    if (!(value instanceof File)) return json(400, { ok: false, message: 'The upload is not valid.' });
    const w = Number(match[1]);
    const format = match[2] ?? '';
    if (w < 16 || w > 2400) return json(400, { ok: false, message: 'The image width is not valid.' });
    if (value.size === 0 || value.size > MAX_VARIANT_BYTES) {
      return json(413, { ok: false, message: 'This image is too large even after compression.' });
    }
    const bytes = await value.arrayBuffer();
    if (!looksLike(format, new Uint8Array(bytes.slice(0, 64)))) {
      return json(400, { ok: false, message: 'This file is not a valid image.' });
    }
    total += bytes.byteLength;
    variants.push({ width: w, format, bytes });
  }
  if (variants.length === 0 || variants.length > 12) return json(400, { ok: false, message: 'No image was received.' });
  if (total > MAX_TOTAL_BYTES) return json(413, { ok: false, message: 'This image is too large.' });

  const widths = [...new Set(variants.map((v) => v.width))].sort((a, b) => a - b);
  const formats = [...new Set(variants.map((v) => v.format))];
  if (widths.length * formats.length !== variants.length) {
    return json(400, { ok: false, message: 'Some image sizes are missing. Please try again.' });
  }

  const id = newId();
  try {
    await Promise.all(
      variants.map((v) =>
        env.MEDIA.put(imageKey(id, v.width, v.format), v.bytes, { metadata: { type: MIME[v.format] } }),
      ),
    );
    const primary = formats.includes('webp') ? 'webp' : (formats.find((f) => f !== 'avif') ?? formats[0] ?? 'webp');
    const db = await getDb();
    await db
      .prepare(
        `INSERT INTO media (id, kind, original_name, mime, width, height, widths, formats, bytes, alt)
         VALUES (?, 'image', ?, ?, ?, ?, ?, ?, ?, '')`,
      )
      .bind(id, name, MIME[primary] ?? 'image/webp', width, height, JSON.stringify(widths), JSON.stringify(formats), total)
      .run();
  } catch (error) {
    console.error('Image upload failed', error);
    return json(500, { ok: false, message: 'The image could not be saved. Please try again.' });
  }

  const media = { id, widths, formats, mime: '', width, height, alt: '' };
  return json(200, { ok: true, media: { id, thumb: thumbUrl(media), alt: '', name } });
};
