import { expect, test } from '@playwright/test';

// Discovery features: search modal, glossary filter, Term tooltips and the <Sequence> stepper.
// Runs against the production build (the Pagefind index only exists after `pnpm build`).

const LESSON = '/modules/theory/packets-and-protocols/';

test.describe('search', () => {
  test('Ctrl+K opens the modal and finds a lesson by its prose', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');
    const input = page.locator('pagefind-modal pagefind-input input');
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    await input.fill('head-of-line');
    const results = page.locator('pagefind-modal pagefind-results');
    await expect(results.locator(`a[href*="${LESSON}"]`).first()).toBeVisible();
  });

  test('glossary terms are searchable and the header button opens search', async ({ page }) => {
    await page.goto('/glossary/');
    await page.locator('[data-search-open]').first().click();
    const input = page.locator('pagefind-modal pagefind-input input');
    await expect(input).toBeVisible();
    await input.fill('UDP');
    await expect(page.locator('pagefind-modal pagefind-results a[href*="/glossary/"]').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(input).toBeHidden();
  });

  test('the /search/ page reads ?q=', async ({ page }) => {
    await page.goto('/search/?q=UDP');
    await expect(page.locator('.nl-search-page pagefind-results a').first()).toBeVisible();
  });
});

test.describe('glossary', () => {
  test('filter box narrows the list and can be cleared', async ({ page }) => {
    await page.goto('/glossary/');
    const cards = page.locator('[data-term-card]');
    const total = await cards.count();
    expect(total).toBeGreaterThan(1);

    const filter = page.locator('[data-glossary-filter]');
    await filter.fill('datagram');
    await expect(page.locator('[data-term-card]:visible')).not.toHaveCount(total);
    await expect(page.locator('article:has(#udp)')).toBeVisible();
    await expect(page.locator('article:has(#port)')).toBeHidden();
    await expect(page.locator('[data-glossary-count]')).toContainText(`of ${total}`);

    await filter.fill('zzzz-no-such-term');
    await expect(page.locator('[data-glossary-empty]')).toBeVisible();
    await page.locator('[data-glossary-clear]').click();
    await expect(page.locator('[data-term-card]:visible')).toHaveCount(total);
  });

  test('module chips filter and deep links are highlighted', async ({ page }) => {
    await page.goto('/glossary/#udp');
    expect(await page.locator('#udp').evaluate((el) => el.matches(':target'))).toBe(true);
    await expect(page.locator('article:has(#udp)')).toBeInViewport();
    const chip = page.locator('[data-module-chip="theory"]');
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-term-card]:visible').first()).toHaveAttribute('data-module', 'theory');
  });
});

test.describe('Term tooltip', () => {
  test('shows on keyboard focus, stays in the viewport, and closes on Escape', async ({ page }) => {
    await page.goto(LESSON);
    const link = page.locator('[data-term-wrap] > a').first();
    const tip = page.locator('[data-term-wrap]').first().locator('[role="tooltip"]');
    await expect(tip).toBeHidden();
    await link.focus();
    await expect(tip).toBeVisible();
    const id = await tip.getAttribute('id');
    await expect(link).toHaveAttribute('aria-describedby', id!);

    const box = (await tip.boundingBox())!;
    const vw = page.viewportSize()!.width;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vw);

    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();
    await expect(link).toBeFocused();
  });

  test('shows on hover (desktop) or first tap (touch)', async ({ page, isMobile }) => {
    await page.goto(LESSON);
    const wrap = page.locator('[data-term-wrap]').first();
    const tip = wrap.locator('[role="tooltip"]');
    if (isMobile) {
      await wrap.locator('> a').tap();
      await expect(tip).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${LESSON}$`)); // first tap does not navigate
    } else {
      await wrap.locator('> a').hover();
      await expect(tip).toBeVisible();
    }
    // Showing a tooltip never makes the page scroll sideways.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('Sequence stepper', () => {
  test('next / previous / reset move through the steps', async ({ page }) => {
    await page.goto(LESSON);
    const seq = page.locator('[data-sequence]').first();
    await seq.scrollIntoViewIfNeeded();
    const next = seq.locator('[data-testid="dg-next"]');
    await expect(next).toBeEnabled(); // hydrated
    await expect(seq).toHaveAttribute('data-step-index', '-1');

    await next.click();
    await expect(seq).toHaveAttribute('data-step-index', '0');
    await expect(seq.locator('[data-testid="dg-caption"]')).toContainText('1/');
    await next.click();
    await expect(seq).toHaveAttribute('data-step-index', '1');
    await expect(seq.locator('.dg-step[data-state="active"]')).toHaveCount(1);
    await expect(seq.locator('.dg-step[data-state="past"]')).toHaveCount(1);

    await seq.locator('[data-testid="dg-prev"]').click();
    await expect(seq).toHaveAttribute('data-step-index', '0');
    await seq.locator('[data-testid="dg-reset"]').click();
    await expect(seq).toHaveAttribute('data-step-index', '-1');
  });

  test('play advances on its own', async ({ page }) => {
    await page.goto(LESSON);
    const seq = page.locator('[data-sequence]').first();
    await seq.scrollIntoViewIfNeeded();
    await seq.locator('[data-testid="dg-play"]').click();
    await expect(seq).not.toHaveAttribute('data-step-index', '-1', { timeout: 5000 });
  });
});
