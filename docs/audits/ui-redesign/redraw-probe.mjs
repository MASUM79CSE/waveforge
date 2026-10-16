// Phase 0 baseline — waveform redraw-cost probe (UI redesign program).
// Measures, during a 5 s playback window on the loaded sample:
//   - canvas draw-call counts (clear/fill/stroke/beginPath/drawImage) as redraw-activity proxy
//   - requestAnimationFrame cadence
//   - long-animation-frame entries (duration / blocking)
// Same probe is re-run in Phase 6 for before/after comparison.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : 'http://localhost:5180';
const OUT = new URL('./baseline/redraw-metrics.json', import.meta.url).pathname;
mkdirSync(new URL('./baseline/', import.meta.url).pathname, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => {
  window.__probe = { raf: 0, clearRect: 0, fillRect: 0, strokeRect: 0, beginPath: 0, drawImage: 0, arc: 0 };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { window.__probe.raf++; return cb(t); });
  const wrap = (proto, name) => {
    const orig = proto[name];
    proto[name] = function (...a) { window.__probe[name]++; return orig.apply(this, a); };
  };
  for (const n of ['clearRect', 'fillRect', 'strokeRect', 'beginPath', 'drawImage', 'arc'])
    wrap(CanvasRenderingContext2D.prototype, n);
  window.__loaf = [];
  const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__loaf.push({ d: Math.round(e.duration), b: Math.round(e.blockingDuration) }); });
  po.observe({ type: 'long-animation-frame', buffered: false });
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByRole('dialog', { name: /welcome/i }).getByRole('button', { name: /load sample/i }).click();
await page.waitForTimeout(500);
await page.getByTestId('transport-play').click();
const t0 = Date.now();
await page.waitForTimeout(5000);
const probe = await page.evaluate(() => window.__probe);
const loaf = await page.evaluate(() => window.__loaf);
await page.getByTestId('transport-stop').click();

const out = {
  window: { ms: Date.now() - t0, viewport: '1280x800', theme: 'light', state: 'playing, sample loaded' },
  drawCalls: probe,
  rafCalls: probe.raf,
  longAnimationFrame: { count: loaf.length, totalMs: loaf.reduce((s, e) => s + e.d, 0), blockingMs: loaf.reduce((s, e) => s + e.b, 0), worst: loaf.reduce((m, e) => Math.max(m, e.d), 0) },
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
// eslint-disable-next-line no-console
console.log('redraw probe done', JSON.stringify(out.drawCalls), 'loaf', JSON.stringify(out.longAnimationFrame));
await browser.close();
