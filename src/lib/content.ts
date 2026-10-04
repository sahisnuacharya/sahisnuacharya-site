import { getDb } from './db';

/* ---------- Types ---------- */

export interface MediaRef {
  id: string;
  mime: string;
  width: number | null;
  height: number | null;
  widths: number[];
  formats: string[];
  alt: string;
}

export interface Category {
  slug: string;
  name: string;
  count: number;
}

export interface Project {
  id: number;
  slug: string;
  title: string;
  summary: string;
  body: string;
  categorySlug: string | null;
  categoryName: string | null;
  client: string;
  role: string;
  year: number | null;
  cover: MediaRef | null;
  coverWord: string;
  tint: string;
  featured: boolean;
  sort: number;
}

export interface ProjectImage {
  media: MediaRef;
  caption: string;
}

export interface Service {
  id: number;
  slug: string;
  name: string;
  summary: string;
  includes: string[];
  delivery: string;
  priceNpr: number | null;
  priceUsd: number | null;
}

export interface Offer {
  id: number;
  title: string;
  details: string;
  serviceName: string | null;
  discountType: 'none' | 'percent' | 'fixed';
  discountValue: number;
  priceNpr: number | null;
  priceUsd: number | null;
  startsAt: string | null;
  endsAt: string | null;
  media: MediaRef | null;
  showOnHome: boolean;
}

export interface Experience {
  kind: 'work' | 'education';
  title: string;
  organization: string;
  location: string;
  period: string;
}

export interface Settings {
  name: string;
  firstName: string;
  lastName: string;
  role: string;
  heroIntro: string;
  available: boolean;
  availableText: string;
  bookedText: string;
  aboutTitle: string;
  aboutShort: string;
  aboutBody: string;
  tools: string[];
  location: string;
  email: string;
  whatsapp: string;
  socials: { label: string; url: string }[];
  heroPhoto: MediaRef | null;
  contactPhoto: MediaRef | null;
  cvFile: MediaRef | null;
  seoDescription: string;
}

/* ---------- Row mapping ---------- */

interface MediaColumns {
  m_id: string | null;
  m_mime: string | null;
  m_width: number | null;
  m_height: number | null;
  m_widths: string | null;
  m_formats: string | null;
  m_alt: string | null;
}

const MEDIA_COLUMNS = `m.id AS m_id, m.mime AS m_mime, m.width AS m_width, m.height AS m_height,
  m.widths AS m_widths, m.formats AS m_formats, m.alt AS m_alt`;

function parseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function toMedia(row: MediaColumns): MediaRef | null {
  if (!row.m_id || !row.m_mime) return null;
  return {
    id: row.m_id,
    mime: row.m_mime,
    width: row.m_width,
    height: row.m_height,
    widths: parseJsonArray<number>(row.m_widths),
    formats: parseJsonArray<string>(row.m_formats),
    alt: row.m_alt ?? '',
  };
}

interface ProjectRow extends MediaColumns {
  id: number;
  slug: string;
  title: string;
  summary: string;
  body: string;
  c_slug: string | null;
  c_name: string | null;
  client: string;
  role: string;
  year: number | null;
  cover_word: string;
  tint: string;
  featured: number;
  sort: number;
}

const PROJECT_SELECT = `SELECT p.id, p.slug, p.title, p.summary, p.body, c.slug AS c_slug, c.name AS c_name,
  p.client, p.role, p.year, p.cover_word, p.tint, p.featured, p.sort, ${MEDIA_COLUMNS}
  FROM projects p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN media m ON m.id = p.cover_media_id`;

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    body: row.body,
    categorySlug: row.c_slug,
    categoryName: row.c_name,
    client: row.client,
    role: row.role,
    year: row.year,
    cover: toMedia(row),
    coverWord: row.cover_word || row.title.split(' ')[0] || '',
    tint: row.tint,
    featured: row.featured === 1,
    sort: row.sort,
  };
}

/* ---------- Queries ---------- */

