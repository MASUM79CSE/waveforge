/**
 * CB-0.4 supplemental baseline: clock jitter during playback + arm-moment
 * layout shift (Control Bar v2, Phase 0). Closes the two measurement cells
 * the main matrix could not: H-07/F-06 "visual jitter NOT RUN" and F-05
 * "arm-time layout shift NOT MEASURED". Read-only: no app code is changed.
 *
 * Usage: node docs/audits/control-bar/jitter-method.mjs <baseUrl> <outJson>
 *
 * A) jitter (1280 dark, 390 dark): start playback, sample rAF frames for 5 s,
 *    record sub-pixel rects of .time-cursor / .time-sep / .time-total and the
 *    computed font-variant-numeric of the clock.
 * B) arm (1280 dark, 390 dark; fake media): PerformanceObserver(layout-shift)
 *    across arm -> roll, plus zone geometry snapshots T0 (before arm),
 *    T1 (2 s after arm), T2 (2.5 s after roll) to quantify how far
 *    neighbouring zones move when the meter / rec-time / count-in mount.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BASE = process.argv[2] ?? 'http://localhost:5180';
const OUT = process.argv[3] ?? 'docs/audits/control-bar/baseline/jitter.json';
const r3 = (x) => Math.round(x * 1000) / 1000;

async function newPage(width) {
  const ctx = await browser.newContext({
    viewport: { width, height: 800 },
    permissions: ['microphone'],
  });
  await ctx.addInitScript((t) => localStorage.setItem('waveforge.theme', t), 'dark');
  const page = await ctx.newPage();
  return { ctx, page };
}

async function loadSample(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await page.getByText('demo.wav', { exact: true }).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);
}

async function measureJitter(width) {
  const { ctx, page } = await newPage(width);
  try {
    await loadSample(page);
    await page.keyboard.press(' '); // play
    await page.waitForTimeout(400);
    const data = await page.evaluate(
      () =>
        new Promise((resolve) => {
          // v1 clock (.time-cursor/.time-sep/.time-total) or v2 clock
          // (.cb2-clock-readout — single readout, format switcher beside it)
          const v2 = document.querySelector('.cb2-clock-readout');
          const cur = v2 ?? document.querySelector('.time-cursor');
          const sep = v2 ?? document.querySelector('.time-sep');
          const tot = v2 ?? document.querySelector('.time-total');
          const box = v2?.parentElement ?? document.querySelector('.transport-time');
          if (!cur || !sep || !tot || !box) {
            resolve({ error: 'clock elements not found' });
            return;
          }
          const fvn = getComputedStyle(cur).fontVariantNumeric;
          const rows = [];
          const t0 = performance.now();
          function frame() {
            const t = performance.now() - t0;
            const c = cur.getBoundingClientRect();
            const s = sep.getBoundingClientRect();
            const tt = tot.getBoundingClientRect();
            const b = box.getBoundingClientRect();
            rows.push([t, c.width, c.x, s.x, tt.x, b.width, cur.textContent]);
            if (t < 5000) requestAnimationFrame(frame);
            else
              resolve({
                fvn,
                frames: rows.length,
                rows,
                zonesVisible: { cursor: c.width > 0, total: tt.width > 0 },
              });
          }
          requestAnimationFrame(frame);
        })
    );
    if (data.error) return { error: data.error };
    const widths = data.rows.map((r) => r[1]);
    const sepX = data.rows.map((r) => r[3]);
    const totX = data.rows.map((r) => r[4]);
    const boxW = data.rows.map((r) => r[5]);
    const p2p = (a) => r3(Math.max(...a) - Math.min(...a));
    const distinct = (a) => new Set(a.map((v) => Math.round(v * 100))).size;
    const moves = (a, thr) =>
      a.slice(1).filter((v, i) => Math.abs(v - a[i]) > thr).length;
    return {
      fontVariantNumeric: data.fvn,
      frames: data.frames,
      cursorWidthPx: { min: r3(Math.min(...widths)), max: r3(Math.max(...widths)), distinct: distinct(widths), p2p: p2p(widths) },
      sepXPx: { p2p: p2p(sepX), movesOver0_05: moves(sepX, 0.05) },
      totalXPx: { p2p: p2p(totX), movesOver0_05: moves(totX, 0.05) },
      transportTimeWidthPx: { p2p: p2p(boxW) },
      lastClockText: data.rows[data.rows.length - 1][6],
      zonesVisible: data.zonesVisible,
    };
  } catch (e) {
    return { error: String(e).slice(0, 200) };
  } finally {
    await ctx.close();
  }
}

async function measureArm(width) {
  const { ctx, page } = await newPage(width);
  try {
    await loadSample(page);
    await page.evaluate(() => {
      window.__shifts = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries())
          window.__shifts.push({
            v: e.value,
            input: e.hadRecentInput,
            t: Math.round(e.startTime),
            src: (e.sources ?? [])
              .map((s) => {
                const n = s.node;
                if (!n || n.nodeType !== 1) return null;
                const cls = String(n.className?.baseVal ?? n.className ?? n.nodeName).slice(0, 32);
                const tid = n.getAttribute?.('data-testid');
                return tid ? `${cls}#${tid}` : cls;
              })
              .filter(Boolean)
              .slice(0, 4),
          });
      }).observe({ type: 'layout-shift', buffered: false });
      window.__zones = () =>
        [...document.querySelectorAll('.transport > *')].map((z) => {
          const b = z.getBoundingClientRect();
          return {
            c: String(z.className).slice(0, 24),
            x: Math.round(b.x * 1000) / 1000,
            w: Math.round(b.width * 1000) / 1000,
          };
        });
      window.__T0 = window.__zones();
    });
    const rec = page.getByTestId('record-toggle');
    await rec.click(); // arm (meter block mounts; count-in if enabled)
    await page.waitForTimeout(2_000);
    await page.evaluate(() => (window.__T1 = window.__zones()));
    await rec.click(); // roll (rec-time mounts + ticks)
    await page.locator('.rec-time').waitFor({ timeout: 12_000 });
    await page.waitForTimeout(2_500);
    const out = await page.evaluate(() => ({
      shifts: window.__shifts,
      T0: window.__T0,
      T1: window.__T1,
      T2: window.__zones(),
    }));
    const sum = (f) => r3(out.shifts.filter((s) => s.input === f).reduce((a, s) => a + s.v, 0));
    const zoneDelta = (a, b) =>
      a.map((z, i) => ({ c: z.c, dx: r3((b[i]?.x ?? NaN) - z.x), dw: r3((b[i]?.w ?? NaN) - z.w) }));
    const top = [...out.shifts].sort((a, b) => b.v - a.v).slice(0, 6);
    return {
      clsNoInput: sum(false),
      clsInput: sum(true),
      entries: out.shifts.length,
      topShifts: top,
      zoneDeltasT0toT1: zoneDelta(out.T0, out.T1),
      zoneDeltasT1toT2: zoneDelta(out.T1, out.T2),
    };
  } catch (e) {
    return { error: String(e).slice(0, 200) };
  } finally {
    await ctx.close();
  }
}

let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch {}
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const out = { generated: new Date().toISOString(), commit, base: BASE, jitter: {}, arm: {} };
for (const w of [1280, 390]) {
  out.jitter[`${w}-dark`] = await measureJitter(w);
  console.log(`jitter ${w}`, JSON.stringify(out.jitter[`${w}-dark`]).slice(0, 220));
  out.arm[`${w}-dark`] = await measureArm(w);
  console.log(`arm ${w}`, JSON.stringify(out.arm[`${w}-dark`]).slice(0, 220));
}
await browser.close();
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('WROTE', OUT);
