/**
 * PF-03 Audio Repair (AM-09): De-Click, Hum Reduction, Edit Repair.
 * Each test synthesizes a PCM16 WAV in Node, loads it through the real
 * File ▸ Open path (filechooser), applies the repair from the real menu
 * dialog with NO selection (whole-document = reference auto-region),
 * exports the doc and proves the repair on the exported bytes — then
 * proves undo restores the baseline byte-for-byte. Exports are 24-bit
 * (default quality) so they are deterministic (no TPDF dither there).
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const SR = 44100;

function writeWav(path: string, l: Float32Array, r: Float32Array): void {
  const n = l.length;
  const bytes = Buffer.alloc(44 + n * 4);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + n * 4, 4);
  bytes.write('WAVE', 8);
  bytes.write('fmt ', 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); // pcm
  bytes.writeUInt16LE(2, 22); // stereo
  bytes.writeUInt32LE(SR, 24);
  bytes.writeUInt32LE(SR * 4, 28);
  bytes.writeUInt16LE(4, 32); // block align
  bytes.writeUInt16LE(16, 34); // bits
  bytes.write('data', 36);
  bytes.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; ++i) {
    bytes.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(l[i]! * 32767))), 44 + i * 4);
    bytes.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(r[i]! * 32767))), 46 + i * 4);
  }
  writeFileSync(path, bytes);
}

interface Wav {
  data: Buffer;
  off: number;
  bits: number;
}

function parseWav(path: string): Wav {
  const bytes = readFileSync(path);
  let pos = 12;
  let bits = 16;
  while (pos + 8 <= bytes.length) {
    const id = bytes.subarray(pos, pos + 4).toString('ascii');
    const size = bytes.readUInt32LE(pos + 4);
    if (id === 'fmt ') bits = bytes.readUInt16LE(pos + 22);
    if (id === 'data') return { data: bytes, off: pos + 8, bits };
    pos += 8 + size + (size % 2);
  }
  throw new Error('no data chunk');
}

/** Left channel sample of frame i (24-bit or 16-bit, stereo stride). */
function sampleAt(w: Wav, frame: number): number {
  const p = w.off + frame * (w.bits / 8) * 2;
  if (w.bits === 24) {
    const raw = w.data.readUIntLE(p, 3);
    return ((raw << 8) >> 8) / 8388608;
  }
  return w.data.readInt16LE(p) / 32768;
}

/** Goertzel power at `freq` over `n` frames starting at `from`. */
function goertzel(w: Wav, freq: number, from: number, n: number): number {
  const k = Math.trunc(0.5 + (n * freq) / SR);
  const omega = (2 * Math.PI * k) / n;
  const coeff = 2 * Math.cos(omega);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; ++i) {
    const s0 = sampleAt(w, from + i) + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

async function loadWav(page: Page, path: string, docName: string): Promise<void> {
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await expect(welcome).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await welcome.getByRole('button', { name: /open file/i }).click();
  (await chooser).setFiles(path);
  await expect(page.getByText(docName, { exact: true }).first()).toBeVisible({ timeout: 10_000 });
}

async function exportDoc(page: Page, path: string): Promise<Buffer> {
  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: /export/i }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: /export/i }).click();
  const file = await download;
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await page.waitForTimeout(200);
  const bytes = readFileSync(await file.path());
  writeFileSync(path, bytes);
  return bytes;
}

