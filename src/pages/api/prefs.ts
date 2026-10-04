import type { APIRoute } from 'astro';

const ONE_YEAR = 60 * 60 * 24 * 365;

function safeBack(value: FormDataEntryValue | null): string {
  const back = typeof value === 'string' ? value : '/';
  return back.startsWith('/') && !back.startsWith('//') ? back : '/';
}

/** Saves theme and currency choices for visitors without JavaScript. */
export const POST: APIRoute = async ({ request, cookies, redirect, locals }) => {
  const form = await request.formData().catch(() => null);
  if (!form) return redirect('/', 303);
  const options = {
    path: '/',
    maxAge: ONE_YEAR,
    sameSite: 'lax' as const,
    secure: new URL(request.url).protocol === 'https:',
  };

  if (form.get('toggle') === 'theme') {
    cookies.set('theme', locals.theme === 'dark' ? 'light' : 'dark', options);
  }
  const currency = form.get('currency');
  if (currency === 'NPR' || currency === 'USD') {
    cookies.set('currency', currency, options);
  }
  return redirect(safeBack(form.get('back')), 303);
};
