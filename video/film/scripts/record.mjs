// Records the real, running Cascade dashboard as frame sequences at 2x device
// scale, for the explainer's app scenes. Needs the app on localhost:3000.
// Usage: node scripts/record.mjs
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000/dashboard';
const OUT = new URL('../assets/rec/', import.meta.url);
const city = JSON.parse(readFileSync(new URL('../../../public/data/pune.json', import.meta.url), 'utf8'));
const plant = city.nodes.find((n) => n.name === 'Parvati Water Treatment Plant').id;

// Same encoding as lib/scenario.ts.
const hash = (s) => Buffer.from(JSON.stringify(s)).toString('base64url');
const scenario = { c: 'pune', s: 0, f: [plant], p: [[], [], []], v: -1, o: {}, a: {} };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
await page.goto(`${BASE}#${hash(scenario)}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(14000); // map tiles, the run and Monte Carlo

const scrub = async (t) => {
  await page.evaluate((v) => {
    const el = document.querySelector('input[aria-label="Simulation time"]');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, t);
  await page.waitForTimeout(140);
};
const sequence = async (name, from, to, frames) => {
  const dir = new URL(`${name}/`, OUT);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < frames; i++) {
    await scrub(Math.round(from + ((to - from) * i) / (frames - 1)));
    await page.screenshot({ path: fileURLToPath(new URL(`f${String(i).padStart(4, '0')}.png`, dir)) });
  }
  console.log(`${name}: ${frames} frames`);
};

const only = process.argv[2];
// Scene 11: the cascade spreading from one failed plant, T+0 to T+72h.
if (!only || only === 'cascade') await sequence('cascade', 0, 288, 96);

// Scene 14: why did this hospital fail? Select it, then let the clock run.
if (!only || only === 'trace') {
  await page.getByRole('button', { name: 'Sardar Patel Cantonment General Hospital' }).first().click();
  await page.waitForTimeout(1500);
  await sequence('trace', 130, 178, 48);
}

// Scenes 13/14: plans need a scenario the catalogue can help with, so the
// optimizer runs on Pune's default 2 m flood.
await page.goto(`${BASE}#${hash({ ...scenario, s: 2, f: [] })}`, { waitUntil: 'domcontentloaded' });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(14000);
await page.getByRole('button', { name: 'Find best plan' }).click();
await page.waitForSelector('text=Option 1', { timeout: 180000 });
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Load as A' }).first().click();
await page.waitForTimeout(6000);
await page.locator('table').last().scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
mkdirSync(new URL('stills/', OUT), { recursive: true });
await page.screenshot({ path: fileURLToPath(new URL('stills/plans.png', OUT)) });
console.log('plans: still');

await browser.close();
