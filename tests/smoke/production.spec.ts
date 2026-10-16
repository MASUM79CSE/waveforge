import { expect, test, type Page } from '@playwright/test';

/**
 * WF-012 — production smoke against the NAMED deployment
 * https://waveforge-chi.vercel.app, verified to serve commit `22b6aba`
 * (deterministic-bundle-hash method; see playwright.smoke.config.ts).
 *
 * The suite asserts structural facts that must hold for ANY deployed
 * commit of this app (single origin, shell renders, PWA live, audio
 * pipeline decodes/edits/exports) and RECORDS version-sensitive header
 * state (CSP enforcing vs Report-Only) into the test output instead of
 * hard-asserting it — the enforcing CSP lands on `main` with the
 * WF-004 merge and the assertion should be tightened then.
 *
 * Mock-media note (protocol): this suite never touches a real
 * microphone; sample-driven flows only.
 */

type Captured = { origins: Set<string>; errs: string[] };

function wireObservers(page: Page): void {
  const captured: Captured = { origins: new Set<string>(), errs: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') captured.errs.push(m.text());
  });
  page.on('pageerror', (e) => captured.errs.push(String(e)));
  page.on('request', (r) => captured.origins.add(new URL(r.url()).origin));
  (page as unknown as { __captured: Captured }).__captured = captured;
}

test.describe('production smoke @ 22b6aba', () => {
  test('shell: 200, zero console errors, menus, PWA live, CSP header present', async ({
    page,
  }) => {
    wireObservers(page);
    const resp = await page.goto('/');
    expect(resp?.status()).toBe(200);

    // welcome modal renders (shell booted)
    const welcome = page.getByRole('dialog', { name: /welcome/i });
    await expect(welcome).toBeVisible({ timeout: 15_000 });

    // all five menus present
    for (const menu of ['File', 'Edit', 'Effects', 'View', 'Help']) {
      await expect(page.getByRole('button', { name: menu, exact: true })).toBeVisible();
    }

    // PWA: service worker registered and controlling
    await page.waitForFunction(
      () => navigator.serviceWorker.ready.then(() => Boolean(navigator.serviceWorker.controller)),
      { timeout: 20_000 },
    );

    // CSP header present; record enforcing vs report-only state
    const csp = resp?.headers()['content-security-policy'] ?? '';
    const cspRO = resp?.headers()['content-security-policy-report-only'] ?? '';
    const mode = csp ? 'enforcing' : cspRO ? 'report-only' : 'absent';
    test.info().annotations.push({ type: 'csp-mode', description: mode });
    expect(mode).not.toBe('absent'); // some CSP must always be served

    // version-sensitive: tighten to 'enforcing' after the WF-004 merge to main
    if (csp) {
      expect(csp).toContain("default-src 'self'");
    }

    expect((page as unknown as { __captured: Captured }).__captured.errs).toEqual([]);
  });

  test('single origin: cold load requests the deployment origin only', async ({ page }) => {
    wireObservers(page);
    await page.goto('/');
    const welcome = page.getByRole('dialog', { name: /welcome/i });
    await expect(welcome).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1_500); // let SW precache settle

    const origins = (page as unknown as { __captured: Captured }).__captured.origins;
    const prod = new URL(process.env.SMOKE_URL ?? 'https://waveforge-chi.vercel.app').origin;
    const thirdParty = [...origins].filter((o) => o !== prod);
    expect(thirdParty, `third-party origins: ${thirdParty.join(', ')}`).toEqual([]);
  });

  test('audio pipeline: sample decodes, edit applies, WAV export downloads', async ({ page }) => {
    wireObservers(page);
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).showSaveFilePicker; // force blob-download path
    });
    await page.goto('/');
    const welcome = page.getByRole('dialog', { name: /welcome/i });
    await welcome.getByRole('button', { name: /load sample/i }).click();
    await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/9\.27 s/)).toBeVisible();

    // additive edit through the worker pipeline
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('menuitem', { name: /Insert Silence/ }).click();

    // WAV export on the deployed bundle
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: /export/i }).click();
    const panel = page.getByRole('dialog');
    await expect(panel).toBeVisible();
    const download = page.waitForEvent('download');
    await panel.getByRole('button', { name: /export/i }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.wav$/i);

    expect((page as unknown as { __captured: Captured }).__captured.errs).toEqual([]);
  });
});
