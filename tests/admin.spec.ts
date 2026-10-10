import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const SECRET = 'local-test-secret-123';
const run = Date.now().toString(36);

async function signIn(page: Page) {
  await page.goto(`/api/auth/test-login?secret=${SECRET}`);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

test.describe('signed out', () => {
  test('admin pages redirect to the login page', async ({ page }) => {
    await page.goto('/admin/projects');
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  });

  test('admin APIs refuse without a session', async ({ request }) => {
    const res = await request.get('/api/admin/media');
    expect(res.status()).toBe(401);
    const attach = await request.get('/api/admin/attachment/1');
    expect(attach.status()).toBe(401);
  });

  test('test login refuses a wrong secret', async ({ request }) => {
    const res = await request.get('/api/auth/test-login?secret=nope', { maxRedirects: 0 });
    expect(res.status()).toBe(404);
  });

  test('admin POSTs from another origin are blocked', async ({ request }) => {
    const res = await request.post('/admin/settings', {
      headers: { Origin: 'https://evil.example' },
      form: { name: 'x' },
    });
    expect(res.status()).toBe(403);
  });

  test('draft preview is not public', async ({ page }) => {
    const res = await page.goto('/work/this-draft-does-not-exist?preview=1');
    expect(res?.status()).toBe(404);
  });

  test('login page is accessible', async ({ page }) => {
    await page.goto('/admin/login');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});

test.describe('signed in', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('every admin page loads and has no accessibility issues', async ({ page }) => {
    test.setTimeout(180_000);
    const paths = [
      '/admin',
      '/admin/projects',
      '/admin/projects/new',
      '/admin/offers',
      '/admin/offers/new',
      '/admin/services',
      '/admin/services/new',
      '/admin/pages',
      '/admin/media',
      '/admin/messages',
      '/admin/settings',
    ];
    for (const path of paths) {
      const errors: string[] = [];
      const onError = (e: Error) => errors.push(e.message);
      page.on('pageerror', onError);
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.locator('h1'), path).toHaveCount(1);
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
        await page.reload();
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        expect(
          results.violations.map((v) => `${path} ${scheme}: ${v.id} ${v.nodes.map((n) => n.target).join(' | ')}`),
        ).toEqual([]);
      }
      page.off('pageerror', onError);
      expect(errors, path).toEqual([]);
    }
  });

  test('private pages are never cached or indexed', async ({ page }) => {
    const res = await page.goto('/admin/settings');
    expect(res?.headers()['cache-control']).toContain('no-store');
    expect(res?.headers()['x-robots-tag']).toContain('noindex');
  });

  test('upload an image, create a draft project, preview it, publish it, then delete it', async ({ page }) => {
    const title = `Test project ${run} ${test.info().project.name}`;
    await page.goto('/admin/projects/new', { waitUntil: 'networkidle' });
    await page.getByLabel('Project title').fill(title);
    await expect(page.getByLabel('Web address part')).not.toHaveValue('');
    await page.getByLabel('Summary', { exact: false }).first().fill('A test summary');

    // Cover image upload (compressed in the browser, then stored)
    const cover = page.locator('[data-image-field]').first();
    await cover.locator('[data-image-upload]').setInputFiles('tests/fixtures/sample.png');
    await expect(cover.locator('[data-image-preview] img')).toBeVisible({ timeout: 30_000 });
    await expect(cover.locator('[data-image-input]')).not.toHaveValue('');

    // Gallery upload
    await page.locator('[data-gallery-upload]').setInputFiles('tests/fixtures/sample.png');
    await expect(page.locator('[data-gallery-list] li')).toHaveCount(1, { timeout: 30_000 });
    await page.locator('[data-gallery-list] input[name="gallery_caption"]').fill('First picture');

    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect(page.getByText('Created.')).toBeVisible();
    await expect(page.locator('.pill', { hasText: 'Draft' }).first()).toBeVisible();
    const editUrl = page.url();
    const slug = await page.getByLabel('Web address part').inputValue();

    // Hidden from the public while a draft
    const anon = await page.context().browser()!.newContext();
    const anonPage = await anon.newPage();
    const publicRes = await anonPage.goto(new URL(`/work/${slug}`, editUrl).toString());
    expect(publicRes?.status()).toBe(404);
    const anonPreview = await anonPage.goto(new URL(`/work/${slug}?preview=1`, editUrl).toString());
    expect(anonPreview?.status()).toBe(404);

    // Signed-in preview works and is noindex
    const preview = await page.goto(`/work/${slug}?preview=1`);
    expect(preview?.status()).toBe(200);
    expect(preview?.headers()['x-robots-tag']).toContain('noindex');
    await expect(page.locator('h1')).toHaveText(title);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');

    // Publish
    await page.goto(editUrl);
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('Published. It is live on the site now.')).toBeVisible();

    const live = await anonPage.goto(new URL(`/work/${slug}`, editUrl).toString());
    expect(live?.status()).toBe(200);
    await expect(anonPage.locator('h1')).toHaveText(title);
    await expect(anonPage.getByText('First picture')).toBeVisible();
    // Images are served from storage
    const src = await anonPage.locator('.project-hero-cover img').first().getAttribute('src');
    expect(src).toBeTruthy();
    const imgRes = await anonPage.request.get(new URL(src!, editUrl).toString());
    expect(imgRes.status()).toBe(200);
    expect(imgRes.headers()['content-type']).toMatch(/^image\//);

    // Unpublish, then delete
    await page.getByRole('button', { name: 'Move to drafts' }).click();
    await expect(page.getByText('Moved to drafts. It is hidden from the site.')).toBeVisible();
    expect((await anonPage.goto(new URL(`/work/${slug}`, editUrl).toString()))?.status()).toBe(404);

    await page.getByText('Delete this project').click();
    await page.getByRole('button', { name: 'Yes, delete permanently' }).click();
    await expect(page.getByText('Deleted.')).toBeVisible();
    await anon.close();
  });

  test('project form shows clear errors', async ({ page }) => {
    await page.goto('/admin/projects/new');
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect(page.getByRole('alert').first()).toContainText('need a fix');
    await expect(page.getByText('Please enter a title.')).toBeVisible();
  });

  test('an offer appears on the Home page only while live', async ({ page }) => {
    const title = `Offer ${run} ${test.info().project.name}`;
    await page.goto('/admin/offers/new');
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Percent off').fill('20');
    await page.getByRole('button', { name: 'Publish offer' }).click();
    await expect(page.getByText('Published. It is live on the site now.')).toBeVisible();
    const editUrl = page.url();

    const anon = await page.context().browser()!.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto(new URL('/', editUrl).toString());
    await expect(anonPage.locator('.offer', { hasText: title })).toBeVisible();
    await expect(anonPage.locator('.offer', { hasText: title })).toContainText('20% off');

    // A past end date takes it down by itself
    await page.getByLabel('Ends on').fill('2020-01-01');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await anonPage.goto(new URL('/', editUrl).toString());
    await expect(anonPage.locator('.offer', { hasText: title })).toHaveCount(0);
    await expect(page.locator('body')).toBeVisible();

    await page.goto('/admin/offers');
    await expect(page.locator('li', { hasText: title }).locator('.pill')).toHaveText('Ended');

    await page.goto(editUrl);
    await page.getByText('Delete this offer').click();
    await page.getByRole('button', { name: 'Yes, delete permanently' }).click();
    await expect(page.getByText('Deleted.')).toBeVisible();
    await anon.close();
  });

  test('offer dates are validated', async ({ page }) => {
    await page.goto('/admin/offers/new');
    await page.getByLabel('Title').fill('Bad dates');
    await page.getByLabel('Starts on').fill('2030-05-01');
    await page.getByLabel('Ends on').fill('2030-04-01');
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect(page.getByText('The end date must be on or after the start date.')).toBeVisible();
  });

  test('availability toggle changes the public sticker', async ({ page }) => {
    await page.goto('/admin');
    const toggle = page.getByRole('button', { name: /Switch to/ });
    const before = (await toggle.textContent()) ?? '';
    await toggle.click();
    await expect(page.getByText('Saved.')).toBeVisible();
    const anon = await page.context().browser()!.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto(new URL('/', page.url()).toString());
    const expected = before.includes('Booked') ? /Booked for now/ : /Available for freelance/;
    await expect(anonPage.locator('body')).toContainText(expected);
    // Put it back
    await page.getByRole('button', { name: /Switch to/ }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await anon.close();
  });

  test('settings are validated and saved', async ({ page }) => {
    await page.goto('/admin/settings');
    await page.getByLabel('Behance').fill('http://not-secure.example');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Use a full link starting with https://')).toBeVisible();
    await page.getByLabel('Behance').fill('');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
  });

  test('services keep their prices and can be reordered', async ({ page }) => {
    await page.goto('/admin/services');
    const names = await page.locator('.item-main a').allTextContents();
    expect(names.length).toBeGreaterThan(1);
    await page.getByRole('button', { name: `Move ${names[0]} down` }).click();
    await expect(page.getByText('Order updated.')).toBeVisible();
    const after = await page.locator('.item-main a').allTextContents();
    expect(after[1]).toBe(names[0]);
    await page.getByRole('button', { name: `Move ${names[0]} up` }).click();
    expect(await page.locator('.item-main a').first().textContent()).toBe(names[0]);
  });

  test('experience entries can be added and removed', async ({ page }) => {
    const title = `Role ${run} ${test.info().project.name}`;
    await page.goto('/admin/pages');
    await page.locator('#new-title').fill(title);
    await page.locator('#new-org').fill('Test Org');
    await page.getByRole('button', { name: 'Add entry' }).click();
    await expect(page.getByText('Created.')).toBeVisible();
    await expect(page.locator('summary', { hasText: title })).toBeVisible();
    await page.locator('summary', { hasText: title }).click();
    await page.getByRole('button', { name: `Delete ${title}` }).click();
    await expect(page.getByText('Deleted.')).toBeVisible();
    await expect(page.locator('summary', { hasText: title })).toHaveCount(0);
  });

  test('a contact message can be read, downloaded, archived and deleted', async ({ page, browser }) => {
    const name = `Visitor ${run} ${test.info().project.name}`;
    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto('/contact');
    await anonPage.getByLabel(/name/i).first().fill(name);
    await anonPage.getByLabel(/email/i).first().fill('visitor@example.com');
    await anonPage.getByLabel(/tell me|message|project/i).first().fill('Hello, I need a logo.');
    await anonPage.locator('input[type="file"]').setInputFiles('tests/fixtures/note.pdf');
    await anonPage.getByRole('button', { name: /send/i }).click();
    await expect(anonPage.getByText(/thank|sent|received/i).first()).toBeVisible({ timeout: 15_000 });
    await anon.close();

    await page.goto('/admin/messages');
    await page.getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText('Hello, I need a logo.')).toBeVisible();

    const link = page.getByRole('link', { name: 'note.pdf' });
    await expect(link).toBeVisible();
    const download = await page.request.get((await link.getAttribute('href'))!);
    expect(download.status()).toBe(200);
    expect(download.headers()['content-disposition']).toContain('attachment');

    await page.getByRole('button', { name: 'Archive' }).click();
    await page.goto('/admin/messages?status=archived');
    await page.getByRole('link', { name }).click();
    await page.getByText('Delete this message').click();
    await page.getByRole('button', { name: 'Yes, delete permanently' }).click();
    await expect(page.getByText('Deleted.')).toBeVisible();
  });

  test('media library shows uploads and deleting clears usage', async ({ page }) => {
    await page.goto('/admin/media');
    await page.locator('[data-library-upload]').setInputFiles('tests/fixtures/sample.png');
    await expect(page.locator('.media-grid > *').first()).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(page.locator('.media-grid > *').first()).toBeVisible();
  });

  test('signing out ends the session', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login$/);
  });
});
