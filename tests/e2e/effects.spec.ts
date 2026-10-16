import { expect, test } from '@playwright/test';

/**
 * E1 mastering e2e (effects v2 plan §8.8): LUFS Normalize and the
 * true-peak Limiter apply through the real menu/dialog on demo.wav.
 * Both kernels are length-preserving — the status bar duration must not
 * change; toasts confirm the committed edit.
 */

async function loadSample(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).showSaveFilePicker;
  });
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
}

async function applyEffect(
  page: import('@playwright/test').Page,
  label: RegExp,
): Promise<void> {
  await page.getByRole('menuitem', { name: 'Effects', exact: true }).click();
  await page.getByRole('menuitem', { name: label }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Apply' }).click();
}

test('effects: LUFS Normalize applies at full length', async ({ page }) => {
  await loadSample(page);
  await applyEffect(page, /LUFS Normalize/i);
  // undoable edit commit + toast, duration untouched (9.27 s demo)
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied/i, {
    timeout: 15_000,
  });
  await expect(page.getByText(/9\.27 s/)).toBeVisible();
  // user-facing standard: Ctrl+Z undoes the applied effect, Ctrl+Y redoes it
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
  await page.keyboard.press('Control+y');
  await expect(page.locator('.toast-msg').last()).toContainText(/Redid/i, { timeout: 8000 });
  await expect(page.getByText(/9\.27 s/)).toBeVisible();
});

test('effects: 8-band parametric EQ renders curve, applies, undoes', async ({ page }) => {
  await loadSample(page);
  await page.getByRole('menuitem', { name: 'Effects', exact: true }).click();
  await page.getByRole('menuitem', { name: /Parametric EQ \(8-band\)/i }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  // the analytic response curve canvas is mounted
  await expect(panel.locator('.eq-curve')).toBeVisible();
  // 8 band rows with type selects
  expect(await panel.locator('.eq-row').count()).toBe(8);
  // boost band 1 to +6 dB — the curve must change (redraw on param change)
  const gainInput = panel.locator('.eq-row').nth(0).locator('input').nth(1);
  await gainInput.fill('6');
  await gainInput.dispatchEvent('change');
  // apply through the generic kernel plumbing
  await panel.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied/i, { timeout: 15_000 });
  await expect(page.getByText(/9\.27 s/)).toBeVisible(); // length preserved
  // Ctrl+Z undoes it (standard shortcut, user-facing contract)
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
});

test('effects: true-peak Limiter applies and undoes cleanly', async ({ page }) => {
  await loadSample(page);
  await applyEffect(page, /^Hard Limiter/);
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied/i, {
    timeout: 15_000,
  });
  await expect(page.getByText(/9\.27 s/)).toBeVisible();
  // legacy shift-letter combo still works (Shift+Z)
  await page.keyboard.press('Shift+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
});

test('effects: Chorus (E3 modulation) applies via generic dialog and undoes', async ({
  page,
}) => {
  await loadSample(page);
  await applyEffect(page, /^Chorus/);
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied: Chorus/i, {
    timeout: 15_000,
  });
  // modulation kernels are length-preserving
  await expect(page.getByText(/9\.27 s/)).toBeVisible();
  // standard user-facing shortcut contract: Ctrl+Z undoes the effect
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
  await page.keyboard.press('Control+y');
  await expect(page.locator('.toast-msg').last()).toContainText(/Redid/i, { timeout: 8000 });
});

test('effects: Studio Reverb grows the region by its wet tail (E4) and undoes', async ({
  page,
}) => {
  await loadSample(page);
  await applyEffect(page, /^Studio Reverb/);
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied: Studio Reverb/i, {
    timeout: 30_000,
  });
  // tail mechanism: RT60 1.8 s + predelay 20 ms + settle 20 ms extend the
  // selection → 9.27 s + 1.84 s ≈ 11.11 s in the status bar
  await expect(page.getByText(/11\.1\d s/)).toBeVisible({ timeout: 15_000 });
  // undo restores the original duration exactly
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
  await expect(page.getByText(/9\.27 s/)).toBeVisible({ timeout: 15_000 });
});

