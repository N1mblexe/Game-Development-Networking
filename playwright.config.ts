import { defineConfig, devices } from '@playwright/test';

// Runs against the production build (search only works there). Run `pnpm build` first.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://localhost:4322', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm astro preview --port 4322 --ignore-lock',
    url: 'http://localhost:4322',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