export async function listProjects(
  options: { featuredOnly?: boolean; categorySlug?: string } = {},
): Promise<Project[]> {
  const db = await getDb();
  const where = ["p.status = 'published'"];
  const binds: unknown[] = [];
  if (options.featuredOnly) where.push('p.featured = 1');
  if (options.categorySlug) {
    where.push('c.slug = ?');
    binds.push(options.categorySlug);
  }
  const { results } = await db
    .prepare(`${PROJECT_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.sort, p.id`)
    .bind(...binds)
    .all<ProjectRow>();
  return results.map(toProject);
}

export async function getProject(
  slug: string,
): Promise<{ project: Project; images: ProjectImage[]; next: Project | null } | null> {
  const db = await getDb();
  const row = await db
    .prepare(`${PROJECT_SELECT} WHERE p.slug = ? AND p.status = 'published'`)
    .bind(slug)
    .first<ProjectRow>();
  if (!row) return null;
  const project = toProject(row);

  const [imageRows, nextRow, firstRow] = await Promise.all([
    db
      .prepare(
        `SELECT pi.caption, ${MEDIA_COLUMNS} FROM project_images pi
         JOIN media m ON m.id = pi.media_id
         WHERE pi.project_id = ? ORDER BY pi.sort, pi.id`,
      )
      .bind(project.id)
      .all<MediaColumns & { caption: string }>(),
    db
      .prepare(
        `${PROJECT_SELECT} WHERE p.status = 'published' AND (p.sort > ? OR (p.sort = ? AND p.id > ?))
         ORDER BY p.sort, p.id LIMIT 1`,
      )
      .bind(project.sort, project.sort, project.id)
      .first<ProjectRow>(),
    db
      .prepare(`${PROJECT_SELECT} WHERE p.status = 'published' ORDER BY p.sort, p.id LIMIT 1`)
      .first<ProjectRow>(),
  ]);

  const images: ProjectImage[] = [];
  for (const r of imageRows.results) {
    const media = toMedia(r);
    if (media) images.push({ media, caption: r.caption });
  }
  const nextCandidate = nextRow ?? firstRow;
  const next = nextCandidate && nextCandidate.id !== project.id ? toProject(nextCandidate) : null;
  return { project, images, next };
}

export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT c.slug, c.name, COUNT(p.id) AS count FROM categories c
       JOIN projects p ON p.category_id = c.id AND p.status = 'published'
       GROUP BY c.id ORDER BY c.sort, c.name`,
    )
    .all<Category>();
  return results;
}

interface ServiceRow {
  id: number;
  slug: string;
  name: string;
  summary: string;
  includes: string;
  delivery: string;
  price_npr: number | null;
  price_usd: number | null;
}

export async function listServices(): Promise<Service[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT id, slug, name, summary, includes, delivery, price_npr, price_usd FROM services
       WHERE status = 'published' ORDER BY sort, id`,
    )
    .all<ServiceRow>();
  return results.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    summary: r.summary,
    includes: parseJsonArray<string>(r.includes),
    delivery: r.delivery,
    priceNpr: r.price_npr,
    priceUsd: r.price_usd,
  }));
}

