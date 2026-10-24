import { expect, test } from '@playwright/test';

test('home lists every module', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  for (const title of ['Networking for Games', 'Unity Netcode for GameObjects', 'Steamworks with Facepunch', 'NGO + Steam Together'])
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('lesson can be marked complete and the state persists', async ({ page }) => {
  await page.goto('/modules/theory/packets-and-protocols/');
  const btn = page.locator('[data-mark-complete]');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('[data-mark-complete]')).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/modules/theory/');
  await expect(page.locator('[data-progress-text]').first()).toContainText('1/');
});

test('theme toggle switches data-theme', async ({ page }) => {
  await page.goto('/');
  const before = await page.locator('html').getAttribute('data-theme');
  await page.locator('[data-theme-toggle]').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', before!);
});

test('unknown pages show the 404', async ({ page }) => {
  const res = await page.goto('/does-not-exist/');
  expect(res?.status()).toBe(404);
});
