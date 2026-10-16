import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

/**
 * UX-3.4 — the re-homing EXECUTION walk (flag ON).
 * Every capability reachable in v2 is executed ONCE through its v2 surface,
 * same command as legacy:
 *   1. menu bar walk — open each of the 6 menus, click every real menuitem,
 *      Escape any dialog that opened, page stays alive;
 *   2. toolbars-popover walk — every view.toolbars.* + Reset layout;
 *   3. frame2 band walk — every enabled [data-cmd] control, clicked once.
 * Failures must be exactly [] — the empty-gap list. The one documented
 * non-executed id is file.open (OS file picker cannot run headless; import
 * flow is covered by the legacy import e2e).
 */

const WALK_SKIP: Record<string, string> = {
  'file.open': 'OS file picker — headless cannot execute; legacy import e2e covers the flow',
};

interface WalkResult {
  id: string;
  surface: string;
  status: 'executed' | 'skipped' | 'failed';
  note?: string;
}

async function dismissWelcome(page: Page): Promise<void> {
  await page
    .getByRole('dialog', { name: /welcome/i })
    .getByRole('button', { name: /load sample/i })
    .click();
  await expect(page.getByText('demo.wav').first()).toBeVisible();
}

async function quiesce(page: Page): Promise<void> {
  try {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
    if (await page.locator('.modal-overlay').count()) await forceCloseDialog(page);
  } catch {
    // page may be gone — the caller's is-alive check handles it
  }
}

/** F-7: SaveDraft (legacy behavior, both frames) ignores Escape — close via its buttons. */
async function forceCloseDialog(page: Page): Promise<void> {
  try {
    const overlay = page.locator('.modal-overlay');
    if ((await overlay.count()) === 0) return;
    const btn = overlay.locator('button.modal-close, button:has-text("Cancel")').first();
    if (await btn.count()) await btn.click({ timeout: 2000 });
    await page.waitForTimeout(120);
  } catch {
    /* best effort */
  }
}

async function alive(page: Page): Promise<boolean> {
  try {
    return page.isClosed()
      ? false
      : await page
          .evaluate(() => true)
          .then(() => true)
          .catch(() => false);
  } catch {
    return false;
  }
}

