import { launch, G, info, wait, waitGame } from './harness.mjs';
for (const q of ['low', 'medium']) {
  const { browser, page, logs } = await launch({ quality: q, width: 960, height: 540 });
  await page.mouse.click(480, 270);
  await wait(page, 1000);
  await page.click('[data-act="start"]');
  await page.waitForFunction(() => window.__BLOODMOON__.state === 'play', null, { timeout: 90000 });
  await wait(page, 2000);
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(n / 3); }; requestAnimationFrame(f); }));
  console.log(q, 'fps (software renderer):', fps.toFixed(1));
  await G(page, () => window.__BLOODMOON__.debug.teleport(0, -40, Math.PI));
  await wait(page, 4000);
  await page.screenshot({ path: `tests/screenshots/village_${q}.png` });
  console.log(logs.slice(0, 10).join('\n'));
  await browser.close();
}
