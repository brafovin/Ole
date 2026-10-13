// Usage: node tests/shot.mjs <url-path> <out.png> [width height] [waitMs]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, path, out, w = '1400', h = '800', waitMs = '0'] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://localhost:5199/' + path);
await page.waitForFunction(() => window.__done === true, null, { timeout: 60000 }).catch(() => logs.push('timeout waiting for __done'));
if (+waitMs) await page.waitForTimeout(+waitMs);
await page.screenshot({ path: out });
console.log(logs.join('\n'));
await browser.close();
