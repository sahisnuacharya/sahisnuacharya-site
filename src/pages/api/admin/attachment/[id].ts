import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getDb } from '../../../../lib/db';

/** Downloads a contact form attachment. Only reachable when signed in. */
export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) return new Response('Not found', { status: 404 });
  const db = await getDb();
  const row = await db
    .prepare('SELECT attachment_key, attachment_name, attachment_type FROM messages WHERE id = ?')
    .bind(id)
    .first<{ attachment_key: string | null; attachment_name: string | null; attachment_type: string | null }>();
  if (!row?.attachment_key) return new Response('Not found', { status: 404 });
  const body = await env.MEDIA.get(row.attachment_key, { type: 'stream' });
  if (!body) return new Response('Not found', { status: 404 });
  const name = (row.attachment_name ?? 'attachment').replace(/[^\w.\- ]+/g, '_');
  return new Response(body, {
    headers: {
      'Content-Type': row.attachment_type ?? 'application/octet-stream',
      // Always download, never open inside the admin page.
      'Content-Disposition': `attachment; filename="${name}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  });
};
