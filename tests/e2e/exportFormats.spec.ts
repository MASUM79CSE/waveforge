import { expect, test } from '@playwright/test';

/**
 * e2e #57 — professional export chooser: format cards (radiogroup) with
 * lossless/lossy badges and use-case lines, per-format labeled quality
 * presets with live hints, prominent size estimate that reacts to the
 * choice, and the sample-rate info row.
 */

async function openExport(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /export/i }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
}

test('export dialog: format cards, quality hints, live estimate', async ({ page }) => {
  await openExport(page);
  const panel = page.getByRole('dialog');

  // three format cards in a radiogroup; WAV selected by default
  const group = panel.getByRole('radiogroup', { name: /format/i });
  for (const name of ['WAV', 'MP3', 'FLAC']) {
    await expect(group.getByRole('radio', { name: new RegExp('^' + name) })).toBeVisible();
  }
  const wav = group.getByRole('radio', { name: /^WAV/ });
  await expect(wav).toHaveAttribute('aria-checked', 'true');
  await expect(panel.locator('.export-card-badge.ok').first()).toHaveText(/lossless/i);
  await expect(panel.getByTestId('export-format-mp3').locator('.export-card-badge')).toHaveText(/lossy/i);

  // WAV default = 24-bit studio master (professional default), hint visible
  await expect(panel.locator('#export-quality')).toHaveValue('pcm24');
  await expect(panel.locator('.export-hint')).toContainText(/studio master/i);

  // quality switch updates the hint
  await panel.locator('#export-quality').selectOption('float32');
  await expect(panel.locator('.export-hint')).toContainText(/DAW-native/i);

  // MP3: labeled bitrate presets, hint follows, Song Info available
  await panel.getByTestId('export-format-mp3').click();
  await expect(panel.locator('#export-quality')).toHaveValue('320');
  await panel.locator('#export-quality').selectOption('128');
  await expect(panel.locator('.export-hint')).toContainText(/voice/i);
  await expect(panel.getByRole('button', { name: /song info/i })).toBeVisible();

  // estimate reacts: 128 kbps is smaller than 320 kbps
  const readEstimate = async (): Promise<number> => {
    const text = (await panel.locator('.export-meta').textContent()) ?? '';
    const m = text.match(/([\d.]+)\s*(KB|MB)/);
    if (!m) return 0;
    return Number(m[1]) * (m[2] === 'MB' ? 1024 : 1);
  };
  await panel.locator('#export-quality').selectOption('320');
  const big = await readEstimate();
  await panel.locator('#export-quality').selectOption('128');
  const small = await readEstimate();
  expect(small, '128 kbps estimate').toBeLessThan(big);

  // sample rate info row present
  await expect(panel.locator('.export-meta')).toContainText(/44100|48000/);

  // FLAC levels are labeled, not bare numbers
  await panel.getByTestId('export-format-flac').click();
  await expect(panel.locator('#export-quality option').first()).toHaveText(/level 0/i);
  await expect(panel.locator('.export-hint')).toContainText(/recommended default/i);
});
