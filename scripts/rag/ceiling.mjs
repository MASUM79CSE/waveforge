#!/usr/bin/env node
// P0.9 — large-file ceiling harness. Loads generated WAVs into the real app
// in headless Chromium with precise memory info and records decode time,
// JS heap, long tasks, and crashes. NOT part of the e2e suite.
// Usage: node scripts/rag/ceiling.mjs <appUrl> <wav> <expectedSeconds>

import { chromium } from '@playwright/test';

const [appUrl, wavPath, expectSecArg] = process.argv.slice(2);
if (!appUrl || !wavPath) {
  console.error('usage: ceiling.mjs <appUrl> <wav> <expectedSeconds>');
  process.exit(2);
}
const expectSec = Number(expectSecArg ?? 0);

const browser = await chromium.launch({
  args: ['--enable-precise-memory-info'],
});
const page = await browser.newPage();

let crashed = false;
page.on('crash', () => {
  crashed = true;
  console.log('RESULT crash=true');
});

const result = {
  file: wavPath.split('/').pop(),
  loadMs: null,
  heapMB: null,
  longTasks: null,
  crashed: false,
  error: null,
};

try {
  await page.goto(appUrl, { timeout: 30_000 });
  // dismiss welcome
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.waitFor({ timeout: 15_000 });
  await page.keyboard.press('Escape');

  // long-task observer (>50 ms) on the main thread
  await page.evaluate(() => {
    window.__longTasks = 0;
    try {
      new PerformanceObserver((list) => {
        window.__longTasks += list.getEntries().length;
      }).observe({ entryTypes: ['longtask'] });
    } catch {
      window.__longTasks = -1; // not supported
    }
  });

  const t0 = Date.now();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 15_000 }),
    page.getByRole('button', { name: /open file/i }).click(),
  ]);
  await chooser.setFiles(wavPath);

  // wait for the status bar to report the full duration
  await page.waitForFunction(
    (exp) => {
      const el = document.querySelector('.time-total');
      if (!el) return false;
      const txt = el.textContent ?? '';
      const m = txt.match(/(\d+):(\d+(?:\.\d+)?)$/);
      if (!m) return false;
      const sec = Number(m[1]) * 60 + Number(m[2]);
      return exp ? Math.abs(sec - exp) < 1.5 : sec > 60;
    },
    expectSec,
    { timeout: 300_000, polling: 500 },
  );
  result.loadMs = Date.now() - t0;

  await page.waitForTimeout(2_000); // let peaks/first paints settle
  const mem = await page.evaluate(() => {
    const m = performance.memory;
    return m ? Math.round(m.usedJSHeapSize / 1048576) : null;
  });
  result.heapMB = mem;
  result.longTasks = await page.evaluate(() => window.__longTasks);
  result.crashed = crashed;
  console.log(`RESULT ${JSON.stringify(result)}`);
} catch (err) {
  result.error = String(err).slice(0, 200);
  result.crashed = crashed;
  console.log(`RESULT ${JSON.stringify(result)}`);
} finally {
  await browser.close().catch(() => {});
  // non-zero exit only on unexpected errors, not on tab crash (crash IS data)
  process.exit(result.error && !crashed ? 1 : 0);
}
