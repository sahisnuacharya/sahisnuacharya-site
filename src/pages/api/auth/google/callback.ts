import type { APIRoute } from 'astro';
import { Google, decodeIdToken } from 'arctic';
import { adminEmail, createSession, googleConfig } from '../../../../lib/auth';

interface GoogleClaims {
  iss?: string;
  aud?: string;
  email?: string;
  email_verified?: boolean;
}

/** Google sends the visitor back here after they choose an account. */
export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const config = googleConfig(url);
  if (!config) return redirect('/admin/login?error=google_not_set', 303);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = cookies.get('google_state')?.value;
  const verifier = cookies.get('google_verifier')?.value;
  cookies.delete('google_state', { path: '/api/auth/google' });
  cookies.delete('google_verifier', { path: '/api/auth/google' });

  if (!code || !state || !savedState || !verifier || state !== savedState) {
    return redirect('/admin/login?error=google_failed', 303);
  }

  try {
    const google = new Google(config.clientId, config.clientSecret, config.redirectUri);
    const tokens = await google.validateAuthorizationCode(code, verifier);
    // The token came straight from Google over HTTPS, so its contents can be trusted.
    const claims = decodeIdToken(tokens.idToken()) as GoogleClaims;
    const email = (claims.email ?? '').toLowerCase();
    const issuerOk = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
    if (!issuerOk || claims.aud !== config.clientId || claims.email_verified !== true) {
      return redirect('/admin/login?error=google_failed', 303);
    }
    if (!email || email !== adminEmail()) {
      return redirect('/admin/login?error=not_allowed', 303);
    }
    await createSession(cookies, url, email);
    return redirect('/admin', 303);
  } catch (error) {
    console.error('Google sign-in failed', error);
    return redirect('/admin/login?error=google_failed', 303);
  }
};
