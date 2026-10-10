import type { AstroCookies } from 'astro';
import { env } from 'cloudflare:workers';
import { getDb } from './db';
import { sendMail } from './mail';

export const SESSION_DAYS = 7;
const CODE_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const MAX_CODES_PER_HOUR = 5;

export interface AdminSession {
  email: string;
}

interface Vars {
  ADMIN_EMAIL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  TEST_LOGIN_SECRET?: string;
  SITE_URL?: string;
}
const vars = env as unknown as Vars;

export function adminEmail(): string {
  return (vars.ADMIN_EMAIL ?? '').trim().toLowerCase();
}

export function isLocalHost(url: URL): boolean {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
}

export function sessionCookieName(url: URL): string {
  // The __Host- prefix makes browsers refuse the cookie unless it is secure and site-wide.
  return url.protocol === 'https:' ? '__Host-session' : 'session';
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------- Sessions ---------- */

export async function createSession(cookies: AstroCookies, url: URL, email: string): Promise<void> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = base64url(bytes);
  const id = await sha256(token);
  const db = await getDb();
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')"),
    db
      .prepare(`INSERT INTO sessions (id, email, expires_at) VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))`)
      .bind(id, email.toLowerCase()),
  ]);
  cookies.set(sessionCookieName(url), token, {
    path: '/',
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

/** Returns the signed-in admin, or null. Cheap when there is no session cookie. */
export async function getAdminSession(cookies: AstroCookies, url: URL): Promise<AdminSession | null> {
  const token = cookies.get(sessionCookieName(url))?.value;
  if (!token || token.length < 20 || token.length > 100) return null;
  const admin = adminEmail();
  if (!admin) return null;
  const db = await getDb();
  const row = await db
    .prepare("SELECT email FROM sessions WHERE id = ? AND expires_at > datetime('now')")
    .bind(await sha256(token))
    .first<{ email: string }>();
  // A session only counts if it belongs to the current admin address.
  if (!row || row.email !== admin) return null;
  return { email: row.email };
}

export async function destroySession(cookies: AstroCookies, url: URL): Promise<void> {
  const name = sessionCookieName(url);
  const token = cookies.get(name)?.value;
  if (token) {
    const db = await getDb();
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(token)).run();
  }
  cookies.delete(name, { path: '/' });
}

/* ---------- Emailed sign-in code ---------- */

interface CodeRow {
  code_hash: string;
  attempts: number;
  locked: number;
  fresh: number;
  recent: number;
  window_expired: number;
  sent_in_window: number;
}

async function codeState(db: D1Database): Promise<CodeRow> {
  await db.prepare('INSERT OR IGNORE INTO login_codes (id) VALUES (1)').run();
  const row = await db
    .prepare(
      `SELECT code_hash, attempts, sent_in_window,
         (locked_until IS NOT NULL AND locked_until > datetime('now')) AS locked,
         (expires_at > datetime('now')) AS fresh,
         (last_sent_at IS NOT NULL AND last_sent_at > datetime('now', '-60 seconds')) AS recent,
         (window_start IS NULL OR window_start <= datetime('now', '-1 hour')) AS window_expired
       FROM login_codes WHERE id = 1`,
    )
    .first<CodeRow>();
  if (!row) throw new Error('login_codes row missing');
  return row;
}

function sixDigits(): string {
  const buf = new Uint32Array(1);
  // Rejection sampling keeps every code equally likely.
  for (;;) {
    crypto.getRandomValues(buf);
    const n = buf[0] ?? 0;
    if (n < 4_294_000_000) return String(n % 1_000_000).padStart(6, '0');
  }
}

export type RequestCodeResult = 'sent' | 'ignored' | 'throttled' | 'locked' | 'failed';

export async function requestLoginCode(emailInput: string): Promise<RequestCodeResult> {
  const email = emailInput.trim().toLowerCase();
  const admin = adminEmail();
  if (!admin || email !== admin) return 'ignored';
  const db = await getDb();
  const state = await codeState(db);
  if (state.locked) return 'locked';
  if (state.recent) return 'throttled';
  if (!state.window_expired && state.sent_in_window >= MAX_CODES_PER_HOUR) return 'throttled';

  const code = sixDigits();
  await db
    .prepare(
      `UPDATE login_codes SET code_hash = ?, attempts = 0, last_sent_at = datetime('now'),
         expires_at = datetime('now', '+${CODE_MINUTES} minutes'),
         window_start = CASE WHEN ? THEN datetime('now') ELSE window_start END,
         sent_in_window = CASE WHEN ? THEN 1 ELSE sent_in_window + 1 END
       WHERE id = 1`,
    )
    .bind(await sha256(`${admin}:${code}`), state.window_expired, state.window_expired)
    .run();

  if (import.meta.env.DEV) console.log(`[dev] Admin sign-in code: ${code}`);
  const sent = await sendMail({
    to: admin,
    subject: `Your sign-in code: ${code}`,
    text: [
      `Your code to sign in to the sahisnuacharya.com.np admin panel is:`,
      '',
      `    ${code}`,
      '',
      `It works for ${CODE_MINUTES} minutes. If you did not ask for it, you can ignore this email.`,
    ].join('\n'),
    fromName: 'Site admin',
  });
  return sent || import.meta.env.DEV ? 'sent' : 'failed';
}

export type VerifyCodeResult = 'ok' | 'invalid' | 'expired' | 'locked';

export async function verifyLoginCode(emailInput: string, codeInput: string): Promise<VerifyCodeResult> {
  const email = emailInput.trim().toLowerCase();
  const code = codeInput.replace(/\D/g, '');
  const admin = adminEmail();
  if (!admin || email !== admin || code.length !== 6) return 'invalid';
  const db = await getDb();
  const state = await codeState(db);
  if (state.locked) return 'locked';
  if (!state.code_hash || !state.fresh) return 'expired';

  if (safeEqual(state.code_hash, await sha256(`${admin}:${code}`))) {
    await db.prepare("UPDATE login_codes SET code_hash = '', attempts = 0 WHERE id = 1").run();
    return 'ok';
  }
  const attempts = state.attempts + 1;
  if (attempts >= MAX_CODE_ATTEMPTS) {
    await db
      .prepare(
        `UPDATE login_codes SET code_hash = '', attempts = 0,
           locked_until = datetime('now', '+${LOCK_MINUTES} minutes') WHERE id = 1`,
      )
      .run();
    return 'locked';
  }
  await db.prepare('UPDATE login_codes SET attempts = ? WHERE id = 1').bind(attempts).run();
  return 'invalid';
}

/* ---------- Google ---------- */

export function googleConfig(url: URL): { clientId: string; clientSecret: string; redirectUri: string } | null {
  const clientId = (vars.GOOGLE_CLIENT_ID ?? '').trim();
  const clientSecret = (vars.GOOGLE_CLIENT_SECRET ?? '').trim();
  if (!clientId || !clientSecret || clientSecret === 'local-dev-placeholder') return null;
  const origin = isLocalHost(url) ? url.origin : (vars.SITE_URL ?? url.origin).replace(/\/$/, '');
  return { clientId, clientSecret, redirectUri: `${origin}/api/auth/google/callback` };
}

/** Only for automated tests on this computer. Does nothing on the live site. */
export function testLoginAllowed(url: URL, secret: string | null): boolean {
  const expected = vars.TEST_LOGIN_SECRET ?? '';
  return isLocalHost(url) && expected.length >= 16 && !!secret && safeEqual(secret, expected);
}
