import type { APIRoute } from 'astro';
import { adminEmail, createSession, testLoginAllowed } from '../../../lib/auth';

/**
 * Signs in during automated tests on this computer only. It needs TEST_LOGIN_SECRET,
 * which exists only in the local .dev.vars file, and it refuses any non-local address.
 */
export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  if (!testLoginAllowed(url, url.searchParams.get('secret'))) {
    return new Response('Not found', { status: 404 });
  }
  await createSession(cookies, url, adminEmail());
  return redirect('/admin', 303);
};
