import type { APIRoute } from 'astro';
import { destroySession } from '../../../lib/auth';

export const POST: APIRoute = async ({ url, cookies, redirect }) => {
  await destroySession(cookies, url);
  return redirect('/admin/login?msg=signed_out', 303);
};
