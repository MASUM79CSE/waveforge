import { defineConfig } from '@playwright/test';

/**
 * e2e suite (M4): flows #1 (load/play/edit), #3 (record via fake media),
 * #4 (export WAV/MP3/FLAC through the real workers). Chromium only — the
 * app targets evergreen browsers (PRD §2).
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
  webServer: {
    command: 'npx vite --port 5179 --strictPort',
    port: 5179,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium-fake-media',
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
  ],
});
