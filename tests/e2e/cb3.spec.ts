import { expect, test, type Page } from '@playwright/test';

/**
 * CB-3.x — editing clusters on the v2 bar: editable validated selection
 * fields (start/end/length, inline errors, canonical selectRange routing),
 * tempo/grid/metronome cluster (registry-routed pressed states), record
 * cluster with reserved slots (arm-time zone width stable — F-05), master
 * slider on the canonical signal (no persistence, CB-D9).
 */

async function loadV2(page: Page): Promise<void> {
  await page.goto('/?cbv2=1');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
}

test.describe('selection fields (CB-3.1)', () => {
  test('mirrors the signal; Ctrl+A fills all three fields', async ({ page }) => {
    await loadV2(page);
    const start = page.getByTestId('cb2-sel-start');
    const end = page.getByTestId('cb2-sel-end');
    const length = page.getByTestId('cb2-sel-length');
    await expect(start).toHaveValue('-');
    await expect(end).toHaveValue('-');
    await expect(length).toHaveValue('-');
    await page.keyboard.press('Control+a');
    await expect(start).toHaveValue('0:00.000');
    await expect(end).toHaveValue('0:09.272');
    await expect(length).toHaveValue('0:09.272');
    await page.getByTestId('cb2-sel-length').press('Escape'); // blur, no edit
  });

  test('typing a start time moves the selection (round-trip through selectRange)', async ({
    page,
  }) => {
    await loadV2(page);
    const start = page.getByTestId('cb2-sel-start');
    await start.fill('0:02');
    await start.press('Enter');
    await expect(start).toHaveValue('0:02.000');
    // zero-length selection at 2 s: end + length follow
    await expect(page.getByTestId('cb2-sel-end')).toHaveValue('0:02.000');
    await expect(page.getByTestId('cb2-sel-length')).toHaveValue('0:00.000');
    // signal-driven proof: Punch requires a selection and was disabled before
    await expect(page.getByTestId('punch-button')).toBeEnabled();
  });

  test('length edit extends from the selection start', async ({ page }) => {
    await loadV2(page);
    const start = page.getByTestId('cb2-sel-start');
    const length = page.getByTestId('cb2-sel-length');
    await start.fill('1');
    await start.press('Enter');
    await length.fill('0:01.500');
    await length.press('Enter');
    await expect(length).toHaveValue('0:01.500');
    // end snaps to the nearest zero-cross (ADR 007 — same as canvas drags)
    await expect(page.getByTestId('cb2-sel-end')).toHaveValue('0:02.499');
  });

  test('invalid input shows an inline error and keeps the selection', async ({ page }) => {
    await loadV2(page);
    await page.keyboard.press('Control+a');
    const end = page.getByTestId('cb2-sel-end');
    await end.fill('not a time');
    await end.press('Enter');
    await expect(page.getByTestId('cb2-sel-error')).toBeVisible();
    await expect(end).toHaveAttribute('aria-invalid', 'true');
    // authoritative values unchanged
    await expect(page.getByTestId('cb2-sel-start')).toHaveValue('0:00.000');
    // Escape clears the draft + error; value reverts to the signal
    await end.press('Escape');
    await expect(page.getByTestId('cb2-sel-error')).toHaveCount(0);
    await expect(end).toHaveValue('0:09.272');
  });

  test('out-of-range input clamps into the document', async ({ page }) => {
    await loadV2(page);
    const start = page.getByTestId('cb2-sel-start');
    await start.fill('9999');
    await start.press('Enter');
    // clamped to the document end, then snapped to a zero-cross (9.270)
    await expect(start).toHaveValue('0:09.270');
  });
});