/** Today's date in Nepal as YYYY-MM-DD, used to decide which offers are live. */
export function todayInNepal(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

interface OfferRow extends MediaColumns {
  id: number;
  title: string;
  details: string;
  service_name: string | null;
  discount_type: 'none' | 'percent' | 'fixed';
  discount_value: number;
  price_npr: number | null;
  price_usd: number | null;
  starts_at: string | null;
  ends_at: string | null;
  show_on_home: number;
}

export async function listActiveOffers(): Promise<Offer[]> {
  const db = await getDb();
  const today = todayInNepal();
  const { results } = await db
    .prepare(
      `SELECT o.id, o.title, o.details, s.name AS service_name, o.discount_type, o.discount_value,
         o.price_npr, o.price_usd, o.starts_at, o.ends_at, o.show_on_home, ${MEDIA_COLUMNS}
       FROM offers o
       LEFT JOIN services s ON s.id = o.service_id
       LEFT JOIN media m ON m.id = o.media_id
       WHERE o.status = 'published'
         AND (o.starts_at IS NULL OR o.starts_at = '' OR o.starts_at <= ?)
         AND (o.ends_at IS NULL OR o.ends_at = '' OR o.ends_at >= ?)
       ORDER BY COALESCE(o.ends_at, '9999-12-31'), o.id`,
    )
    .bind(today, today)
    .all<OfferRow>();
  return results.map((r) => ({
    id: r.id,
    title: r.title,
    details: r.details,
    serviceName: r.service_name,
    discountType: r.discount_type,
    discountValue: r.discount_value,
    priceNpr: r.price_npr,
    priceUsd: r.price_usd,
    startsAt: r.starts_at || null,
    endsAt: r.ends_at || null,
    media: toMedia(r),
    showOnHome: r.show_on_home === 1,
  }));
}

export async function listExperience(): Promise<Experience[]> {
  const db = await getDb();
  const { results } = await db
    .prepare('SELECT kind, title, organization, location, period FROM experience ORDER BY sort, id')
    .all<Experience>();
  return results;
}

async function getMediaMap(ids: string[]): Promise<Map<string, MediaRef>> {
  const wanted = ids.filter(Boolean);
  const map = new Map<string, MediaRef>();
  if (wanted.length === 0) return map;
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT ${MEDIA_COLUMNS} FROM media m WHERE m.id IN (${wanted.map(() => '?').join(',')})`,
    )
    .bind(...wanted)
    .all<MediaColumns>();
  for (const r of results) {
    const media = toMedia(r);
    if (media) map.set(media.id, media);
  }
  return map;
}

function safeUrl(value: string | undefined): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  const { results } = await db
    .prepare('SELECT key, value FROM settings')
    .all<{ key: string; value: string }>();
  const s = new Map(results.map((r) => [r.key, r.value]));
  const get = (key: string, fallback = ''): string => s.get(key) ?? fallback;

  const media = await getMediaMap([get('hero_photo'), get('contact_photo'), get('cv_file')]);

  const socials = [
    { label: 'Behance', url: safeUrl(get('behance')) },
    { label: 'LinkedIn', url: safeUrl(get('linkedin')) },
    { label: 'Upwork', url: safeUrl(get('upwork')) },
    { label: 'Instagram', url: safeUrl(get('instagram')) },
    { label: 'YouTube', url: safeUrl(get('youtube')) },
  ].filter((x) => x.url);

  return {
    name: get('name', 'Sahisnu Acharya'),
    firstName: get('first_name', 'Sahisnu'),
    lastName: get('last_name', 'Acharya'),
    role: get('role', 'Visual designer'),
    heroIntro: get('hero_intro'),
    available: get('available', '1') === '1',
    availableText: get('available_text', 'Available for freelance'),
    bookedText: get('booked_text', 'Booked for now'),
    aboutTitle: get('about_title'),
    aboutShort: get('about_short'),
    aboutBody: get('about_body'),
    tools: get('tools')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    location: get('location', 'Lalitpur, Nepal'),
    email: get('email'),
    whatsapp: get('whatsapp').replace(/\D/g, ''),
    socials,
    heroPhoto: media.get(get('hero_photo')) ?? null,
    contactPhoto: media.get(get('contact_photo')) ?? null,
    cvFile: media.get(get('cv_file')) ?? null,
    seoDescription: get('seo_description'),
  };
}

/** Used when the database cannot be reached, so error pages still render. */
export const FALLBACK_SETTINGS: Settings = {
  name: 'Sahisnu Acharya',
  firstName: 'Sahisnu',
  lastName: 'Acharya',
  role: 'Visual designer',
  heroIntro: '',
  available: true,
  availableText: 'Available for freelance',
  bookedText: 'Booked for now',
  aboutTitle: '',
  aboutShort: '',
  aboutBody: '',
  tools: [],
  location: 'Lalitpur, Nepal',
  email: '',
  whatsapp: '',
  socials: [],
  heroPhoto: null,
  contactPhoto: null,
  cvFile: null,
  seoDescription: 'Visual designer in Lalitpur, Nepal.',
};
