import { expect, test, type Page } from '@playwright/test';
import { trRoutes } from './routes';

// Translated locales: every route exists under /tr/, the switcher and the one-time banner, English fallback pages,
// per-locale search, and that English pages never download Turkish text.

const TRANSLATED = '/tr/modules/theory/packets-and-protocols/';
const FALLBACK = '/tr/modules/theory/tick-rate/';
const STORAGE_KEY = 'netlearn-locale';

/** The visible switcher link (desktop bar, or the mobile menu after opening it). */
async function switchTo(page: Page, locale: string, isMobile: boolean) {
  if (isMobile) await page.locator('header details summary').click();
  await page.locator(`[data-locale-switch="${locale}"]:visible`).first().click();
}

/** Scroll through the page so every client:visible island hydrates (same as site.spec.ts). */
async function hydrateAll(page: Page) {
  await page.evaluate(async () => {
    const step = Math.max(400, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 30));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle');
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
}

test.describe('routes', () => {
  test.skip(({ isMobile }) => isMobile, 'Status codes do not depend on the device.');

  test(`all ${trRoutes.length} /tr routes return 200 with lang=tr`, async ({ request }) => {
    for (const route of trRoutes) {
      const res = await request.get(route);
      expect(res.status(), route).toBe(200);
      expect(await res.text(), route).toMatch(/<html[^>]*\blang="tr"/);
    }
  });

  test('unknown /tr/ pages show the 404 in Turkish', async ({ page }) => {
    const res = await page.goto('/tr/does-not-exist/');
    expect(res?.status()).toBe(404);
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
    await expect(page.locator('[data-nf="heading"]')).toHaveText('Bu paket kayboldu.');
    await expect(page.locator('[data-nf="back"]')).toHaveAttribute('href', '/tr/');
  });
});

test('the language switcher round-trips the same page and remembers the choice', async ({ page, isMobile }) => {
  await page.goto('/modules/theory/latency-jitter-loss/');
  await switchTo(page, 'tr', isMobile);
  await expect(page).toHaveURL(/\/tr\/modules\/theory\/latency-jitter-loss\/$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
  expect(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toBe('tr');

  await switchTo(page, 'en', isMobile);
  await expect(page).toHaveURL(/\/modules\/theory\/latency-jitter-loss\/$/);
  expect(new URL(page.url()).pathname.startsWith('/tr/')).toBe(false);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toBe('en');
});

test.describe('banner', () => {
  test.use({ locale: 'tr-TR' });

  test('offers Turkish once to a Turkish browser and stays dismissed', async ({ page }) => {
    await page.goto('/');
    const banner = page.locator('[data-locale-banner]');
    await expect(banner).toBeVisible();
    await expect(banner.locator('[data-locale-offer="tr"] a')).toHaveAttribute('href', /\/tr\/$/);
    await banner.locator('[data-locale-dismiss]:visible').click();
    await expect(banner).toBeHidden();
    await page.goto('/glossary/');
    await expect(page.locator('[data-locale-banner]')).toBeHidden();
    expect(new URL(page.url()).pathname).toBe('/glossary/');
  });

  test('is never shown on Turkish pages', async ({ page }) => {
    await page.goto('/tr/');
    await expect(page.locator('[data-locale-banner]')).toHaveCount(0);
  });
});

test.describe('english browser', () => {
  test.use({ locale: 'en-US' });

  test('sees no banner', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-locale-banner]')).toBeHidden();
  });
});

test.describe('lessons', () => {
  test('an untranslated lesson is an English fallback: notice, English canonical, not indexed', async ({ page }) => {
    await page.goto(FALLBACK);
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
    await expect(page.locator('[data-fallback-notice]')).toBeVisible();
    await expect(page.locator('[data-fallback-notice] a[hreflang="en"]')).toHaveAttribute('href', '/modules/theory/tick-rate/');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /^https?:\/\/[^/]+(\/[^/]+)*\/modules\/theory\/tick-rate\/$/);
    expect(await page.locator('link[rel="canonical"]').getAttribute('href')).not.toContain('/tr/');
    await expect(page.locator('[data-pagefind-body]')).toHaveCount(0);
    await expect(page.locator('h1')).toHaveAttribute('lang', 'en');
  });

  test('a translated lesson is Turkish and indexed', async ({ page }) => {
    await page.goto(TRANSLATED);
    await expect(page.locator('h1')).toHaveText('Paketler, Portlar ve Protokoller');
    await expect(page.locator('[data-fallback-notice]')).toHaveCount(0);
    await expect(page.locator('[data-pagefind-body]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  });

  test('a sim on a Turkish page shows Turkish labels', async ({ page }) => {
    await page.goto(FALLBACK);
    await hydrateAll(page);
    await expect(page.getByText('Mermi hızı').first()).toBeAttached();
    await expect(page.getByText('Süpürmeli çarpışma (CCD)').first()).toBeAttached();
    await expect(page.getByText('Projectile speed')).toHaveCount(0);
  });
});

test('Turkish search finds the translated lesson in the Turkish index', async ({ page }) => {
  await page.goto('/tr/search/?q=protokoller');
  await expect(page.locator(`.nl-search-page pagefind-results a[href*="${TRANSLATED}"]`).first()).toBeVisible();
});

test.describe('bundles', () => {
  test.skip(({ isMobile }) => isMobile, 'Bundle behaviour does not depend on the device.');

  test('English pages never download Turkish UI text', async ({ page }) => {
    const bodies: Promise<string>[] = [];
    page.on('response', (res) => {
      if (res.url().endsWith('.js')) bodies.push(res.text().catch(() => ''));
    });
    await page.goto('/modules/theory/tick-rate/');
    await hydrateAll(page);
    await expect(page.getByText('Projectile speed').first()).toBeAttached();
    await page.goto('/modules/ngo/rpcs/');
    await hydrateAll(page);
    const js = await Promise.all(bodies);
    expect(js.length).toBeGreaterThan(0);
    for (const text of js) {
      expect(text).not.toContain('Karanlık mod');
      expect(text).not.toContain('Mermi hızı');
    }
  });
});
