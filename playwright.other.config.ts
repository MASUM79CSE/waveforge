import { defineConfig } from '@playwright/test';

/**
 * Y3 — cross-browser pass (docs/quality-plan.md / gap-analysis A1): the
 * same e2e suite driven by Firefox and WebKit. Temporary verification
 * config — not part of the default `npx playwright test` run (which stays
 * Chromium + offline flow). Chromium-only fake-media launch args are
 * dropped; mic-dependent specs are expected to be environment-limited
 * there (no fake input device exists for these engines).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5179',
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  webServer: [
    {
      command: 'npx vite --port 5179 --strictPort',
      port: 5179,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npx vite preview --port 4179 --strictPort',
      port: 4179,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
  projects: [
    {
      name: 'firefox',
      testIgnore: [/offline\.spec\.ts$/, /record\.spec\.ts$/],
      use: { browserName: 'firefox' },
    },
    {
      name: 'webkit',
      testIgnore: [/offline\.spec\.ts$/, /record\.spec\.ts$/],
      use: { browserName: 'webkit' },
    },
    {
      name: 'firefox-offline',
      testMatch: /offline\.spec\.ts$/,
      use: { browserName: 'firefox', baseURL: 'http://localhost:4179' },
    },
    {
      name: 'webkit-offline',
      testMatch: /offline\.spec\.ts$/,
      use: { browserName: 'webkit', baseURL: 'http://localhost:4179' },
    },
  ],
});
