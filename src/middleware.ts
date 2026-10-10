import { defineMiddleware } from 'astro:middleware';
import { getAdminSession } from './lib/auth';
import type { Currency } from './lib/format';

const CANONICAL_HOST = 'sahisnuacharya.com.np';

function buildCsp(nonce: string, https: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com https://static.cloudflareinsights.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://cloudflareinsights.com https://challenges.cloudflare.com",
    'frame-src https://challenges.cloudflare.com',
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];
  if (https) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export const onRequest = defineMiddleware(async (context, next) => {
  const url = context.url;

  // One address for search engines: www goes to the main domain.
  if (url.hostname === `www.${CANONICAL_HOST}`) {
    url.hostname = CANONICAL_HOST;
    return context.redirect(url.toString(), 301);
  }

  // Visitor preferences, remembered in small cookies.
  const theme = context.cookies.get('theme')?.value;
  context.locals.theme = theme === 'light' || theme === 'dark' ? theme : null;

  const savedCurrency = context.cookies.get('currency')?.value;
  const country = (context.request as Request & { cf?: { country?: string } }).cf?.country;
  context.locals.currency =
    savedCurrency === 'NPR' || savedCurrency === 'USD'
      ? (savedCurrency as Currency)
      : country === 'NP'
        ? 'NPR'
        : 'USD';

  const nonce = randomNonce();
  context.locals.nonce = nonce;
  context.locals.admin = null;

  // Private area: admin pages and admin APIs need a signed-in session.
  const path = url.pathname;
  const isAdminPage = path === '/admin' || path.startsWith('/admin/');
  const isAdminApi = path.startsWith('/api/admin/');
  const isAuthApi = path.startsWith('/api/auth/');
  const isPrivate = isAdminPage || isAdminApi || isAuthApi;

  if (isPrivate && !['GET', 'HEAD'].includes(context.request.method)) {
    // Blocks forms and scripts posted from other websites.
    const origin = context.request.headers.get('Origin') ?? '';
    let sameOrigin = false;
    try {
      sameOrigin = new URL(origin).host === url.host;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  if (isAdminPage || isAdminApi) {
    context.locals.admin = await getAdminSession(context.cookies, url);
    const isLoginPage = path === '/admin/login';
    if (!context.locals.admin && !isLoginPage) {
      if (isAdminApi) {
        return Response.json({ ok: false, message: 'Please sign in again.' }, { status: 401 });
      }
      return context.redirect('/admin/login', 303);
    }
    if (context.locals.admin && isLoginPage && context.request.method === 'GET') {
      return context.redirect('/admin', 303);
    }
  }

  // Draft previews: the signed-in admin can open an unpublished project on its public page.
  const isPreview = path.startsWith('/work/') && url.searchParams.get('preview') === '1';
  if (isPreview) {
    context.locals.admin = await getAdminSession(context.cookies, url);
  }

  const original = await next();
  // Copy so headers are always writable, even on redirects and streamed responses.
  const response = new Response(original.body, original);

  const headers = response.headers;
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  );
  if (url.protocol === 'https:') {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  if (isPrivate) {
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  const type = headers.get('Content-Type') ?? '';
  if (type.includes('text/html')) {
    headers.set('Content-Security-Policy', buildCsp(nonce, url.protocol === 'https:'));
    // Pages change when the admin publishes, and they depend on the visitor's theme and currency.
    if (!isPrivate) headers.set('Cache-Control', 'private, no-cache');
    if (isPreview) headers.set('X-Robots-Tag', 'noindex, nofollow');
    headers.append('Vary', 'Cookie');
  }
  return response;
});
