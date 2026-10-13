// Shared Playwright harness for the game tests.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

export async function launch({ quality = 'low', width = 1280, height = 720, url = 'http://localhost:5199/index.html?nolock&maxdt=0.1' } = {}) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addInitScript((q) => {
    if (!localStorage.getItem('bloodmoon.settings.v1')) localStorage.setItem('bloodmoon.settings.v1', JSON.stringify({ quality: q }));
  }, quality);
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
  await page.goto(url);
  await page.waitForFunction(() => window.__BLOODMOON__ && window.__BLOODMOON__.state === 'menu-gate', null, { timeout: 120000 });
  return { browser, context, page, logs };
}

export const G = (page, fn, arg) => page.evaluate(fn, arg);
export const info = (page) => page.evaluate(() => window.__BLOODMOON__.debug.info());
export const wait = (page, ms) => page.waitForTimeout(ms);
/** Wait for game-simulated seconds (the software renderer is slow, so real time != game time). */
export async function waitGame(page, seconds, timeout = 120000) {
  await page.evaluate(() => (window.__t0 = window.__BLOODMOON__.stats.playTime));
  // returns early when an overlay (note, dialogue, death…) pauses the simulation
  await page.waitForFunction((s) => window.__BLOODMOON__.overlay || window.__BLOODMOON__.state !== 'play' || window.__BLOODMOON__.stats.playTime - window.__t0 >= s, seconds, { timeout, polling: 100 });
}
