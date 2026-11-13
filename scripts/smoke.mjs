// Clicks through every dashboard feature and reports what worked.
// Usage: node scripts/smoke.mjs [baseUrl]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:3000';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 160)));
const ok = (name, pass) => console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`);

await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(12000);
ok('impact panel shows a simulated number', /\d/.test(await page.locator('text=thousand person-hours').first().locator('xpath=..').innerText()));
await page.getByRole('button', { name: 'Rank' }).click();
await page.waitForTimeout(20000);
ok('fragility ranking lists nodes', (await page.locator('ol li').count()) >= 5);
await page.getByRole('button', { name: /^Karva Hospital|^Naik Hospital/ }).first().click();
await page.waitForTimeout(1500);
ok('why-did-this-fail trace', await page.locator('text=Why did this fail?').isVisible());
await page.getByRole('button', { name: 'Explain in plain English' }).click();
await page.waitForTimeout(4000);
ok('explanation (template or Gemini)', await page.locator('text=narration from the engine output').isVisible());
const dep = page.locator('text=Depends on').locator('xpath=..').locator('button').first();
await dep.click();
await page.waitForTimeout(800);
ok('edge inspector with provenance', await page.getByRole('button', { name: 'Confirm' }).isVisible());
await page.getByRole('button', { name: 'Confirm' }).click();
await page.waitForTimeout(800);
ok('edge override marked user-set', (await page.locator('text=user-set').count()) > 0);
ok('share link in URL hash', (await page.evaluate(() => location.hash)).length > 20);
for (const c of ['Chennai', 'Valencia']) {
  await page.getByRole('radio', { name: c }).click();
  await page.waitForTimeout(9000);
  ok(`${c} loads and simulates`, await page.getByText('Facilities down', { exact: true }).isVisible());
}
await page.goto(`${base}/method`);
ok('method page lists assumptions', await page.locator('text=Hospital generator fuel').isVisible());
await page.goto(`${base}/`);
await page.waitForTimeout(6000);
ok('landing renders', await page.locator('text=Watch a city fail.').isVisible());
console.log('page errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
