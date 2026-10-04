import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getDb } from '../../lib/db';

const IMAGE_KEY = /^img\/[a-z0-9]{6,32}\/\d{2,4}\.(avif|webp|jpg|png)$/;
const FILE_KEY = /^file\/[a-z0-9]{6,32}$/;
const IMAGE_TYPES: Record<string, string> = {
  avif: 'image/avif',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  png: 'image/png',
};

/**
 * Serves public images and files from KV storage. Contact form attachments are stored
 * under a different prefix and can never be read through this route.
 */
export const GET: APIRoute = async ({ params, request }) => {
  const key = params.key ?? '';

  if (IMAGE_KEY.test(key)) {
    const ext = key.split('.').pop() ?? '';
    const etag = `"${key}"`;
    if (request.headers.get('If-None-Match') === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } });
    }
    const body = await env.MEDIA.get(key, { type: 'stream', cacheTtl: 86400 });
    if (!body) return new Response('Not found', { status: 404 });
    return new Response(body, {
      headers: {
        'Content-Type': IMAGE_TYPES[ext] ?? 'application/octet-stream',
        // Image keys never change content, so browsers can keep them for a year.
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: etag,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  if (FILE_KEY.test(key)) {
    const id = key.slice('file/'.length);
    const db = await getDb();
    const meta = await db
      .prepare("SELECT mime, original_name FROM media WHERE id = ? AND kind = 'file'")
      .bind(id)
      .first<{ mime: string; original_name: string }>();
    if (!meta) return new Response('Not found', { status: 404 });
    const body = await env.MEDIA.get(key, { type: 'stream' });
    if (!body) return new Response('Not found', { status: 404 });
    const name = meta.original_name.replace(/[^\w.\- ]+/g, '_') || 'download';
    return new Response(body, {
      headers: {
        'Content-Type': meta.mime,
        'Content-Disposition': `inline; filename="${name}"`,
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  return new Response('Not found', { status: 404 });
};
