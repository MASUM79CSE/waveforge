import { expect, test, type Page } from '@playwright/test';

/**
 * WF-004 — CSP enforcement proof. Runs in the chromium-preview project
 * (production build + vite preview) with CSP_ENFORCE=1, so the served
 * headers are the ENFORCING policy and any real violation both fires
 * `securitypolicyviolation` and visibly breaks the affected flow.
 *
 * The dev-server run is intentionally NOT the enforcement target: vite's
 * dependency pre-bundles use an esbuild CJS interop shim that calls
 * `new Function` (zod.js dev chunk), which the policy correctly blocks.
 * The production bundle contains zero eval/new Function (verified by
 * grep over dist/assets at audit time), so the same policy is clean on
 * the built app — this spec proves exactly that.
 */
function collectViolations(page: Page): Promise<
  Array<{ directive: string; blocked: string; disposition: string; source: string; sample: string }>
> {
  return page.evaluate(
    () =>
      (window as unknown as { __csp: Array<Record<string, string>> }).__csp ?? [],
  ) as Promise<
    Array<{ directive: string; blocked: string; disposition: string; source: string; sample: string }>
  >;
}

test('csp: zero violations across load + edit + wav/flac export + worklet probe', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: unknown[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__csp.push({
        directive: (e as SecurityPolicyViolationEvent).violatedDirective,
        blocked: (e as SecurityPolicyViolationEvent).blockedURI,
        disposition: (e as SecurityPolicyViolationEvent).disposition,
        source: (e as SecurityPolicyViolationEvent).sourceFile?.slice(0, 120) ?? '',
        sample: (e as SecurityPolicyViolationEvent).sample?.slice(0, 80) ?? '',
      });
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).showSaveFilePicker;
  });
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });

  // additive edit (worker round-trip + blob download path)
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('menuitem', { name: /Insert Silence/ }).click();

  // export WAV (default format) through the transferable worker pipeline
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: /export/i }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  let download = page.waitForEvent('download');
  await panel.getByRole('button', { name: /export/i }).click();
  expect(await download).toBeTruthy();

  // switch format in the same panel → FLAC export drives the vendored
  // libFLAC WASM inside its worker ('wasm-unsafe-eval' + worker blob:)
  await panel.getByTestId('export-format-flac').click();
  download = page.waitForEvent('download');
  await panel.getByRole('button', { name: /export/i }).click();
  const flac = await download;
  expect(flac.suggestedFilename()).toMatch(/\.flac$/i);

  // close the export panel before opening Diagnostics
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();

  // Help → Diagnostics auto-runs the capability probes, including the
  // AudioWorklet check that registers a blob:-URL worklet (worklet-src)
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await page.getByRole('menuitem', { name: /Diagnostics/i }).click();
  const diag = page.getByRole('dialog', { name: /Diagnostics/i });
  await expect(diag).toBeVisible();
  const rows = diag.locator('tbody tr');
  await expect(rows).toHaveCount(10, { timeout: 20_000 });
  await expect(rows.filter({ hasText: /worklet/i })).toContainText('✔');

  const violations = await collectViolations(page);
  expect(violations).toEqual([]);
});