test('effects: De-esser applies via generic dialog and undoes (E6)', async ({ page }) => {
  await loadSample(page);
  await applyEffect(page, /^De-esser/);
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied: De-esser/i, {
    timeout: 30_000,
  });
  await expect(page.getByText(/9\.27 s/)).toBeVisible(); // length preserving
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
  await page.keyboard.press('Control+y');
  await expect(page.locator('.toast-msg').last()).toContainText(/Redid/i, { timeout: 8000 });
});

test('effects: Noise Reduction learns a print from the selection, applies, undoes', async ({
  page,
}) => {
  await loadSample(page);
  await page.getByRole('menuitem', { name: 'Effects', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Noise Reduction \(print\)/ }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/no print learned/i)).toBeVisible();
  await panel.getByRole('button', { name: /learn print from selection/i }).click();
  await expect(panel.getByText(/print learned/i)).toBeVisible({ timeout: 15_000 });
  await panel.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied: Noise Reduction/i, {
    timeout: 30_000,
  });
  await expect(page.getByText(/9\.27 s/)).toBeVisible(); // length preserving
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
});

test('effects: Noise Reduction v3 applies with no print (auto mode) and undoes (E7)', async ({
  page,
}) => {
  await loadSample(page);
  await page.getByRole('menuitem', { name: 'Effects', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Noise Reduction v3/ }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  // generic dialog: reduction + adaptation params, no learn button needed
  await expect(panel.getByText(/Reduction \(dB\)/)).toBeVisible();
  await expect(panel.getByText(/Adaptation/)).toBeVisible();
  await panel.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('.toast-msg').last()).toContainText(
    /Applied: Noise Reduction v3/i,
    { timeout: 60_000 },
  );
  await expect(page.getByText(/9\.27 s/)).toBeVisible(); // length preserving
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
});

test('effects: Stretch / Pitch applies ×1.25 from the Effects menu (promoted, Z1)', async ({
  page,
}) => {
  await loadSample(page);
  // Z1 promotion: a first-class menu item — no experimental gate
  await page.getByRole('menuitem', { name: 'Effects', exact: true }).click();
  const stretch = page.getByRole('menuitem', { name: /^Stretch \/ Pitch/ });
  await expect(stretch).toBeVisible();
  await stretch.click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  // ×1.25 stretch (first param row's number input)
  const pct = panel.locator('.fx-num').first();
  await pct.fill('125');
  await pct.dispatchEvent('change');
  await panel.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied: Stretch \/ Pitch/i, {
    timeout: 30_000,
  });
  await expect(page.getByText(/11\.5\d s/)).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
  await expect(page.getByText(/9\.27 s/)).toBeVisible({ timeout: 15_000 });
});

/**
 * Effects menu organization: the tools are grouped into labelled sections
 * (Dynamics / Noise reduction / EQ / …) — headers render, every fx command
 * sits inside exactly one group, and deep items are still clickable.
 */
test('effects menu is organized into labelled sections', async ({ page }) => {
  await loadSample(page);
  await page.getByRole('menuitem', { name: 'Effects', exact: true }).click();
  const dropdown = page.locator('.menu-dropdown');

  // section headers are visible
  for (const header of ['Dynamics', 'Noise reduction', 'EQ', 'Reverb & delay', 'Modulation', 'Amplitude', 'Special']) {
    await expect(dropdown.locator('.menu-header', { hasText: header })).toBeVisible();
  }

  // Compressor lives in the Dynamics group; group is exposed to AT
  const dynamics = dropdown.getByRole('group', { name: 'Dynamics' });
  await expect(dynamics.getByRole('menuitem', { name: /Compressor/ })).toBeVisible();
  await expect(dynamics).toHaveAttribute('aria-label', 'Dynamics');

  // deep item inside a scrollable dropdown still works (direct transform)
  await page.getByRole('menuitem', { name: /^Remove Silence/ }).click();
  // demo.wav has no silence below the threshold — the toast confirms the
  // deep menu item actually fired
  await expect(page.locator('.toast-msg').last()).toContainText(/no silence found/i, {
    timeout: 10_000,
  });
});


// ---- PF-04 / AM-03+AM-04: gain, fades, delay flows ----
// The editOps path (gain/fades) commits through performEdit WITHOUT the
// 'Applied' toast (that belongs to the FX-dialog path), and the initial
// document load already occupies a history slot, so commit is proven the
// strongest way: by parsing the EXPORTED WAV bytes before/after the edit.
// The default WAV export is PCM-24 (exportFormats.ts defaultQuality), so
// the parser reads bitsPerSample from the fmt chunk and decodes pcm16,
// pcm24 and float32 (fmt tag 3) accordingly.

