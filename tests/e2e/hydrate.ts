import { expect, type Page } from '@playwright/test';

/**
 * Hydrate every client:visible island on the page.
 *
 * A quick scroll sweep wakes most islands. Under load the browser can skip the IntersectionObserver callback for an
 * island that scrolled in and out between two frames, so any island still carrying [ssr] (Astro drops it once the
 * island hydrates) is then scrolled into view one at a time and waited for.
 */
export async function hydrateAll(page: Page) {
  await page.evaluate(async () => {
    const step = Math.max(400, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 30));
    }
  });
  const pending = page.locator('astro-island[ssr]');
  for (let n = await pending.count(); n > 0; n = await pending.count()) {
    // Look up and scroll in one step: the island may hydrate between count() and a locator action.
    await page.evaluate(() => document.querySelector('astro-island[ssr]')?.scrollIntoView({ block: 'center' }));
    await expect.poll(() => pending.count(), { timeout: 10_000 }).toBeLessThan(n);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForLoadState('networkidle');
  await expect(pending).toHaveCount(0);
}
