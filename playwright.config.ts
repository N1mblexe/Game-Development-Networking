import { defineConfig, devices } from '@playwright/test';

// Runs against the production build (search only works there). Run `pnpm build` first.
// Several agents/worktrees may run e2e at once: always pass CI=1 (never reuse someone else's server)
// and pick a free port with E2E_PORT if 4322 is taken.
const port = Number(process.env.E2E_PORT ?? 4322);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  webServer: {
    command: `pnpm astro preview --port ${port} --ignore-lock`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