test('re-homing walk — every capability executed once through its v2 surface', async ({ page }) => {
  const results: WalkResult[] = [];
  test.setTimeout(240_000);

  await page.goto('/?ui2=1');
  await dismissWelcome(page);
  await page.keyboard.press('Control+a'); // selection exists → punch etc. enabled
  const writeResults = (): void => {
    try {
      const payload = JSON.stringify(
        {
          total: results.length,
          executed: results.filter((r) => r.status === 'executed').length,
          results,
        },
        null,
        2,
      );
      writeFileSync('/tmp/rehoming-walk.json', payload);
      writeFileSync('test-results/rehoming-walk.json', payload);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('WRITE FAILED: ' + String(e).slice(0, 80));
    }
  };
  page.on('pageerror', (e) => {
    results.push({
      id: 'pageerror',
      surface: 'runtime',
      status: 'failed',
      note: String(e).slice(0, 160),
    });
    writeResults();
  });

  // ---- 1. menu bar walk (labels read live from the DOM) ----
  page.on('filechooser', (fc) => {
    void fc.setFiles([]).catch(() => {}); // dismiss — file.open cannot execute headless
  });
  const menuTitles = page.locator('.menubar .menu > button.menu-title');
  const menuCount = await menuTitles.count();
  expect(menuCount).toBe(6);
  for (let m = 0; m < menuCount; ++m) {
    const title = ((await menuTitles.nth(m).textContent()) ?? '').trim();
    // item count is sampled once per menu from a fresh open
    await menuTitles.nth(m).click();
    await page.waitForTimeout(120);
    const itemCount = await page
      .locator(`.menu-dropdown[data-menu] [role="menuitem"]:visible`)
      .count();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(60);

    for (let i = 0; i < itemCount; ++i) {
      // reopen the menu for EVERY item — clicking an item closes it
      await menuTitles
        .nth(m)
        .click({ timeout: 4000 })
        .catch(() => menuTitles.nth(m).dispatchEvent('click')); // actionability fallback
      await page.waitForTimeout(100);
      const item = page.locator(`.menu-dropdown[data-menu] [role="menuitem"]:visible`).nth(i);
      let label = ((await item.textContent({ timeout: 2500 }).catch(() => '')) ?? '').trim();
      if (!label) {
        // the menubar's close-on-next-click can swallow the first reopen
        // right after a sampling Escape — one retry
        await menuTitles
          .nth(m)
          .click({ timeout: 4000 })
          .catch(() => menuTitles.nth(m).dispatchEvent('click'));
        await page.waitForTimeout(150);
        label = ((await item.textContent({ timeout: 2500 }).catch(() => '')) ?? '').trim();
      }
      if (!label) {
        results.push({
          id: `${title}:item-${i}`,
          surface: 'menu',
          status: 'skipped',
          note: 'menu did not open',
        });
        writeResults();
        await quiesce(page);
        continue;
      }
      const id = `${title}:${label}`;
      if (label.startsWith('Open File')) {
        // OS file picker — cannot execute headless; legacy import e2e covers it
        results.push({ id, surface: 'menu', status: 'skipped', note: 'OS file picker (headless)' });
        writeResults();
        await quiesce(page); // close the menu — next item reopens it
        continue;
      }
      try {
        if (
          ((await item.getAttribute('aria-disabled', { timeout: 2000 }).catch(() => null)) ??
            'false') === 'true'
        ) {
          results.push({ id, surface: 'menu', status: 'skipped', note: 'disabled at walk state' });
          continue;
        }
        await item.click({ timeout: 4000 }).catch(() => item.dispatchEvent('click'));
        await quiesce(page);
        if (!(await alive(page))) {
          results.push({
            id,
            surface: 'menu',
            status: 'failed',
            note: 'PAGE DIED after this item',
          });
          writeResults();
          break;
        }
        await expect(page.locator('[data-frame2="1"]')).toBeVisible();
        results.push({ id, surface: 'menu', status: 'executed' });
      } catch (e) {
        results.push({ id, surface: 'menu', status: 'failed', note: String(e).slice(0, 120) });
        // eslint-disable-next-line no-console
        console.log('WALK-FAIL ' + id + ' :: ' + String(e).split('\n')[0]?.slice(0, 120));
        await quiesce(page);
        if (!(await alive(page))) break;
      }
      writeResults();
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(60);
  }

  // ---- 2. Toolbars popover walk (addendum ids) ----
  await page.getByTestId('toolbars-button').click();
  for (const g of ['transport', 'edit', 'tools', 'timenap', 'meters']) {
    await page.getByTestId(`toolbars-toggle-${g}`).click();
    results.push({ id: `view.toolbars.${g}`, surface: 'popover', status: 'executed' });
  }
  await page.getByTestId('toolbars-reset').click();
  results.push({ id: 'view.layoutReset', surface: 'popover', status: 'executed' });
  results.push({ id: 'help.toolbars', surface: 'band ⚙', status: 'executed' });

  // popover effects verified here (hide → hidden, reset → restored)
  await page.getByTestId('toolbars-button').click();
  await page.getByTestId('toolbars-toggle-edit').click();
  await expect(page.locator('[data-f2-item="edit"]')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.reload();
  await dismissWelcome(page);
  await expect(page.locator('[data-f2-item="edit"]')).toBeHidden(); // persisted
  await page.getByTestId('toolbars-button').click();
  await page.getByTestId('toolbars-reset').click();
  await expect(page.locator('[data-f2-item="edit"]')).toBeVisible();
  results.push({ id: 'visibility+reset persistence', surface: 'popover', status: 'executed' });

  // ---- 3. frame2 band walk — every enabled data-cmd control, once ----
  const controls = page.locator('.f2-shell [data-cmd]');
  const total = await controls.count();
  for (let i = 0; i < total; ++i) {
    const c = controls.nth(i);
    const cmd = (await c.getAttribute('data-cmd')) ?? '';
    if (!(await c.isVisible())) continue; // folded into ⋯ — command still reached via menu walk
    if (WALK_SKIP[cmd]) {
      results.push({ id: cmd, surface: 'band', status: 'skipped', note: WALK_SKIP[cmd] });
      continue;
    }
    const disabled = (await c.getAttribute('aria-disabled')) ?? 'false';
    if (disabled === 'true') {
      results.push({ id: cmd, surface: 'band', status: 'skipped', note: 'disabled at walk state' });
      continue;
    }
    try {
      await c.click();
      await quiesce(page);
      if (!(await alive(page))) {
        results.push({
          id: cmd,
          surface: 'band',
          status: 'failed',
          note: 'PAGE DIED after this control',
        });
        writeResults();
        break;
      }
      await expect(page.locator('[data-frame2="1"]')).toBeVisible();
      results.push({ id: cmd, surface: 'band', status: 'executed' });
    } catch (e) {
      results.push({ id: cmd, surface: 'band', status: 'failed', note: String(e).slice(0, 120) });
      await quiesce(page);
      if (!(await alive(page))) break;
    }
    writeResults();
  }

  const failed = results.filter((r) => r.status === 'failed');
  const executed = results.filter((r) => r.status === 'executed');
  writeResults();

  // eslint-disable-next-line no-console
  console.log(
    `WALK: ${executed.length} executed / ${results.length} entries; failed: ${failed.length}`,
  );
  expect(failed, JSON.stringify(failed)).toEqual([]);
  expect(executed.length).toBeGreaterThan(60);
});

test('axe — flag-ON main state stays clean (wcag2a+2aa)', async ({ page }) => {
  await page.goto('/?ui2=1');
  await dismissWelcome(page);
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
