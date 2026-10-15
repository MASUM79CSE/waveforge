/**
 * CB-2 deliverable: before/after screenshots — 6 widths x 2 themes x {v1, v2}.
 * Usage: node docs/audits/control-bar/cb2-shots.mjs <baseUrl> <outDir>
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:5175';
const OUT = process.argv[3] ?? 'docs/screenshots/control-bar-v2/phase2';
const WIDTHS = [1440, 1280, 1024, 768, 390, 320];
const THEMES = ['dark', 'light'];
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
});
for (const theme of THEMES) {
  for (const width of WIDTHS) {
    for (const v2 of [false, true]) {
      const ctx = await browser.newContext({ viewport: { width, height: 800 } });
      await ctx.addInitScript((t) => localStorage.setItem('waveforge.theme', t), theme);
      const page = await ctx.newPage();
      try {
        await page.goto(`${BASE}/?cbv2=${v2 ? 1 : 0}`, { waitUntil: 'domcontentloaded' });
        const welcome = page.getByRole('dialog', { name: /welcome/i });
        await welcome.getByRole('button', { name: /load sample/i }).click();
        await page.getByText('demo.wav', { exact: true }).waitFor({ timeout: 20000 });
        await page.waitForTimeout(600);
        const name = `${v2 ? 'v2' : 'v1'}-${theme}-${width}.png`;
        await page.screenshot({ path: join(OUT, name) });
        console.log('shot', name);
      } catch (e) {
        console.log('ERR', theme, width, v2, String(e).slice(0, 120));
      }
      await ctx.close();
    }
  }
}
await browser.close();
