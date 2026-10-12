import { expect, test } from '@playwright/test';

/**
 * P3.7 — transcript search end-to-end with the fake ASR + fake embedder
 * (CI-safe: no ML models). Journey: consent-download a seam model →
 * panel → Transcribe → type in the search box → auto-index (on-device,
 * fake embedder) → hybrid results render as inert text nodes → click
 * seeks (active segment) → Enter-activated result seeks too → axe 0.
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

async function installAndTranscribe(page: import('@playwright/test').Page): Promise<void> {
  const sha = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(MODEL_BODY));
  const shaHex = [...new Uint8Array(sha)].map((b) => b.toString(16).padStart(2, '0')).join('');
  await page.route('https://models.example/**', (route) => {
    void route.fulfill({ status: 200, body: MODEL_BODY });
  });
  await page.goto('/?rag=1');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
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
  await page.waitForFunction(
    () => (window as unknown as { __wfRagTest?: { state?: { value?: string } } }).__wfRagTest?.state?.value === 'ready',
    undefined,
    { timeout: 10_000 },
  );
  await page.keyboard.press('Control+Shift+F');
  const panel = page.getByRole('complementary', { name: /transcript/i });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: /^Transcribe/i }).click();
  await expect(panel.locator('.segment-list .segment').first()).toBeVisible({ timeout: 15_000 });
}

test('ragSearch: type → auto-index (on-device) → results → click + Enter seek → axe 0', async ({ page }) => {
  await installAndTranscribe(page);
  const panel = page.getByRole('complementary', { name: /transcript/i });
  const input = panel.getByRole('searchbox', { name: /search in transcript/i });
  await expect(input).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);

  // type a query that matches the fake transcript text
  await input.fill('fake segment 1');
  const results = panel.locator('.search-results .segment');
  await expect(results.first()).toBeVisible({ timeout: 10_000 });

  // results are inert text nodes (transcripts are untrusted — never HTML)
  const smuggled = await panel
    .locator('.search-results', { has: page.locator('script, iframe, img') })
    .count();
  expect(smuggled).toBe(0);

  // click a result → seek to the chunk start (0) → a transcript segment
  // becomes active (the seek fired)
  await results.first().click();
  await expect(
    panel.locator('.segment-list:not(.search-results) .segment.active'),
  ).toBeVisible({ timeout: 3_000 });
  expect(await axeViolations(page)).toEqual([]);

  // keyboard: focus the first result and press Enter → same seek path
  await results.first().focus();
  await page.keyboard.press('Enter');
  await expect(
    panel.locator('.segment-list:not(.search-results) .segment.active'),
  ).toBeVisible({ timeout: 3_000 });

  // a query with no matches shows the empty status, never an error
  await input.fill('zzz-no-such-term');
  await expect(panel.getByText(/no matches in this transcript/i)).toBeVisible({ timeout: 10_000 });
  expect(await axeViolations(page)).toEqual([]);
});

test('ragSearch: index survives a panel reopen (idempotent, no re-index)', async ({ page }) => {
  await installAndTranscribe(page);
  const panel = page.getByRole('complementary', { name: /transcript/i });
  const input = panel.getByRole('searchbox', { name: /search in transcript/i });
  await input.fill('fake segment');
  await expect(panel.locator('.search-results .segment').first()).toBeVisible({ timeout: 10_000 });

  // close + reopen → stored index still serves queries instantly
  // (focus sat in the search input — blur first so the global Escape
  // chain sees the keydown)
  await page.getByRole('main').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await page.keyboard.press('Control+Shift+F');
  const panel2 = page.getByRole('complementary', { name: /transcript/i });
  await expect(panel2).toBeVisible();
  const input2 = panel2.getByRole('searchbox', { name: /search in transcript/i });
  await expect(input2).toBeVisible();
  await input2.fill('fake segment');
  await expect(panel2.locator('.search-results .segment').first()).toBeVisible({ timeout: 10_000 });
});
