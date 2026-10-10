import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getDb } from '../../../lib/db';

const MAX_BYTES = 10 * 1024 * 1024;

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Stores a public PDF, such as your CV. */
export const POST: APIRoute = async ({ request }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { ok: false, message: 'The upload could not be read.' });
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return json(400, { ok: false, message: 'Please choose a PDF file.' });
  if (file.size > MAX_BYTES) return json(413, { ok: false, message: 'Please choose a PDF under 10 MB.' });
  const bytes = await file.arrayBuffer();
  const head = new Uint8Array(bytes.slice(0, 5));
  if (String.fromCharCode(...head.slice(0, 4)) !== '%PDF') {
    return json(400, { ok: false, message: 'This file is not a PDF.' });
  }
  const name = file.name.replace(/[^\w.\- ()]+/g, '_').slice(-120) || 'document.pdf';
  const idBytes = new Uint8Array(8);
  crypto.getRandomValues(idBytes);
  const id = [...idBytes].map((x) => x.toString(16).padStart(2, '0')).join('');
  try {
    await env.MEDIA.put(`file/${id}`, bytes, { metadata: { type: 'application/pdf', name } });
    const db = await getDb();
    await db
      .prepare(
        "INSERT INTO media (id, kind, original_name, mime, bytes, alt) VALUES (?, 'file', ?, 'application/pdf', ?, '')",
      )
      .bind(id, name, bytes.byteLength)
      .run();
  } catch (error) {
    console.error('File upload failed', error);
    return json(500, { ok: false, message: 'The file could not be saved. Please try again.' });
  }
  return json(200, { ok: true, id, name });
};
