/**
 * CB-5 recon + acceptance probe (Phase 5).
 * For each width: row/page overflow, per-zone geometry, sub-24px target
 * inventory, axe (wcag2a+2aa). Screenshots: --shots=before|after dir.
 * Usage: node cb5-probe.mjs [--shots=before] [--base=http://localhost:5180]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv.find((a) => a.startsWith('--base='))?.slice(7) ?? 'http://localhost:5180';
const shots = process.argv.find((a) => a.startsWith('--shots='))?.slice(8) ?? null;
const WIDTHS = [1280, 1024, 768, 390, 320];
const THEMES = ['dark', 'light'];
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({
  permissions: ['microphone'],
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();

if (shots) mkdirSync(`docs/screenshots/control-bar-v2/phase5/${shots}`, { recursive: true });

for (const width of WIDTHS) {
  for (const theme of THEMES) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`${base}/?cbv2=1`);
    await page.evaluate((t) => localStorage.setItem('waveforge.theme', t), theme);
    const welcome = page.getByRole('dialog', { name: /welcome/i });
    await welcome.getByRole('button', { name: /load sample/i }).click();
    await page.getByText('demo.wav', { exact: true }).waitFor({ timeout: 10_000 });
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(400);

    const m = await page.evaluate(() => {
      const row = document.querySelector('.cb2-row');
      const de = document.documentElement;
      const zones = {};
      for (const [name, sel] of [
        ['transport', '[data-testid="cb2-transport"]'],
        ['clock', '[data-testid="cb2-clock"]'],
        ['tool', '.cb2 .toolbtn'],
        ['selection', '[data-testid="cb2-selection"]'],
        ['tempo', '[data-testid="cb2-tempo"]'],
        ['record', '.cb2-rec-slot'],
        ['master', '[data-testid="cb2-master-vol"]'],
        ['overflow', '[data-testid="cb2-overflow"]'],
      ]) {
        const el = document.querySelector(sel);
        if (el) {
          const b = el.getBoundingClientRect();
          zones[name] = { x: Math.round(b.x), w: Math.round(b.width) };
        }
      }
      const small = [];
      for (const el of document.querySelectorAll('.cb2 button, .cb2 input, .cb2 [role="menuitem"]')) {
        const b = el.getBoundingClientRect();
        if (b.width > 0 && (b.width < 24 || b.height < 24)) {
          small.push(`${el.getAttribute('data-testid') ?? el.className}:${Math.round(b.width)}x${Math.round(b.height)}`);
        }
      }
      return {
        rowScroll: row ? row.scrollWidth - row.clientWidth : null,
        pageScroll: de.scrollWidth - de.clientWidth,
        zones,
        small,
      };
    });
    console.log(`\n=== ${width}px ${theme}`);
    console.log(`row internal overflow: ${m.rowScroll} px · page h-scroll: ${m.pageScroll} px`);
    console.log(`zones: ${JSON.stringify(m.zones)}`);
    if (m.small.length) console.log(`SUB-24: ${m.small.join(' · ')}`);

    if (theme === 'dark') {
      await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
      const violations = await page.evaluate(async () => {
        const r = await window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
        });
        return r.violations.map((v) => `${v.impact} ${v.id} x${v.nodes.length}`);
      });
      console.log(`axe: ${violations.length === 0 ? 'CLEAN' : violations.join(' | ')}`);
    }

    if (shots) {
      await page.screenshot({
        path: `docs/screenshots/control-bar-v2/phase5/${shots}/${width}-${theme}.png`,
      });
    }
  }
}
await browser.close();
console.log('\nprobe done');
