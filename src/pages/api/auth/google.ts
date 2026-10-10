import type { APIRoute } from 'astro';
import { Google, generateCodeVerifier, generateState } from 'arctic';
import { adminEmail, googleConfig } from '../../../lib/auth';

/** Starts "Sign in with Google". */
export const GET: APIRoute = ({ url, cookies, redirect }) => {
  const config = googleConfig(url);
  if (!config) return redirect('/admin/login?error=google_not_set', 303);

  const state = generateState();
  const verifier = generateCodeVerifier();
  const google = new Google(config.clientId, config.clientSecret, config.redirectUri);
  const authUrl = google.createAuthorizationURL(state, verifier, ['openid', 'email']);
  authUrl.searchParams.set('prompt', 'select_account');
  const hint = adminEmail();
  if (hint) authUrl.searchParams.set('login_hint', hint);

  const options = {
    path: '/api/auth/google',
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax' as const,
    maxAge: 600,
  };
  cookies.set('google_state', state, options);
  cookies.set('google_verifier', verifier, options);
  return redirect(authUrl.toString(), 302);
};
