import { getDb } from './db';
import type { MediaRef } from './content';
import { env } from 'cloudflare:workers';
import { imageKey, imageUrl } from './media';

/* ---------- Form helpers ---------- */

export function text(form: FormData, key: string, max = 2000): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Whole number from a form, or null when empty. Accepts "15,000". */
export function wholeNumber(form: FormData, key: string): number | null | 'invalid' {
  const raw = text(form, key, 20).replace(/[,\s]/g, '');
  if (raw === '') return null;
  if (!/^\d{1,9}$/.test(raw)) return 'invalid';
  return Number(raw);
}

export function checked(form: FormData, key: string): boolean {
  return form.get(key) === 'on' || form.get(key) === '1';
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MEDIA_ID_PATTERN = /^[a-z0-9]{6,32}$/;

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 200;
}

export function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

/* ---------- Flash messages ---------- */

const FLASH: Record<string, string> = {
  saved: 'Saved.',
  created: 'Created.',
  deleted: 'Deleted.',
  moved: 'Order updated.',
  published: 'Published. It is live on the site now.',
  unpublished: 'Moved to drafts. It is hidden from the site.',
  uploaded: 'Uploaded.',
  signed_out: 'You are signed out.',
};

export function flashText(url: URL): string | null {
  const key = url.searchParams.get('msg');
  return key ? (FLASH[key] ?? null) : null;
}

/* ---------- Ordering ---------- */

type SortableTable = 'projects' | 'services' | 'categories' | 'experience';

/** Moves a row up or down by renumbering the list 1..n and swapping two neighbours. */
export async function moveRow(
  table: SortableTable,
  id: number,
  direction: 'up' | 'down',
  scope?: { column: string; value: string },
): Promise<void> {
  const db = await getDb();
  const where = scope ? `WHERE ${scope.column} = ?` : '';
  const stmt = db.prepare(`SELECT id FROM ${table} ${where} ORDER BY sort, id`);
  const { results } = await (scope ? stmt.bind(scope.value) : stmt).all<{ id: number }>();
  const ids = results.map((r) => r.id);
  const index = ids.indexOf(id);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= ids.length) return;
  const a = ids[index];
  const b = ids[target];
  if (a === undefined || b === undefined) return;
  ids[index] = b;
  ids[target] = a;
  await db.batch(ids.map((rowId, i) => db.prepare(`UPDATE ${table} SET sort = ? WHERE id = ?`).bind(i + 1, rowId)));
}

export async function nextSort(table: SortableTable): Promise<number> {
  const db = await getDb();
  const row = await db.prepare(`SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM ${table}`).first<{ n: number }>();
  return row?.n ?? 1;
}

/* ---------- Media ---------- */

interface MediaRow {
  id: string;
  kind: 'image' | 'file';
  original_name: string;
  mime: string;
  width: number | null;
  height: number | null;
  widths: string;
  formats: string;
  bytes: number;
  alt: string;
  created_at: string;
}

export interface MediaItem extends MediaRef {
  kind: 'image' | 'file';
  originalName: string;
  bytes: number;
  createdAt: string;
}

function parseList<T>(value: string): T[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function toItem(r: MediaRow): MediaItem {
  return {
    id: r.id,
    kind: r.kind,
    mime: r.mime,
    width: r.width,
    height: r.height,
    widths: parseList<number>(r.widths),
    formats: parseList<string>(r.formats),
    alt: r.alt,
    originalName: r.original_name,
    bytes: r.bytes,
    createdAt: r.created_at,
  };
}

export async function listMedia(kind?: 'image' | 'file'): Promise<MediaItem[]> {
  const db = await getDb();
  const stmt = kind
    ? db.prepare('SELECT * FROM media WHERE kind = ? ORDER BY created_at DESC, id').bind(kind)
    : db.prepare('SELECT * FROM media ORDER BY created_at DESC, id');
  const { results } = await stmt.all<MediaRow>();
  return results.map(toItem);
}

export async function getMediaItem(id: string): Promise<MediaItem | null> {
  if (!MEDIA_ID_PATTERN.test(id)) return null;
  const db = await getDb();
  const row = await db.prepare('SELECT * FROM media WHERE id = ?').bind(id).first<MediaRow>();
  return row ? toItem(row) : null;
}

/** Small preview URL for admin thumbnails. */
export function thumbUrl(media: MediaRef): string | null {
  const width = [...media.widths].sort((a, b) => a - b)[0];
  const format = media.formats.includes('webp') ? 'webp' : media.formats[0];
  return width && format ? imageUrl(media.id, width, format) : null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* ---------- Offers ---------- */

export type OfferState = 'live' | 'scheduled' | 'ended' | 'draft';

export function offerState(
  offer: { status: string; starts_at: string | null; ends_at: string | null },
  today: string,
): OfferState {
  if (offer.status !== 'published') return 'draft';
  if (offer.starts_at && offer.starts_at > today) return 'scheduled';
  if (offer.ends_at && offer.ends_at < today) return 'ended';
  return 'live';
}

export const TINTS = [
  'sand',
  'red',
  'butter',
  'blue',
  'lime',
  'lilac',
  'slate',
  'teal',
  'indigo',
  'pink',
  'peach',
  'mint',
] as const;

/** Deletes a stored image or file everywhere: storage, database and any place it was used. */
export async function deleteMedia(id: string): Promise<boolean> {
  const item = await getMediaItem(id);
  if (!item) return false;
  const keys =
    item.kind === 'image'
      ? item.widths.flatMap((w) => item.formats.map((f) => imageKey(item.id, w, f)))
      : [`file/${item.id}`];
  await Promise.all(keys.map((key) => env.MEDIA.delete(key)));
  const db = await getDb();
  await db.batch([
    db.prepare("UPDATE settings SET value = '' WHERE key IN ('hero_photo', 'contact_photo', 'cv_file') AND value = ?").bind(id),
    db.prepare('UPDATE projects SET cover_media_id = NULL WHERE cover_media_id = ?').bind(id),
    db.prepare('UPDATE offers SET media_id = NULL WHERE media_id = ?').bind(id),
    db.prepare('DELETE FROM project_images WHERE media_id = ?').bind(id),
    db.prepare('DELETE FROM media WHERE id = ?').bind(id),
  ]);
  return true;
}

/** Ids of images and files that are used somewhere on the site. */
export async function mediaInUse(): Promise<Set<string>> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT cover_media_id AS id FROM projects WHERE cover_media_id IS NOT NULL
       UNION SELECT media_id FROM project_images
       UNION SELECT media_id FROM offers WHERE media_id IS NOT NULL
       UNION SELECT value FROM settings WHERE key IN ('hero_photo', 'contact_photo', 'cv_file') AND value != ''`,
    )
    .all<{ id: string }>();
  return new Set(results.map((r) => r.id));
}