test.describe('tempo cluster (CB-3.2)', () => {
  test('metronome + BEAT + SNAP toggles are registry-routed with pressed states', async ({
    page,
  }) => {
    await loadV2(page);
    const metro = page.getByTestId('cb2-metronome');
    const beat = page.getByTestId('cb2-beat');
    const snap = page.getByTestId('cb2-snap');
    await expect(metro).toHaveAttribute('aria-pressed', 'false');
    await metro.click();
    await expect(metro).toHaveAttribute('aria-pressed', 'true');
    await metro.click();
    await expect(metro).toHaveAttribute('aria-pressed', 'false');
    await expect(beat).toHaveAttribute('aria-pressed', 'true');
    await beat.click();
    await expect(beat).toHaveAttribute('aria-pressed', 'false');
    await expect(snap).toHaveAttribute('aria-pressed', 'true');
    await snap.click();
    await expect(snap).toHaveAttribute('aria-pressed', 'false');
  });

  test('BPM readout shows "-" before analysis', async ({ page }) => {
    await loadV2(page);
    await expect(page.getByTestId('cb2-bpm')).toHaveText('-');
  });

  test('cluster is an APG toolbar: arrows move, one tab stop', async ({ page }) => {
    await loadV2(page);
    const beat = page.getByTestId('cb2-beat');
    const snap = page.getByTestId('cb2-snap');
    const metro = page.getByTestId('cb2-metronome');
    await beat.focus();
    await page.keyboard.press('ArrowRight');
    await expect(snap).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(metro).toBeFocused();
    await page.keyboard.press('Home');
    await expect(beat).toBeFocused();
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(
      () => document.activeElement?.closest('[data-testid="cb2-tempo"]') !== null,
    );
    expect(inside).toBe(false);
  });
});

test.describe('record cluster — reserved slots (CB-3.3)', () => {
  test('arming does not change the Record zone geometry (F-05 = 0 px)', async ({ page }) => {
    await loadV2(page);
    const zoneBefore = await page.evaluate(() => {
      const zone = [...document.querySelectorAll('.tz')].find((z) =>
        (z.getAttribute('aria-label') ?? '').includes('Record'),
      );
      const b = zone?.getBoundingClientRect();
      return { w: b?.width ?? 0, x: b?.x ?? 0 };
    });
    const rec = page.getByTestId('record-toggle');
    await rec.click(); // arm (fake media)
    await page.waitForTimeout(1_500);
    const zoneArmed = await page.evaluate(() => {
      const zone = [...document.querySelectorAll('.tz')].find((z) =>
        (z.getAttribute('aria-label') ?? '').includes('Record'),
      );
      const b = zone?.getBoundingClientRect();
      return { w: b?.width ?? 0, x: b?.x ?? 0 };
    });
    expect(Math.abs(zoneArmed.w - zoneBefore.w)).toBeLessThan(0.5);
    expect(Math.abs(zoneArmed.x - zoneBefore.x)).toBeLessThan(0.5);
    // slots exist and are layout-stable (visibility, not mount)
    await expect(page.getByTestId('cb2-rec-slot')).toBeVisible();
    await rec.click(); // roll
    await expect(page.locator('.rec-time').first()).toBeVisible();
    await page.waitForTimeout(500);
  });
});

test.describe('master zone (CB-3.4)', () => {
  test('slider is signal-bound; default 0.9; NOT persisted (CB-D9)', async ({ page }) => {
    await loadV2(page);
    const slider = page.getByTestId('cb2-master-vol');
    await expect(slider).toHaveValue('0.9');
    await slider.fill('0.5');
    await expect(slider).toHaveValue('0.5');
    await expect(slider).toHaveAttribute('aria-valuetext', '33%');
    const stored = await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.includes('masterVolume') || k.includes('volume')),
    );
    expect(stored).toEqual([]);
    await page.reload();
    const wl = page.getByRole('dialog', { name: /welcome/i });
    await wl.getByRole('button', { name: /load sample/i }).click();
    await expect(page.getByText('demo.wav', { exact: true })).toBeVisible();
    await expect(page.getByTestId('cb2-master-vol')).toHaveValue('0.9');
  });
});

test.describe('flag ON — axe (new zones)', () => {
  test('x2: axe zero violations — v2 bar with Phase 3 clusters (selection state)', async ({
    page,
  }) => {
    await loadV2(page);
    await page.keyboard.press('Control+a'); // selection populated → fields filled
    await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
    const violations = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const a = (window as any).axe;
      const results = await a.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      });
      return results.violations.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (v: any) => `${v.impact} ${v.id}: ${v.help}`,
      );
    });
    expect(violations).toEqual([]);
  });
});
