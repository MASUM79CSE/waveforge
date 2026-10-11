import { expect, test, type Page } from '@playwright/test';

/**
 * P1.5 — consent + manage-models flow against a MOCKED model host.
 * Privacy contract: the only outbound request is the allow-listed model
 * download, after explicit consent (the egress guard generalizes in P1.7).
 */

const RULE_TAGS = ['wcag2a', 'wcag2aa'];

async function axeViolations(page: Page): Promise<string[]> {
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

test('rag: consent → download → manage → delete (mock host, axe clean)', async ({ page }) => {
  const sha = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(MODEL_BODY));
  const shaHex = [...new Uint8Array(sha)].map((b) => b.toString(16).padStart(2, '0')).join('');

  // mock model host — deterministic bytes, request-logged
  const modelRequests: string[] = [];
  await page.route('https://models.example/**', (route) => {
    modelRequests.push(route.request().url());
    void route.fulfill({ status: 200, body: MODEL_BODY });
  });

  await page.goto('/?rag=1');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.waitFor({ timeout: 10_000 });
  await page.keyboard.press('Escape');

  // register the test model through the flag-gated seam
  await page.evaluate(({ sha, bodyLen }) => {
    const seam = (
      window as unknown as {
        __wfRagTest?: {
          register: (e: unknown) => void;
          openConsent: (id: string) => void;
          openManage: () => void;
        };
      }
    ).__wfRagTest;
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

  // consent dialog appears with the honest privacy line
  const dialog = page.getByRole('dialog', { name: /download ai model/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/never leave this device/i);
  expect(await axeViolations(page)).toEqual([]);

  // download → dialog closes → state ready
  await dialog.getByRole('button', { name: /download/i }).click();
  await page.waitForFunction(() => {
    const s = (window as unknown as { __wfRagTest?: { state?: { value?: string } } }).__wfRagTest;
    return s?.state?.value === 'ready';
  }, undefined, { timeout: 10_000 });
  await expect(page.getByRole('dialog', { name: /download ai model/i })).toHaveCount(0);
  expect(modelRequests).toHaveLength(1);
  expect(modelRequests[0]).toContain('models.example');

  // manage: the model is listed, then deleted
  await page.evaluate(() => {
    (
      window as unknown as { __wfRagTest?: { openManage: () => void } }
    ).__wfRagTest!.openManage();
  });
  const manage = page.getByRole('dialog', { name: /manage ai models/i });
  await expect(manage).toBeVisible();
  await expect(manage).toContainText('test-model');
  expect(await axeViolations(page)).toEqual([]);
  await manage.getByRole('button', { name: /delete/i }).click();
  await expect(manage).toContainText(/no ai models installed/i);

  // Escape closes the manage dialog (keyboard chain)
  await page.keyboard.press('Escape');
  await expect(manage).toHaveCount(0);
});
