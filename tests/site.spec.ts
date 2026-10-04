import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const pages = [
  '/',
  '/work',
  '/work/brewfee-cafe-brand-identity',
  '/services',
  '/about',
  '/contact',
  '/privacy',
];

for (const path of pages) {
  test(`${path} loads with one h1 and no accessibility issues`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.reload();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        results.violations.map(
          (v) => `${scheme}: ${v.id} ${v.nodes.map((n) => n.target).join(' | ')}`,
        ),
      ).toEqual([]);
    }
    expect(errors).toEqual([]);
  });
}

test('unknown pages return 404', async ({ page }) => {
  const res = await page.goto('/work/does-not-exist');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('off the canvas');
});

test('theme toggle switches and remembers', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch color theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // Text must actually change color, not only the attribute.
  await expect(page.locator('h1')).toHaveCSS('color', 'rgb(242, 243, 247)');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('currency switch shows NPR prices', async ({ page }) => {
  await page.goto('/services');
  await page.getByRole('button', { name: 'NPR', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-currency', 'NPR');
  await expect(page.getByRole('button', { name: 'NPR', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('work filter narrows the list', async ({ page }) => {
  await page.goto('/work');
  const all = await page.locator('.work-grid .card').count();
  await page.getByRole('link', { name: /^Branding/ }).click();
  await expect(page).toHaveURL(/category=branding/);
  const filtered = await page.locator('.work-grid .card').count();
  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThan(all);
});

test('contact form shows errors, then sends', async ({ page }) => {
  await page.goto('/contact');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('#name-error')).toBeVisible();
  await page.getByLabel('Your name').fill('Playwright Test');
  await page.getByLabel('Email address').fill('test@example.com');
  await page.getByLabel('Message').fill('Hello, I would like a new logo for my cafe.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('status')).toContainText('Thanks');
});

test('security headers are set', async ({ request }) => {
  const res = await request.get('/');
  const h = res.headers();
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
});

test('contact attachments are never public', async ({ request }) => {
  const res = await request.get('/media/upload/anything');
  expect(res.status()).toBe(404);
});
