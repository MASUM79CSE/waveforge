/**
 * CB-0.4 baseline measurement method (Control Bar v2, Phase 0).
 * Runs the REAL app on a dev server, walks widths x themes x states,
 * and records: per-control bounding boxes + accessible names in the top
 * area (.menubar + .transport), tab-stop counts, page/bar-level horizontal
 * overflow, long tasks + layout shifts during a 5 s playback, plus a PNG
 * per configuration. Deterministic fixture: the app's own demo sample.
 *
 * Usage: node docs/audits/control-bar/baseline-method.mjs <baseUrl> <outDir>
 * (Recorded as the method so later numbers are comparable — CB-0.4.)
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:5180';
const OUT = process.argv[3] ?? 'docs/audits/control-bar/baseline';
const WIDTHS = [1440, 1280, 1024, 768, 390, 320];
const THEMES = ['dark', 'light'];
const STATES = ['noaudio', 'stopped', 'playing', 'recording', 'selection'];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const results = [];

async function setState(page, state) {
  if (state === 'noaudio') {
    await page.goto(BASE);
    await page.getByRole('dialog', { name: /welcome/i }).waitFor({ timeout: 15_000 });
    return;
  }
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await page.getByText('demo.wav', { exact: true }).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);
  if (state === 'playing') {
    await page.keyboard.press(' ');
    await page.waitForTimeout(400);
  } else if (state === 'recording') {
    const rec = page.getByTestId('record-toggle');
    await rec.click(); // arm
    await page.waitForTimeout(800); // let arming settle (mic + state)
    await rec.click(); // roll
    await page.locator('.rec-time').waitFor({ timeout: 12_000 });
    await page.waitForTimeout(1_200);
  } else if (state === 'selection') {
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(300);
  }
}

async function measure(page, perf) {
  return page.evaluate(({ perf }) => {
    const top = document.querySelectorAll('.menubar, .transport');
    const scope = top.length ? top[0].parentElement : document.body;
    const controls = [];
    for (const el of scope.querySelectorAll('.menubar button, .menubar a, .transport button, .transport input')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const name =
        el.getAttribute('aria-label') ??
        el.getAttribute('title') ??
        (el.textContent ?? '').trim().slice(0, 40);
      controls.push({
        tag: el.tagName.toLowerCase(),
        name: name || '(no name)',
        w: Math.round(r.width),
        h: Math.round(r.height),
        testid: el.getAttribute('data-testid') ?? undefined,
      });
    }
    const inTop = scope.querySelectorAll(
      '.menubar button:not([disabled]), .menubar a[href], .transport button:not([disabled]), .transport input:not([disabled]), .transport [tabindex]:not([tabindex="-1"])',
    );
    const pageTabbable = document.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    let cls = 0;
    if (perf) {
      for (const e of performance.getEntriesByType('layout-shift')) cls += e.value ?? 0;
    }
    return {
      controls,
      topTabStops: inTop.length,
      pageTabStops: pageTabbable.length,
      tiny: controls.filter((c) => c.w < 24 || c.h < 24),
      pageHScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      barHScroll:
        (document.querySelector('.transport')?.scrollWidth ?? 0) >
        (document.querySelector('.transport')?.clientWidth ?? 0),
      cls: perf ? Math.round(cls * 1000) / 1000 : undefined,
    };
  }, { perf });
}

const prior = (() => {
  try {
    return JSON.parse(readFileSync(join(OUT, 'measurements.json'), 'utf8'));
  } catch {
    return [];
  }
})();
const okPrior = new Set(prior.filter((r) => !r.error).map((r) => `${r.width}/${r.theme}/${r.state}`));

for (const width of WIDTHS) {
  for (const themeName of THEMES) {
    for (const state of STATES) {
      if (okPrior.has(`${width}/${themeName}/${state}`)) continue;
      const perf = state === 'playing' && themeName === 'dark';
      const context = await browser.newContext({
        viewport: { width, height: 800 },
        deviceScaleFactor: 1,
      });
      await context.addInitScript((theme) => {
        localStorage.setItem('theme', theme);
        window.__lt = 0;
        try {
          new PerformanceObserver((l) => {
            window.__lt += l.getEntries().length;
          }).observe({ type: 'longtask', buffered: true });
        } catch {
          /* longtask not supported */
        }
      }, themeName);
      const page = await context.newPage();
      let err = null;
      try {
        await setState(page, state);
      } catch (e) {
        err = String(e).slice(0, 200);
      }
      await page.waitForTimeout(250).catch(() => {});
      let m = { error: err ?? 'measure failed' };
      let longTasks;
      try {
        m = await measure(page, perf);
        longTasks = perf ? await page.evaluate(() => window.__lt ?? 0) : undefined;
      } catch (e) {
        m = { error: String(e).slice(0, 120) };
      }
      try {
        const dir = join(OUT, themeName);
        mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: join(dir, `${width}-${state}.png`) });
      } catch {
        /* screenshot best-effort on crashed pages */
      }
      results.push({ width, theme: themeName, state, longTasks, error: err, ...m });
      await context.close().catch(() => {});
    }
  }
}

await browser.close();
const merged = [...prior.filter((r) => !r.error && !results.some((n) => n.width === r.width && n.theme === r.theme && n.state === r.state)), ...results];
writeFileSync(join(OUT, 'measurements.json'), JSON.stringify(merged, null, 1));

// console summary
const tiny = merged.filter((r) => r.tiny?.length);
const hscroll = merged.filter((r) => r.pageHScroll);
const barscroll = merged.filter((r) => r.barHScroll);
const errs = merged.filter((r) => r.error);
console.log('configs:', results.length);
console.log('configs with sub-24px controls:', tiny.map((r) => `${r.width}/${r.theme}/${r.state}:${r.tiny.map((t) => `${t.name}(${t.w}x${t.h})`).join(', ')}`).join(' | ') || 'none');
console.log('page-level h-scroll configs:', hscroll.map((r) => `${r.width}/${r.theme}/${r.state}`).join(', ') || 'none');
console.log('bar-level h-scroll configs:', barscroll.map((r) => `${r.width}/${r.theme}/${r.state}`).join(', ') || 'none');
console.log('setup errors:', errs.map((r) => `${r.width}/${r.theme}/${r.state}: ${r.error}`).join(' | ') || 'none');
const perfRows = merged.filter((r) => r.longTasks !== undefined);
console.log('long tasks during 5 s playback:', perfRows.map((r) => `${r.width}px=${r.longTasks} lt, CLS=${r.cls}`).join(' | '));
const tabs = merged.filter((r) => r.state === 'stopped' && r.theme === 'dark');
console.log('top-area tab stops (stopped, dark):', tabs.map((r) => `${r.width}px=${r.topTabStops}`).join(', '));
