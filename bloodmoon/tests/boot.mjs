import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const url = process.argv[2] || 'http://localhost:5199/index.html?nolock';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => { if (m.type() !== 'debug') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
const t0 = Date.now();
await page.goto(url);
try {
  await page.waitForFunction(() => window.__BLOODMOON__ && window.__BLOODMOON__.state === 'menu-gate', null, { timeout: 120000 });
  console.log('booted in', (Date.now() - t0) / 1000, 's');
} catch (e) { console.log('BOOT TIMEOUT'); }
await page.screenshot({ path: 'tests/screenshots/boot.png' });
await page.mouse.click(640, 360);
await page.waitForTimeout(9000);
await page.screenshot({ path: 'tests/screenshots/menu.png' });
console.log(logs.slice(0, 40).join('\n'));
await browser.close();
