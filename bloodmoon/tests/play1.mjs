import { launch, G, info, wait, waitGame } from './harness.mjs';
const { browser, page, logs } = await launch();
await page.mouse.click(640, 360);
await wait(page, 1500);
await page.click('[data-act="start"]');
await page.waitForFunction(() => window.__BLOODMOON__.state === 'play', null, { timeout: 60000 });
await waitGame(page, 1.5);
await page.screenshot({ path: 'tests/screenshots/play_start.png' });
console.log(JSON.stringify(await info(page)));
// walk forward towards the altar
await page.keyboard.down('KeyW');
await waitGame(page, 1.2);
await page.keyboard.up('KeyW');
await waitGame(page, 0.5);
await page.screenshot({ path: 'tests/screenshots/play_walk.png' });
console.log(JSON.stringify(await info(page)));
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