async function applyRepair(page: Page, mode?: 'hum' | 'edit'): Promise<void> {
  await page.getByRole('menuitem', { name: 'Effects' }).click();
  await page.getByRole('menuitem', { name: /Audio Repair/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  if (mode) {
    await dialog.getByText(mode === 'hum' ? /Hum Reduction/i : /Edit Repair/i).click();
  }
  if (mode === 'hum') {
    // explicit mains: the auto fine-scan quantizes to Goertzel bins and
    // would report 49.5 Hz for a pure 50 Hz input (reference-true quirk)
    await dialog.getByText('50 Hz').click();
  }
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toBeHidden();
  await page.waitForTimeout(300);
}

async function undo(page: Page): Promise<void> {
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
}

test('De-Click removes injected pops; programme bytes untouched; undo restores', async ({
  page,
}) => {
  const n = SR * 4;
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  const pops = [32000, 76000, 150000];
  for (let i = 0; i < n; ++i) {
    const v = 0.5 * Math.sin((2 * Math.PI * 440 * i) / SR);
    l[i] = v;
    r[i] = v;
  }
  for (const p of pops) {
    l[p] = p === 76000 ? -0.95 : 0.95;
    r[p] = l[p];
  }
  writeWav('/tmp/pf03-click.wav', l, r);

  await loadWav(page, '/tmp/pf03-click.wav', 'pf03-click.wav');
  const baseline = await exportDoc(page, '/tmp/pf03-base.wav');
  const B = parseWav('/tmp/pf03-base.wav');
  for (const p of pops) expect(Math.abs(sampleAt(B, p))).toBeGreaterThan(0.5); // pops present

  await applyRepair(page); // default: Click Reduction / Medium
  // the count sums BOTH channels (reference contract: total across ch)
  await expect(page.locator('.toast-msg').last()).toHaveText(/De-Click: removed 6 clicks/);

  await exportDoc(page, '/tmp/pf03-repaired.wav');
  const R = parseWav('/tmp/pf03-repaired.wav');
  for (const p of pops) {
    // the frame now holds the programme sine (<= ~0.5), not the +/-0.95 pop
    expect(Math.abs(sampleAt(R, p))).toBeLessThan(0.6);
    expect(Math.abs(sampleAt(R, p) - sampleAt(B, p))).toBeGreaterThan(0.3); // rewritten
  }
  for (const c of [5000, 100000, 170000]) {
    expect(sampleAt(R, c)).toBe(sampleAt(B, c)); // programme untouched bit-for-bit
  }

  await undo(page);
  expect(await exportDoc(page, '/tmp/pf03-undone.wav')).toEqual(baseline);
});

test('Hum Reduction auto-notches 50 Hz + harmonics, keeps the programme tone', async ({
  page,
}) => {
  const n = SR;
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let i = 0; i < n; ++i) {
    const programme = 0.4 * Math.sin((2 * Math.PI * 1000 * i) / SR);
    const hum =
      0.35 * Math.sin((2 * Math.PI * 50 * i) / SR) +
      0.12 * Math.sin((2 * Math.PI * 150 * i) / SR) +
      0.08 * Math.sin((2 * Math.PI * 250 * i) / SR);
    l[i] = programme + hum;
    r[i] = l[i]!;
  }
  writeWav('/tmp/pf03-hum.wav', l, r);

  await loadWav(page, '/tmp/pf03-hum.wav', 'pf03-hum.wav');
  const baseline = await exportDoc(page, '/tmp/pf03-humbase.wav');
  const B = parseWav('/tmp/pf03-humbase.wav');

  await applyRepair(page, 'hum');
  await expect(page.locator('.toast-msg').last()).toHaveText(/Notched 50\.0 Hz hum/);

  await exportDoc(page, '/tmp/pf03-dehummed.wav');
  const H = parseWav('/tmp/pf03-dehummed.wav');
  const probeFrom = 4096;
  const probeN = 32768;
  for (const f of [50, 150, 250]) {
    expect(goertzel(H, f, probeFrom, probeN)).toBeLessThan(goertzel(B, f, probeFrom, probeN) / 100);
  }
  const toneBefore = goertzel(B, 1000, probeFrom, probeN);
  const toneAfter = goertzel(H, 1000, probeFrom, probeN);
  expect(toneAfter).toBeGreaterThan(toneBefore * 0.79); // within ~1 dB
  expect(toneAfter).toBeLessThan(toneBefore * 1.26);

  await undo(page);
  expect(await exportDoc(page, '/tmp/pf03-humundone.wav')).toEqual(baseline);
});

test('Edit Repair smooths a DC-offset splice; undo restores', async ({ page }) => {
  const n = Math.round(SR * 1.5);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  const seam = 44100;
  for (let i = 0; i < n; ++i) {
    const v = 0.4 * Math.sin((2 * Math.PI * 220 * i) / SR);
    const dc = i < seam ? 0 : 0.22;
    l[i] = v + dc;
    r[i] = v + dc;
  }
  writeWav('/tmp/pf03-splice.wav', l, r);

  await loadWav(page, '/tmp/pf03-splice.wav', 'pf03-splice.wav');
  const baseline = await exportDoc(page, '/tmp/pf03-spbase.wav');
  const B = parseWav('/tmp/pf03-spbase.wav');
  const seamMax = (w: Wav): number => {
    let m = 0;
    for (let i = seam - 8; i < seam + 8; ++i) m = Math.max(m, Math.abs(sampleAt(w, i) - sampleAt(w, i - 1)));
    return m;
  };
  expect(seamMax(B)).toBeGreaterThan(0.1); // the splice is there

  await applyRepair(page, 'edit');
  // stereo: the count sums both channels (reference contract)
  await expect(page.locator('.toast-msg').last()).toHaveText(/Edit Repair: smoothed 2 splices/);

  await exportDoc(page, '/tmp/pf03-sprepaired.wav');
  const S = parseWav('/tmp/pf03-sprepaired.wav');
  expect(seamMax(S)).toBeLessThan(seamMax(B) * 0.6);
  expect(sampleAt(S, 100)).toBe(sampleAt(B, 100)); // far region untouched
  expect(sampleAt(S, n - 100)).toBe(sampleAt(B, n - 100));

  await undo(page);
  expect(await exportDoc(page, '/tmp/pf03-spundone.wav')).toEqual(baseline);
});
