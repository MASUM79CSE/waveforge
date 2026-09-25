import { defineConfig } from '@playwright/test';

/**
 * e2e suite (M4–M6): flows #1 (load/play/edit), #3 (record via fake media),
 * #4 (export through the real workers), #5 (draft round-trip) and #6
 * (offline via a production build + real service worker, preview server).
 * Chromium only — the app targets evergreen browsers (PRD §2).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: 1, // one retry — full-suite load-timing flakes (infra, not product)
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
      command: 'npm run build && npx vite preview --port 4179 --strictPort',
      port: 4179,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'chromium-fake-media',
      testIgnore: /offline\.spec\.ts$/,
      use: {
        browserName: 'chromium',
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
      },
    },
    {
      name: 'chromium-preview',
      testMatch: /offline\.spec\.ts$/,
      use: {
        browserName: 'chromium',
        baseURL: 'http://localhost:4179',
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
      },
    },
  ],
});
