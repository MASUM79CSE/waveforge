import { expect, test } from '@playwright/test';
import { attachEgressGuard } from './helpers/egress';

/**
 * P2.10 — the Phase-2 privacy proof: the FULL transcription journey —
 * consent → mock-host model download → transcribe (fake ASR) → panel →
 * SRT export — makes ZERO un-allow-listed requests and ZERO request
 * bodies. The only outbound hit is the consented model file from the
 * documented mock host (allow-listed in the egress guard). Transcripts
 * and audio never leave the device.
 */

const MODEL_BODY = 'fake-model-bytes';

test('ragEgressJourney: consent → transcribe → export = allow-listed egress only, zero bodies', async ({
  page,
}) => {
  test.setTimeout(90_000);
  // headless: force the anchor-download fallback (export + transcript export)
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).showSaveFilePicker;
  });
  const egress = attachEgressGuard(page);

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
  // consent → download (the journey's single outbound request)
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

  // panel → transcribe → segments
  await page.keyboard.press('Control+Shift+F');
  const panel = page.getByRole('complementary', { name: /transcript/i });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: /^Transcribe/i }).click();
  await expect(panel.locator('.segment-list .segment').first()).toBeVisible({ timeout: 15_000 });

  // export SRT
  await page.getByRole('button', { name: 'View', exact: true }).click();
  const download = page.waitForEvent('download', { timeout: 15_000 });
  await page.getByRole('menuitem', { name: /export transcript \(srt\)/i }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('waveforge-transcript.srt');

  // THE invariant: zero violations, zero request bodies, exactly one
  // outbound hit — the consented model file from the allow-listed host
  expect(egress.violations()).toEqual([]);
  expect(egress.bodiesWithContentSize()).toBe(0);
  const outbound = egress
    .requests()
    .filter((u) => !u.startsWith('http://localhost') && !u.includes('.e2b.app'));
  expect(outbound).toEqual(['https://models.example/x.onnx']);
});
