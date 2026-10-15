import { expect, test, type Page } from '@playwright/test';

/**
 * H-sweep (Phase 3): adversarial probes against the editing clusters.
 * Rapid commits, Escape mid-error, blur-commit races, double-fire on
 * toggles, disabled-input races, narrow-viewport overflow, and long-value
 * handling. Every probe asserts user-visible state, never internals.
 */

async function loadV2(page: Page): Promise<void> {
  await page.goto('/?cbv2=1');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
}

test.describe('H: selection fields', () => {
  // CB-5.1: run where all clusters are inline (the blur probe clicks the
  // BPM chip in the tempo zone; narrow-panel editing is cb5.spec's ground)
  test.use({ viewport: { width: 2300, height: 900 } });
  test('rapid Enter commits settle on the last value', async ({ page }) => {
    await loadV2(page);
    const start = page.getByTestId('cb2-sel-start');
    await page.keyboard.press('Control+a');
    for (const v of ['0:00.100', '0:00.200', '0:00.300', '0:00.400', '0:00.500']) {
      await start.fill(v);
      await start.press('Enter');
    }
    await expect(start).toHaveValue(/0:00\.5/);
    const err = page.getByTestId('cb2-sel-error');
    await expect(err).toBeHidden();
  });

  test('Escape mid-error clears the error without touching the selection', async ({ page }) => {
    await loadV2(page);
    const start = page.getByTestId('cb2-sel-start');
    await page.keyboard.press('Control+a');
    await expect(page.getByTestId('cb2-sel-end')).toHaveValue(/0:09\.2/); // field sync settled
    const before = await page.getByTestId('cb2-sel-end').inputValue();
    await start.fill('garbage');
    await start.press('Enter');
    await expect(page.getByTestId('cb2-sel-error')).toBeVisible();
    await start.press('Escape');
    await expect(page.getByTestId('cb2-sel-error')).toBeHidden();
    await expect(page.getByTestId('cb2-sel-end')).toHaveValue(before);
  });

  test('blur after invalid input keeps the error until re-edit (no double-commit)', async ({
    page,
  }) => {
    await loadV2(page);
    const start = page.getByTestId('cb2-sel-start');
    await page.keyboard.press('Control+a');
    // '9:99' is deliberately normalized (639 s) and clamps into the document
    // — see cb3.spec clamp test. True garbage is what raises the error.
    await start.fill('garbage');
    await start.press('Enter');
    await expect(page.getByTestId('cb2-sel-error')).toBeVisible();
    await start.blur();
    await page.getByTestId('cb2-bpm').click(); // focus leaves the field entirely
    await expect(page.getByTestId('cb2-sel-error')).toBeVisible();
    // field recovers on next valid commit
    await start.fill('0:00.250');
    await start.press('Enter');
    await expect(page.getByTestId('cb2-sel-error')).toBeHidden();
  });

  test('empty commit leaves the signal untouched (no crash, no error)', async ({ page }) => {
    await loadV2(page);
    const start = page.getByTestId('cb2-sel-start');
    await page.keyboard.press('Control+a');
    await expect(page.getByTestId('cb2-sel-end')).toHaveValue(/0:09\.2/); // field sync settled
    const end = await page.getByTestId('cb2-sel-end').inputValue();
    await start.fill('');
    await start.press('Enter');
    await expect(page.getByTestId('cb2-sel-end')).toHaveValue(end);
  });
});

test.describe('H: toggles + slider', () => {
  test.use({ viewport: { width: 2300, height: 900 } }); // CB-5.1: exercise the toggles inline
  test('rapid BEAT/SNAP/metro double-clicks end consistent (pressed == label state)', async ({
    page,
  }) => {
    await loadV2(page);
    for (const tid of ['cb2-beat', 'cb2-snap', 'cb2-metronome']) {
      const btn = page.getByTestId(tid);
      const pressedBefore = (await btn.getAttribute('aria-pressed')) === 'true';
      for (let i = 0; i < 4; i++) await btn.click();
      const pressedAfter = (await btn.getAttribute('aria-pressed')) === 'true';
      expect(pressedAfter).toBe(pressedBefore); // 4 clicks = even = back to start
    }
  });

  test('rapid slider drags never desync the readout from aria-valuenow', async ({ page }) => {
    await loadV2(page);
    const slider = page.getByTestId('cb2-master-vol');
    for (const v of ['0.1', '0.9', '0.2', '1', '0.9']) {
      await slider.fill(v);
      // readout is the aria-valuetext (volume / max 1.5, rounded %)
      await expect(slider).toHaveAttribute(
        'aria-valuetext',
        `${Math.round((Number(v) / 1.5) * 100)}%`,
      );
    }
    await expect(slider).toHaveAttribute('aria-valuetext', '60%');
  });

  test('arm/record rapid toggles: arm always disabled without a take, no stray error', async ({
    page,
  }) => {
    await loadV2(page);
    // no take → arm stays disabled no matter how often poked
    const punch = page.getByTestId('punch-button');
    await expect(punch).toBeDisabled();
    for (let i = 0; i < 3; i++) {
      await punch.click({ force: true, trial: true }).catch(() => {});
    }
    await expect(punch).toBeDisabled();
    await page.getByTestId('record-toggle').click();
    // recording state asserted in cb3.spec — here only: no error text leaked
    await expect(page.getByTestId('cb2-sel-error')).toBeHidden();
  });
});

test.describe('H: responsive', () => {
  test('320 px: bar still fits, no page horizontal scroll with clusters visible', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await loadV2(page);
    await page.keyboard.press('Control+a');
    // CB-5.1: at 320 the editing clusters live in the ⋮ panel — same
    // controls, relocated (the panel itself is axe- and target-checked
    // in cb5.spec)
    await page.getByTestId('cb2-overflow').click();
    await expect(page.getByTestId('cb2-sel-start')).toBeVisible();
    await expect(page.getByTestId('cb2-rec-slot').first()).toBeVisible();
    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    expect(m.sw).toBeLessThanOrEqual(m.cw);
  });

  test('selection fields keep working at 390 px (mobile probe)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await loadV2(page);
    await page.getByTestId('cb2-overflow').click();
    const start = page.getByTestId('cb2-sel-start');
    await page.keyboard.press('Control+a');
    await start.fill('0:00.500');
    await start.press('Enter');
    await expect(start).toHaveValue(/0:00\.5/);
  });
});