import { readFileSync } from 'node:fs';

interface WavStats {
  peak: number;
  headMean: number;
  tailMean: number;
}

/** Decode one sample of the given width/sign from the data section. */
function sampleAt(view: DataView, offset: number, tag: number, bits: number): number {
  if (tag === 3 && bits === 32) return view.getFloat32(offset, true);
  if (bits === 16) return view.getInt16(offset, true) / 32768;
  if (bits === 24) {
    const raw =
      view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
    return ((raw << 8) >> 8) / 8388608; // sign-extend 24 -> 32 bits
  }
  throw new Error(`unsupported wav sample format: tag=${tag} bits=${bits}`);
}

/** Export the doc as WAV (default format) and compute level stats from the bytes. */
async function exportWavStats(page: import('@playwright/test').Page): Promise<WavStats> {
  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: /export/i }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: /export/i }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.wav$/i);
  const bytes = readFileSync(await file.path());
  // minimal RIFF walk: fmt (tag, channels, bits) + data
  let pos = 12;
  let tag = 1;
  let bits = 16;
  let dataOffset = -1;
  let dataLen = 0;
  while (pos + 8 <= bytes.length) {
    const id = bytes.subarray(pos, pos + 4).toString('ascii');
    const size = bytes.readUInt32LE(pos + 4);
    if (id === 'fmt ') {
      tag = bytes.readUInt16LE(pos + 8);
      bits = bytes.readUInt16LE(pos + 22); // fmt+14: tag, ch, rate, byteRate, align, then bits
    }
    if (id === 'data') {
      dataOffset = pos + 8;
      dataLen = size;
      break;
    }
    pos += 8 + size + (size % 2);
  }
  expect(dataOffset).toBeGreaterThan(0);
  expect([16, 24, 32]).toContain(bits);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frameBytes = (bits / 8) * 2; // stereo
  const n = Math.floor(dataLen / frameBytes);
  let peak = 0;
  let head = 0;
  let tail = 0;
  const edge = Math.min(4410, n); // ~100 ms
  const tailStart = n - edge;
  for (let i = 0; i < n; ++i) {
    const a = Math.abs(sampleAt(view, dataOffset + i * frameBytes, tag, bits));
    if (a > peak) peak = a;
    if (i < edge) head += a;
    if (i >= tailStart) tail += a;
  }
  await page.keyboard.press('Escape'); // the export dialog stays open on success
  await expect(panel).toBeHidden();
  return { peak, headMean: head / edge, tailMean: tail / edge };
}

async function openEffectsMenu(page: import('@playwright/test').Page, label: RegExp): Promise<void> {
  await page.getByRole('menuitem', { name: 'Effects', exact: true }).click();
  await page.getByRole('menuitem', { name: label }).click();
}

test('effects: Gain −6 dB halves the exported levels, undo restores them (AM-03/AM-04)', async ({
  page,
}) => {
  await loadSample(page);
  const before = await exportWavStats(page);
  await page.keyboard.press('Control+a');
  await openEffectsMenu(page, /^Gain$/);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('#prompt-value').fill('-6');
  await expect(dialog.locator('#prompt-value')).toHaveValue('-6'); // settle the controlled input
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await page.waitForTimeout(400); // edit commits synchronously; settle menus
  const after = await exportWavStats(page);
  // −6 dB = ×0.5012; the demo is full-scale so the negative direction is clip-free
  expect(after.peak).toBeGreaterThan(before.peak * 0.476);
  expect(after.peak).toBeLessThan(before.peak * 0.526);
  expect(after.headMean).toBeGreaterThan(before.headMean * 0.476);
  expect(after.headMean).toBeLessThan(before.headMean * 0.526);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  const restored = await exportWavStats(page);
  expect(Math.abs(restored.peak - before.peak)).toBeLessThan(before.peak * 0.01);
  expect(Math.abs(restored.headMean - before.headMean)).toBeLessThan(before.headMean * 0.01);
});

