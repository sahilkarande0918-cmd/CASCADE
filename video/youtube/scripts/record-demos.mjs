// Records the live Cascade site in real time, driven to match what the speakers
// say. Each demo logs when its first visible frame ("start") happened so the
// composition can trim to it. Usage: node scripts/record-demos.mjs [a|b|c]
import { mkdirSync, readdirSync, renameSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const SITE = 'https://cascade-jade-chi.vercel.app';
const OUT = fileURLToPath(new URL('../assets/demo/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const city = JSON.parse(readFileSync(fileURLToPath(new URL('../../../public/data/pune.json', import.meta.url)), 'utf8'));
const plant = city.nodes.find((n) => n.name === 'Parvati Water Treatment Plant');
const hash = (s) => Buffer.from(JSON.stringify({ c: 'pune', s: 0, f: [], p: [[], [], []], v: -1, o: {}, a: {}, ...s })).toString('base64url');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function demo(name, url, script) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, recordVideo: { dir: OUT, size: { width: 1600, height: 900 } } });
  const t0 = Date.now();
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const marks = {};
  const mark = (k) => (marks[k] = (Date.now() - t0) / 1000);
  // `at(s)` waits until s seconds after "start", so actions land on the speaker's words.
  let start = 0;
  const at = async (s) => { const wait = start + s * 1000 - Date.now(); if (wait > 0) await sleep(wait); };
  await script({ page, mark, at, setStart: () => { start = Date.now(); mark('start'); } });
  const video = page.video();
  await ctx.close();
  await browser.close();
  const src = await video.path();
  renameSync(src, `${OUT}${name}.webm`);
  writeFileSync(`${OUT}${name}.json`, JSON.stringify(marks, null, 2));
  console.log(name, marks);
}

const which = process.argv[2];

// A: Sahil, local 72.6 to 134.8. Offsets below are seconds after 72.6.
if (!which || which === 'a') await demo('a', `${SITE}/dashboard#${hash({})}`, async ({ page, at, setStart, mark }) => {
  await page.waitForTimeout(15000);
  setStart();
  await at(10.6); // "I'm failing the ... water treatment plant"
  const pt = await page.evaluate(([lng, lat]) => {
    const m = window.__cascadeMap;
    const p = m.project([lng, lat]);
    const r = m.getContainer().getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }, [plant.lng, plant.lat]);
  await page.mouse.move(pt.x - 120, pt.y - 60);
  await page.mouse.move(pt.x, pt.y, { steps: 15 });
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Fail this node' }).click();
  mark('failed');
  await at(15.6); // "Now I will run the clock"
  await page.getByRole('button', { name: /Replay|Play/ }).click();
  mark('play');
  await at(38.7); // "I can click any failure and ask why"
  await page.getByRole('button', { name: 'Sardar Patel Cantonment General Hospital' }).first().click();
  mark('why');
  await at(45.3); // "And every link is labelled"
  await page.getByText('Depends on', { exact: true }).scrollIntoViewIfNeeded();
  await at(47.8);
  await page.getByText('Depends on', { exact: true }).locator('xpath=..').locator('button').first().click();
  mark('edge');
  await at(53.6); // "user-set means you changed it"
  await page.getByRole('button', { name: 'Confirm' }).click();
  mark('confirm');
  await at(62.5);
});

// B: Pranav, local 97.0 to 123.3. Offsets are seconds after 97.0.
if (!which || which === 'b') await demo('b', `${SITE}/dashboard#${hash({ s: 2 })}`, async ({ page, at, setStart, mark }) => {
  await page.waitForTimeout(15000);
  await page.getByRole('heading', { name: 'Budgeted optimizer' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  setStart();
  await at(3.4); // "You choose a budget"
  await page.locator('#budget').selectOption('3');
  await at(4.6);
  await page.getByRole('button', { name: 'Find best plan' }).click();
  mark('optimize');
  await page.waitForSelector('text=Option 1', { timeout: 60000 });
  mark('result');
  await at(16.0);
  await page.getByRole('button', { name: 'Load as A' }).first().click();
  mark('loaded');
  await at(20.3); // "compare up to three plans side by side"
  await page.locator('table').last().scrollIntoViewIfNeeded();
  mark('compare');
  await at(26.5);
});

// C: Pranav, local 151.4 to 155.7: the method page's assumptions.
if (!which || which === 'c') await demo('c', `${SITE}/method`, async ({ page, at, setStart }) => {
  await page.waitForTimeout(4000);
  await page.getByRole('heading', { name: 'Assumptions' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  setStart();
  for (let i = 0; i < 24; i++) { await page.mouse.wheel(0, 40); await page.waitForTimeout(160); }
  await at(5.5);
});
