import { launch, G, info, wait } from './harness.mjs';
const { browser, page, logs } = await launch({ quality: process.argv[2] || 'medium', width: 1280, height: 720 });
await page.mouse.click(640, 360);
await wait(page, 1200);
await page.click('[data-act="start"]');
await page.waitForFunction(() => window.__BLOODMOON__.state === 'play', null, { timeout: 120000 });
await G(page, () => { const g = window.__BLOODMOON__; g.debug.god(true); g.ui.hint = () => {}; document.querySelector('.hint').classList.remove('show'); });
const views = [
  ['cathedral', 0, -11, 0, -0.08],
  ['village', 0, -28, Math.PI, 0.02],
  ['square', 4, -50, Math.PI - 0.3, -0.05],
  ['forest', -4, -103, -2.65, -0.02],
  ['camp', 12, -146, 2.2, -0.12],
  ['altar', 0, -186, Math.PI, 0.05],
];
for (const [name, x, z, f, pitch] of views) {
  await G(page, ([x, z, f, p]) => { const g = window.__BLOODMOON__; g.debug.teleport(x, z, f); g.cameraRig.pitch = p; for (const e of g.enemies.list) if (e.alive && e.pos.distanceTo(g.player.pos) < 14 && !e.isBoss) e.takeDamage(1e6, {}); }, [x, z, f, pitch]);
  await wait(page, 5000);
  await page.screenshot({ path: `tests/screenshots/area_${name}.png` });
}
console.log(logs.slice(0, 10).join('\n'));
await browser.close();
