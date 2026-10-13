import { launch, G, info, wait, waitGame } from './harness.mjs';
const { browser, page, logs } = await launch();
const log = (...a) => console.log(...a);
await page.mouse.click(640, 360);
await wait(page, 1500);
await page.click('[data-act="start"]');
await page.waitForFunction(() => window.__BLOODMOON__.state === 'play', null, { timeout: 60000 });
await G(page, () => window.__BLOODMOON__.debug.teleport(0, 16.6, 0));
await waitGame(page, 0.3);
log('interact:', (await info(page)).interact);
await page.keyboard.press('KeyF');
await wait(page, 1500);
log('overlay after F:', (await info(page)).overlay);
await page.screenshot({ path: 'tests/screenshots/note.png' });
await page.keyboard.press('KeyF');
await wait(page, 500);
log('overlay after close:', (await info(page)).overlay);
await waitGame(page, 2.5);
let i = await info(page);
log('enemies:', JSON.stringify(i.enemies), 'quests m1:', i.quests.m1);
// face the crawlers and fight
await G(page, () => { const g = window.__BLOODMOON__; g.debug.teleport(0, 6.5, Math.PI); });
await waitGame(page, 1.0);
await page.screenshot({ path: 'tests/screenshots/crawlers.png' });
for (let k = 0; k < 14; k++) {
  await G(page, () => { const g = window.__BLOODMOON__; const e = g.enemies.nearest(g.player.pos, 20); if (e) { const yaw = Math.atan2(e.pos.x - g.player.pos.x, e.pos.z - g.player.pos.z); g.cameraRig.yaw = yaw + Math.PI; } });
  await page.mouse.down({ button: 'left' });
  await page.mouse.up({ button: 'left' });
  await waitGame(page, 0.35);
  if (k === 3) await page.screenshot({ path: 'tests/screenshots/combat.png' });
}
i = await info(page);
log('after fight: hp', i.hp, 'xp', i.xp, 'level', i.level, 'blood', i.blood, 'enemies', JSON.stringify(i.enemies), 'm1', i.quests.m1);
// abilities
await G(page, () => window.__BLOODMOON__.player.blood = 100);
await page.keyboard.press('KeyQ');
await waitGame(page, 0.5);
i = await info(page);
log('after Q: cooldowns', JSON.stringify(i.cooldowns), 'blood', i.blood, 'pos', i.pos);
await page.screenshot({ path: 'tests/screenshots/ability_q.png' });
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
