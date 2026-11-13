// Headless screenshots with software WebGL, so the map and the 3D scene render.
// Usage: node scripts/shot.mjs <url> <out.png> [width=1440] [height=900] [waitMs=8000] [fullPage=0] [scrollY=0]
import { chromium } from 'playwright';

const [url = 'http://localhost:3000/', out = 'shot.png', w = '1440', h = '900', wait = '8000', full = '0', scrollY = '0'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 240)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 240)));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(+wait);
if (+scrollY) { await page.evaluate((y) => window.scrollTo(0, y), +scrollY); await page.waitForTimeout(1500); }
await page.screenshot({ path: out, fullPage: full === '1' });
console.log('errors:', errors.length ? errors : 'none');
console.log('saved', out);
await browser.close();
