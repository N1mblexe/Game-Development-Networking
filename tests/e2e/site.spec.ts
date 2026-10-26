import { readdirSync, readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { allRoutes, firstLessonOf, modules } from './routes';

// Whole-site checks: every route renders without console errors, nothing scrolls sideways at 360 px,
// and a representative set of pages has no axe violations in either theme.

/** Collect console errors and uncaught exceptions for the rest of the test. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400 && r.request().resourceType() !== 'document') errors.push(`${r.status()} ${r.url()}`);
  });
  return errors;
}

/** Scroll through the page so every client:visible island hydrates, then come back to the top. */
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
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0); // Astro drops [ssr] once an island hydrates
}

test.describe('every route', () => {
  for (const url of allRoutes) {
    test(`renders ${url}`, async ({ page }) => {
      const errors = watchErrors(page);
      const res = await page.goto(url);
      expect(res?.status()).toBe(200);
      await expect(page.locator('h1').first()).toBeVisible();
      await hydrateAll(page);
      expect(errors).toEqual([]);
    });
  }

  test('the 404 page renders', async ({ page }) => {
    const errors = watchErrors(page);
    const res = await page.goto('/no-such-page/');
    expect(res?.status()).toBe(404);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /course|home/i }).first()).toBeVisible();
    // The 404 document itself is reported as a failed resource load; nothing else may fail.
    expect(errors.filter((e) => !/Failed to load resource.*404/.test(e))).toEqual([]);
  });
});

test.describe('no horizontal overflow at 360 px', () => {
  test.skip(({ isMobile }) => isMobile, 'Sets its own viewport; once is enough.');
  for (const url of [...allRoutes, '/no-such-page/']) {
    test(url, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 780 });
      await page.goto(url);
      await hydrateAll(page);
      const { scrollWidth, innerWidth, culprits } = await page.evaluate(() => {
        const vw = window.innerWidth;
        // Report the outermost elements sticking out, to make failures actionable.
        const out = [...document.querySelectorAll('body *')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.right > vw + 1 && !el.closest('[class*="overflow-x-auto"], .dg-scroll, pre, .expressive-code, .sr-only');
          })
          .slice(0, 5)
          .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
        return { scrollWidth: document.documentElement.scrollWidth, innerWidth: vw, culprits: out };
      });
      expect(scrollWidth, `overflowing: ${culprits.join(' | ')}`).toBeLessThanOrEqual(innerWidth);
    });
  }
});

test.describe('accessibility (axe)', () => {
  const pages = ['/', ...modules.map(firstLessonOf), '/playground/', '/glossary/', '/modules/theory/exam/', '/review/'];
  for (const theme of ['light', 'dark'] as const) {
    for (const url of pages) {
      test(`${url} in ${theme} theme`, async ({ page }) => {
        await page.addInitScript((t) => localStorage.setItem('netlearn-theme', t), theme);
        await page.goto(url);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await hydrateAll(page);
        // Let entry transitions (sims fading in, packet dots) settle so contrast is measured on final colors.
        await page.waitForTimeout(300);
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        const summary = results.violations.map(
          (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => `${n.target.join(' ')} ${n.any[0]?.message ?? ''}`.trim()).slice(0, 6).join(' || ')}`,
        );
        expect(summary).toEqual([]);
      });
    }
  }
});

test.describe('lazy loading', () => {
  test.skip(({ isMobile }) => isMobile, 'Bundle behaviour does not depend on the device.');
  // Registry names map to component files: tcp-vs-udp → TcpVsUdp.tsx → TcpVsUdp.<hash>.js
  const simChunk = (name: string) => name.replace(/(^|-)([a-z])/g, (_m, _d, c: string) => c.toUpperCase());
  const allSims = readdirSync('src/components/sim')
    .filter((f) => /^[A-Z].*\.tsx$/.test(f) && f !== 'SimHost.tsx')
    .map((f) => f.replace('.tsx', ''));

  test('a lesson loads only the simulators it embeds', async ({ page }) => {
    const url = firstLessonOf('theory');
    const file = readdirSync('src/content/lessons/theory').find((f) => url.endsWith(`/${f.replace(/^\d+-|\.mdx$/g, '')}/`))!;
    const source = readFileSync(`src/content/lessons/theory/${file}`, 'utf8');
    const embedded = [...new Set([...source.matchAll(/<Sim\s[^>]*name="([^"]+)"/g)].map((m) => simChunk(m[1])))];
    expect(embedded.length).toBeGreaterThan(0);
    const scripts: string[] = [];
    page.on('request', (r) => {
      if (r.resourceType() === 'script') scripts.push(new URL(r.url()).pathname.split('/').pop()!);
    });
    await page.goto(url);
    await hydrateAll(page);
    const loaded = allSims.filter((s) => scripts.some((f) => f.startsWith(`${s}.`)));
    expect(loaded.sort()).toEqual(embedded.sort());
  });

  test('the Pagefind UI is only downloaded when search is opened', async ({ page }) => {
    const scripts: string[] = [];
    page.on('request', (r) => {
      if (r.resourceType() === 'script') scripts.push(r.url());
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(scripts.filter((u) => /component-ui/.test(u))).toEqual([]);
    await page.keyboard.press('Control+k');
    await expect(page.locator('pagefind-modal pagefind-input input')).toBeVisible();
    expect(scripts.filter((u) => /component-ui/.test(u)).length).toBeGreaterThan(0);
  });
});
