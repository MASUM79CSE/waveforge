import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * PF-02 / AM-06: clip fades + crossfade on the multitrack.
 * Flow: project mode → lane 1 clip → duplicate (adjacent pair) →
 * Edit ▸ Crossfade clip → mixdown export proves the overlap changed while
 * everything outside it is byte-identical, and undo restores the baseline.
 * Clip fades through the dialog ramp a clip's head; undo restores.
 */

async function loadSample(page: Page): Promise<void> {
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
}

/** Export the project mixdown and keep a tagged copy for byte comparisons. */
async function exportMixdown(page: Page, tag: string): Promise<Buffer> {
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: /export/i }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: /Export mixdown/i }).click();
  const file = await download;
  await page.keyboard.press('Escape'); // the dialog stays open on success
  await expect(panel).toBeHidden();
  await page.waitForTimeout(300);
  const bytes = readFileSync(await file.path());
  writeFileSync(`/tmp/pf02-${tag}.wav`, bytes);
  return bytes;
}

function dataSection(bytes: Buffer): { view: DataView; off: number; len: number; bits: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 12;
  let bits = 16;
  while (pos + 8 <= bytes.length) {
    const id = bytes.subarray(pos, pos + 4).toString('ascii');
    const size = bytes.readUInt32LE(pos + 4);
    if (id === 'fmt ') bits = bytes.readUInt16LE(pos + 22);
    if (id === 'data') return { view, off: pos + 8, len: size, bits };
    pos += 8 + size + (size % 2);
  }
  throw new Error('no data chunk');
}

function sampleAt(view: DataView, off: number, bits: number, i: number): number {
  // frame stride: stereo (mixdown is always 2ch) — left channel of frame i
  const stride = (bits / 8) * 2;
  const p = off + i * stride;
  if (bits === 16) return view.getInt16(p, true) / 32768;
  if (bits === 24) {
    const raw = view.getUint8(p) | (view.getUint8(p + 1) << 8) | (view.getUint8(p + 2) << 16);
    return ((raw << 8) >> 8) / 8388608;
  }
  return view.getFloat32(p, true); // float32
}

test('clip crossfade + fades: mixdown bytes prove the overlap, undo restores (AM-06)', async ({
  page,
}) => {
  await loadSample(page);
  await page.getByRole('button', { name: 'Add track', exact: true }).click(); // project mode
  const lane1 = page.locator('.lane').first();
  await expect(lane1).toContainText('demo.wav');

  // The lanes share the doc view: zoom out so the whole clip fits the lane,
  // then compute every click from the ×zoom readout (deterministic mapping).
  await page.keyboard.press('-');
  await page.keyboard.press('-');
  const spp = Number(
    (await page.locator('.status-item[title="Samples per pixel"]').textContent())?.slice(1),
  );
  expect(spp).toBeGreaterThan(0);
  const box = await lane1.locator('canvas').boundingBox();
  if (!box) throw new Error('lane canvas missing');
  const x = (sample: number): number => box.x + sample / spp; // inverse of the lane mapping
  const midY = box.y + box.height * 0.5;
  const DEMO_LEN = 408927; // demo.wav samples (9.272 s @ 44.1 kHz)

  // select the clip, trim its end to 262144 (5.94 s) via the right-edge zone
  await page.mouse.click(x(DEMO_LEN / 2), midY);
  await page.mouse.move(x(DEMO_LEN) - 2, midY); // 2 px inside the 6 px edge zone
  await page.mouse.down();
  await page.mouse.move(x(262144), midY, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.mouse.click(x(131072), midY); // mid clip 1
  await page.keyboard.press('Control+d');
  await page.waitForTimeout(400);

  const baseline = await exportMixdown(page, 'baseline');
  const Bpre = dataSection(baseline);
  const sr = 44100;
  const total = Bpre.len / ((Bpre.bits / 8) * 2);
  const boundary = Math.round(total / 2); // duplicate lands adjacent: total = 2 x clip

  // select the FIRST clip again and crossfade it with its duplicate
  await page.mouse.click(x(131072), midY);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /Crossfade clip/i }).click();
  await page.waitForTimeout(500);

  const xfade = await exportMixdown(page, 'xfade');

  // the crossfade overlap sits at the junction (~half the mixdown)
  const X = dataSection(xfade);
  expect(X.bits).toBe(Bpre.bits);
  const halfOverlap = Math.round(0.005 * sr); // ±5 ms around the boundary
  let sameOutside = 0;
  let diffInside = 0;
  for (let i = boundary - 4 * sr; i < boundary - halfOverlap; i += 997) {
    if (sampleAt(Bpre.view, Bpre.off, Bpre.bits, i) === sampleAt(X.view, X.off, X.bits, i)) sameOutside += 1;
  }
  for (let i = boundary - halfOverlap; i < boundary + halfOverlap; i += 3) {
    if (sampleAt(Bpre.view, Bpre.off, Bpre.bits, i) !== sampleAt(X.view, X.off, X.bits, i)) diffInside += 1;
  }
  expect(sameOutside).toBeGreaterThan(100); // far region untouched
  // The equal-power ramp thins toward p=1 (X -> baseline butt value) and
  // int16/24 quantization eats late-ramp frames, so ~half the window's
  // frames differ in practice (74 of ~147 at the 10 ms default ramp); the
  // exact cos/sin shape is pinned by kernel anchors. Prove "the overlap was
  // rewritten" = at least a third of the window's frames changed.
  expect(diffInside).toBeGreaterThanOrEqual(Math.round(halfOverlap / 3));

  // undo restores the baseline mixdown byte-for-byte
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  const restored = await exportMixdown(page, 'restored');
  expect(restored.equals(baseline)).toBe(true);

  // clip fades: select the SECOND clip, fade its head in 100 ms
  await page.mouse.click(x(393216), midY); // mid clip 2
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /Clip Fades/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('#text-prompt-value').fill('100, 0');
  await expect(dialog.locator('#text-prompt-value')).toHaveValue('100, 0');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await page.waitForTimeout(400);
  const faded = await exportMixdown(page, 'faded');
  const F = dataSection(faded);
  // clip 2 head: ramped from ~0 (quadratic fade) instead of full level
  const clip2Start = boundary; // duplicate lands right after the original
  const headVals: number[] = [];
  for (let i = 0; i < Math.round(0.05 * sr); i += 137) {
    headVals.push(Math.abs(sampleAt(F.view, F.off, F.bits, clip2Start + i)));
  }
  expect(headVals[0]).toBeLessThan(0.01); // ramp start ~0
  expect(headVals[headVals.length - 1]!).toBeGreaterThan(headVals[0]!); // rising
  // undo restores
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  const restored2 = await exportMixdown(page, 'restored2');
  expect(restored2.equals(baseline)).toBe(true);
});
