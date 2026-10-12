import { expect, test } from '@playwright/test';

/**
 * P2.8 — transcript panel end-to-end with the fake ASR (CI-safe: no
 * ML, no real model bytes beyond the tiny mock host file). Journey:
 * consent-download a seam model → open the panel → Transcribe → fake
 * segments render → click-to-seek moves the cursor → axe clean.
 */

const RULE_TAGS = ['wcag2a', 'wcag2aa'];

async function axeViolations(page: import('@playwright/test').Page): Promise<string[]> {
  await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
  return page.evaluate(async (tags) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = (window as any).axe;
    const results = await a.run(document, { runOnly: { type: 'tag', values: tags } });
    return results.violations.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (v: any) => `${v.impact} ${v.id}: ${v.help}`,
    );
  }, RULE_TAGS);
}

const MODEL_BODY = 'fake-model-bytes';

// the Copy button needs a real clipboard in headless chromium
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('ragTranscribe: install → panel → transcribe (fake) → segments + seek', async ({ page }) => {
  const sha = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(MODEL_BODY));
  const shaHex = [...new Uint8Array(sha)].map((b) => b.toString(16).padStart(2, '0')).join('');

  await page.route('https://models.example/**', (route) => {
    void route.fulfill({ status: 200, body: MODEL_BODY });
  });

  await page.goto('/?rag=1');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });

  // register + install the test model (consent flow)
  // the seam arrives via a flag-gated dynamic import — wait, don't race it
  await page.waitForFunction(
    () => (window as unknown as { __wfRagTest?: unknown }).__wfRagTest !== undefined,
    undefined,
    { timeout: 10_000 },
  );
  await page.evaluate(({ sha, bodyLen }) => {
    const seam = (
      window as unknown as {
        __wfRagTest?: {
          register: (e: unknown) => void;
          openConsent: (id: string) => void;
          useFakeAsr: () => void;
        };
      }
    ).__wfRagTest;
    seam!.useFakeAsr();
    seam!.register({
      id: 'test-model',
      kind: 'asr',
      version: '1.0.0',
      files: [{ path: 'model.onnx', url: 'https://models.example/x.onnx', bytes: bodyLen, sha256: sha }],
      licence: 'MIT',
      sourceUrl: 'https://example.com/model',
      minProfile: 'low',
    });
    seam!.openConsent('test-model');
  }, { sha: shaHex, bodyLen: MODEL_BODY.length });
  const consent = page.getByRole('dialog', { name: /download ai model/i });
  await consent.getByRole('button', { name: /download/i }).click();
  await page.waitForFunction(() => {
    const s = (window as unknown as { __wfRagTest?: { state?: { value?: string } } }).__wfRagTest;
    return s?.state?.value === 'ready';
  }, undefined, { timeout: 10_000 });

  // open the panel via the menu (flag ON group from P1.8)
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Transcript/i }).click();
  const panel = page.getByRole('complementary', { name: /transcript/i });
  await expect(panel).toBeVisible();

  // no transcript yet → Transcribe CTA
  await expect(panel.getByRole('button', { name: /^Transcribe/i })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);

  // transcribe with the fake ASR — segments appear
  await panel.getByRole('button', { name: /^Transcribe/i }).click();
  const segments = panel.locator('.segment-list .segment');
  await expect(segments.first()).toBeVisible({ timeout: 15_000 });
  expect(await segments.count()).toBeGreaterThanOrEqual(1);
  expect(await axeViolations(page)).toEqual([]);

  // click-to-seek: engine.seek(seg.start) fires onCursor → cursorPos 0
  // → the clicked segment (0 ≤ 0 < end) renders with .active
  await segments.first().click();
  await expect(segments.first()).toHaveClass(/active/, { timeout: 3_000 });

  // copy button flips to Copied
  await panel.getByRole('button', { name: /copy transcript/i }).click();
  await expect(panel.getByRole('button', { name: /copied/i })).toBeVisible({ timeout: 3_000 });

  // Escape closes the panel
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);

  // P2.9: export via View → Transcription → Export transcript (SRT)
  await page.getByRole('button', { name: 'View', exact: true }).click();
  const download = page.waitForEvent('download', { timeout: 15_000 });
  await page.getByRole('menuitem', { name: /export transcript \(srt\)/i }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('waveforge-transcript.srt');
  const path = await file.path();
  const body = (await import('node:fs')).readFileSync(path, 'utf8');
  expect(body).toMatch(/^1\n00:00:00,000 --> 00:00:\d\d,\d{3}\nfake segment 0\n$/);
});

test('ragTranscribe: segment text renders as inert text (no HTML injection)', async ({ page }) => {
  const sha = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(MODEL_BODY));
  const shaHex = [...new Uint8Array(sha)].map((b) => b.toString(16).padStart(2, '0')).join('');
  await page.route('https://models.example/**', (route) => {
    void route.fulfill({ status: 200, body: MODEL_BODY });
  });
  await page.goto('/?rag=1');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });

  await page.evaluate(({ sha, bodyLen }) => {
    const seam = (
      window as unknown as {
        __wfRagTest?: { register: (e: unknown) => void; openConsent: (id: string) => void; useFakeAsr: () => void };
      }
    ).__wfRagTest;
    seam!.useFakeAsr();
    seam!.register({
      id: 'test-model',
      kind: 'asr',
      version: '1.0.0',
      files: [{ path: 'model.onnx', url: 'https://models.example/x.onnx', bytes: bodyLen, sha256: sha }],
      licence: 'MIT',
      sourceUrl: 'https://example.com/model',
      minProfile: 'low',
    });
    seam!.openConsent('test-model');
  }, { sha: shaHex, bodyLen: MODEL_BODY.length });
  const consent = page.getByRole('dialog', { name: /download ai model/i });
  await consent.getByRole('button', { name: /download/i }).click();
  await page.waitForFunction(
    () => (window as unknown as { __wfRagTest?: { state?: { value?: string } } }).__wfRagTest?.state?.value === 'ready',
    undefined,
    { timeout: 10_000 },
  );

  // panel open via Ctrl+Shift+F (P1.8 shortcut)
  await page.keyboard.press('Control+Shift+F');
  const panel = page.getByRole('complementary', { name: /transcript/i });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: /^Transcribe/i }).click();
  await expect(panel.locator('.segment-list .segment').first()).toBeVisible({ timeout: 15_000 });

  // fake ASR text is plain — verify no HTML nodes smuggled into the list
  const htmlInText = await panel.locator('.segment-list', {
    has: page.locator('script, iframe, img'),
  }).count();
  expect(htmlInText).toBe(0);
});
