import { defineConfig } from '@playwright/test';

/**
 * WF-012 — production smoke suite. Runs against the LIVE deployment at
 * https://waveforge-chi.vercel.app (named deployment), NOT localhost.
 *
 * Traceability (how the suite ties the deployment to a commit):
 *   Production serves the Vite content-hash bundle built by Vercel.
 *   Vite content hashes are deterministic, so building a candidate
 *   commit locally and comparing the emitted entry chunk hash proves
 *   which commit the deployment serves. Measured 2026-10-13: prod
 *   HTML references `assets/index-ajTvOWzM.js` and a local
 *   `npm run build` of `22b6aba` (main) emits the identical
 *   `assets/index-ajTvOWzM.js` → deployed commit = `22b6aba`.
 *   Re-verify after each merge with:
 *     curl -s https://waveforge-chi.vercel.app/ | grep -oE 'assets/index-[^"]+\.js'
 *     git worktree add /tmp/wf-<sha> <sha> && npm ci && npm run build
 *     grep -oE 'assets/index-[^"]+\.js' /tmp/wf-<sha>/dist/index.html
 *
 * Usage: npm run test:smoke  (requires network access to the prod URL)
 * This suite is excluded from the standard e2e run (separate directory
 * + config, no webServer) because it tests the deployed artifact, not
 * the local build.
 */
export default defineConfig({
  testDir: './tests/smoke',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: 'https://waveforge-chi.vercel.app',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium-production', use: { browserName: 'chromium' } }],
});
