import { expect, test, type Page } from '@playwright/test';

/**
 * CB-6.1 parity sweep — live verification that the v2 bar provides EVERY
 * control of the audit §2 inventory (reachability + accessible name +
 * routing), inline or relocated in the ⋮ panel (CB-D19). The machine
 * table lives in docs/audits/control-bar/parity.md; this spec is its
 * executable form.
 */

async function loadV2(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/?cbv2=1');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
}

const INLINE_2300 = [
  // menubar titles (6)
  'File', 'Edit', 'Effects', 'Analyze', 'View', 'Help',
  // transport
  'Back 5 seconds', 'Forward 5 seconds', 'Play', 'Stop', 'Record', 'Toggle Loop',
] as const;

test.describe('CB-6.1 v2 inventory vs audit §2', () => {
  test('2300 px: every §2 control reachable inline with its accessible name', async ({
    page,
  }) => {
    await loadV2(page, 2300);
    for (const name of INLINE_2300) {
      const loc =
        page.getByRole('menubar').getByRole('menuitem', { name, exact: true }).or(
          page.getByRole('button', { name, exact: true }),
        );
      await expect(loc.first()).toBeVisible();
    }
    // clock + format switcher (§2 #7)
    await expect(page.getByTestId('cb2-clock')).toBeVisible();
    await expect(page.getByTestId('cb2-clock-format')).toBeVisible();
    // edit tools + quick FX + zoom (§2 #15-29): 15 toolbtns
    await expect(page.locator('.cb2 .toolbtn')).toHaveCount(15);
    // selection fields + clear (§2 #30-31)
    for (const f of ['start', 'end', 'length']) {
      await expect(page.getByTestId(`cb2-sel-${f}`)).toBeVisible();
    }
    await expect(page.locator('.cb2 .sel-clear')).toBeVisible();
    // beat/snap/BPM/metronome (§2 #32-34)
    await expect(page.getByTestId('cb2-beat')).toBeVisible();
    await expect(page.getByTestId('cb2-snap')).toBeVisible();
    await expect(page.getByTestId('cb2-bpm')).toBeVisible();
    await expect(page.getByTestId('cb2-metronome')).toBeVisible();
    // monitor/punch/clip-led/meter slots/count-in chip (§2 #35-40)
    await expect(page.getByTestId('monitor-toggle')).toBeVisible();
    await expect(page.getByTestId('punch-button')).toBeVisible();
    // clip LED / count-in are visibility-toggled state (armed/recording
    // only — never unmounted; Phase-3 reserved-slot pattern)
    await expect(page.getByTestId('clip-led')).toHaveCount(1);
    await expect(page.locator('.cb2-rec-slot').first()).toBeVisible();
    // count-in slot is reserved; the chip mounts only while counting
    await expect(page.locator('.cb2-count-slot').first()).toBeAttached();
    // strips + swap + add-track + master (§2 #41-49)
    await expect(page.getByRole('button', { name: 'Left — mute' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Right — mute' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Swap channels' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add track' })).toBeVisible();
    await expect(page.getByTestId('cb2-master-vol')).toBeVisible();
    // zoombar + status facts (§2 #50-56) are shell furniture — unchanged
    await expect(page.locator('.statusbar')).toBeVisible();
    await expect(page.locator('.status-item[title="Cursor position"]')).toBeVisible();
  });

  test('1280 px: the tucked §2 controls are all inside the ⋮ panel (single instance)', async ({
    page,
  }) => {
    await loadV2(page, 1280);
    // inline survivors
    for (const tid of ['cb2-selection', 'transport-seek-back', 'transport-play']) {
      await expect(page.getByTestId(tid)).toBeVisible();
    }
    await expect(page.getByTestId('cb2-tempo')).toHaveCount(0);
    // panel hosts tempo/record/master (§2 #32-49)
    await page.getByTestId('cb2-overflow').click();
    for (const tid of [
      'cb2-beat',
      'cb2-snap',
      'cb2-metronome',
      'monitor-toggle',
      'punch-button',
      'cb2-master-vol',
    ]) {
      await expect(page.getByTestId(tid)).toBeVisible();
    }
    await expect(page.getByTestId('clip-led')).toHaveCount(1); // attached; visible when armed
    await expect(page.getByTestId('cb2-tempo')).toHaveCount(1); // exactly once
  });

  test('390 px: seek pair + toolbar join the panel; nothing is lost', async ({ page }) => {
    await loadV2(page, 390);
    await expect(page.getByTestId('transport-seek-back')).toHaveCount(0);
    await page.getByTestId('cb2-overflow').click();
    await expect(page.getByTestId('transport-seek-back')).toBeVisible();
    await expect(page.getByTestId('transport-seek-fwd')).toBeVisible();
    await expect(page.getByTestId('cb2-sel-start')).toBeVisible();
    const toolInPanel = await page.evaluate(
      () => document.querySelectorAll('.cb2-pop .toolbtn').length,
    );
    expect(toolInPanel).toBe(15);
  });

  test('seek buttons route through the registry and move the cursor ±5 s', async ({ page }) => {
    await loadV2(page, 1280);
    const clock = page.getByTestId('cb2-clock');
    await expect(clock).toHaveText(/0:00\.000/);
    await page.getByTestId('transport-seek-fwd').click();
    await expect(clock).toHaveText(/0:05\.0/);
    await page.getByTestId('transport-seek-back').click();
    await expect(clock).toHaveText(/0:00\.000/);
  });

  test('flag OFF: v1 inventory untouched (seek pair still in the v1 transport)', async ({
    page,
  }) => {
    await page.goto('/');
    const welcome = page.getByRole('dialog', { name: /welcome/i });
    await welcome.getByRole('button', { name: /load sample/i }).click();
    await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('transport-seek-back')).toBeVisible();
    await expect(page.getByTestId('transport-seek-fwd')).toBeVisible();
    await expect(page.getByRole('menubar')).toHaveCount(0);
  });
});