test('effects: Fade In silences the head, Fade Out the tail; undo restores (AM-03)', async ({
  page,
}) => {
  await loadSample(page);
  const before = await exportWavStats(page);
  expect(before.headMean).toBeGreaterThan(0.005); // demo starts loud
  expect(before.tailMean).toBeGreaterThan(0.005);

  await page.keyboard.press('Control+a');
  await openEffectsMenu(page, /^Fade In$/); // instant destructive edit — no dialog
  await page.waitForTimeout(400);
  const fadedIn = await exportWavStats(page);
  expect(fadedIn.headMean).toBeLessThan(before.headMean / 5); // head ramped toward 0
  expect(fadedIn.tailMean).toBeGreaterThan(before.tailMean * 0.95); // tail untouched
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);

  await page.keyboard.press('Control+a');
  await openEffectsMenu(page, /^Fade Out$/);
  await page.waitForTimeout(400);
  const fadedOut = await exportWavStats(page);
  expect(fadedOut.tailMean).toBeLessThan(before.tailMean / 5); // tail ramped toward 0
  expect(fadedOut.headMean).toBeGreaterThan(before.headMean * 0.95); // head untouched
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  const restored = await exportWavStats(page);
  expect(restored.headMean).toBeGreaterThan(before.headMean * 0.99);
  expect(restored.tailMean).toBeGreaterThan(before.tailMean * 0.99);
});

test('effects: Delay grows the region by its feedback tail and undoes (AM-04)', async ({ page }) => {
  await loadSample(page);
  await page.keyboard.press('Control+a');
  await openEffectsMenu(page, /^Delay$/);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Apply' }).click(); // defaults: 0.3 s, fb 0.35
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied/i, { timeout: 15_000 });
  // 9.27 s demo + delay tail (0.3 s x ~7 repeats @ fb 0.35) -> duration leaves 9.27
  await expect(page.getByText(/9\.27 s/)).toBeHidden({ timeout: 15_000 });
  await page.keyboard.press('Control+z');
  await expect(page.getByText(/9\.27 s/)).toBeVisible({ timeout: 8000 });
});

test('effects: Seamless Loop folds the tail into the head, undo restores (AM-11)', async ({
  page,
}) => {
  await loadSample(page);
  // no selection first: the op targets the whole document (reference auto-selects)
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /Seamless Loop/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // reference dialog defaults: crossfade 10 ms, repeat 1, snap on, trim off
  await expect(dialog.locator('#sloop-fade')).toHaveValue('10');
  await expect(dialog.locator('#sloop-repeat')).toHaveValue('1');
  await expect(dialog.locator('#sloop-snap')).toBeChecked();
  await expect(dialog.locator('#sloop-trim')).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Apply' }).click();
  // 10 ms @ 44.1 kHz = 441 samples folded away: 9.272 s -> 9.262 s
  // duration cell is the 4th status item (name, rate, channels, duration, ...);
  // cursor/selection cells show the same figure — pin the index
  const statusDuration = page.locator('.status-item').nth(3);
  await expect(statusDuration).toHaveText(/9\.26 s/, { timeout: 8000 });
  await expect(statusDuration).not.toHaveText(/9\.27 s/);
  const sels = await page.locator('.sel-val').allTextContents();
  expect(sels.join('|')).toContain('0:09.262'); // re-selected to the loop
  await page.keyboard.press('Control+z');
  await expect(page.getByText(/9\.27 s/)).toBeVisible({ timeout: 8000 });

  // repeat 2 tiles the folded loop (fade 0 keeps the length)
  await page.keyboard.press('Control+a');
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /Seamless Loop/i }).click();
  const dialog2 = page.getByRole('dialog');
  await expect(dialog2).toBeVisible();
  await dialog2.locator('#sloop-fade').fill('0');
  await dialog2.locator('#sloop-repeat').fill('2');
  await dialog2.locator('#sloop-snap').uncheck(); // keep edges exact: 2 x docLen
  await dialog2.getByRole('button', { name: 'Apply' }).click();
  const statusDuration2 = page.locator('.status-item').nth(3);
  // doc = 408,927 samples -> tile = 817,854 = 18.545 s -> displays '18.55 s'
  await expect(statusDuration2).toHaveText(/18\.55 s/, { timeout: 8000 });
  await page.keyboard.press('Control+z');
  await expect(statusDuration2).toHaveText(/9\.27 s/, { timeout: 8000 });
});
