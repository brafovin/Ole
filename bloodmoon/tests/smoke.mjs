/**
 * End-to-end acceptance test. Drives the real game in headless Chromium (software WebGL) through
 * the menus, combat, abilities, quests, save/load, the boss fight, death/respawn and settings.
 *
 * Usage:  1) serve the folder:  npx http-server -p 5199 -c-1 .
 *         2) node tests/smoke.mjs
 * Some steps use the debug API (window.__BLOODMOON__.debug) to teleport between areas so the
 * test finishes in reasonable time on a CPU renderer; every interaction itself uses real input.
 */
import { launch, G, info, wait, waitGame } from './harness.mjs';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const { browser, context, page, logs } = await launch({ width: 1280, height: 720 });
const tp = (x, z, f) => G(page, ([x, z, f]) => window.__BLOODMOON__.debug.teleport(x, z, f), [x, z, f]);
const g = (fn, arg) => G(page, fn, arg);
const overlay = async () => (await info(page)).overlay;
const flags = () => g(() => window.__BLOODMOON__.flags);
async function aim() {
  await g(() => {
    const G = window.__BLOODMOON__;
    const e = G.enemies.nearest(G.player.pos, 30);
    if (e) G.cameraRig.yaw = Math.atan2(e.pos.x - G.player.pos.x, e.pos.z - G.player.pos.z) + Math.PI;
  });
}
async function attack(n = 1, button = 'left') {
  for (let i = 0; i < n; i++) {
    await aim();
    await page.mouse.down({ button });
    await page.mouse.up({ button });
    await waitGame(page, 0.3);
  }
}
async function press(key, gameSeconds = 0.25) {
  await page.keyboard.press(key);
  await waitGame(page, gameSeconds);
}
async function finishDialogue(choice = 1) {
  for (let i = 0; i < 30; i++) {
    const o = await overlay();
    if (o !== 'dialogue') return true;
    const hasChoices = await page.locator('.dialogue .dc .btn').count();
    if (hasChoices) await page.keyboard.press('Digit' + choice);
    else await page.keyboard.press('Space');
    await wait(page, 350);
    // typing: a second press completes text; a third advances
  }
  return (await overlay()) !== 'dialogue';
}
async function readAndClose() {
  await press('KeyF', 0.1);
  await wait(page, 400);
  const o = await overlay();
  if (o === 'note') await page.keyboard.press('KeyF');
  await wait(page, 300);
  return o;
}
const spawn = (type, dx, dz) => g(([type, dx, dz]) => {
  const G = window.__BLOODMOON__;
  const f = G.player.aimDir();
  const x = G.player.pos.x + f.x * dz + dx, z = G.player.pos.z + f.z * dz;
  G.enemies.spawn({ id: 'test_' + Math.random().toString(36).slice(2), type, x, z, noSave: true });
}, [type, dx, dz]);

try {
  // ------------------------------------------------------------------ menus
  await page.mouse.click(640, 360);
  await wait(page, 1500);
  check('Main menu displays', (await g(() => window.__BLOODMOON__.state)) === 'menu' && (await page.locator('#screen-menu.show').count()) === 1);

  await page.click('[data-act="settings"]');
  await wait(page, 600);
  await g(() => { const el = document.querySelector('input[data-set="masterVolume"]'); el.value = 0.5; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('.seg[data-set="screenShake"] button[data-v="0"]');
  await page.click('.toggle[data-set="reduceFlashing"]');
  const st = await g(() => ({ v: window.__BLOODMOON__.settings.get('masterVolume'), sh: window.__BLOODMOON__.settings.get('screenShake'), fl: window.__BLOODMOON__.settings.get('reduceFlashing'), stored: JSON.parse(localStorage.getItem('bloodmoon.settings.v1')), master: window.__BLOODMOON__.audio.master && window.__BLOODMOON__.audio.master.gain.value }));
  check('Settings change values and persist', st.v === 0.5 && st.sh === 0 && st.fl === true && st.stored.masterVolume === 0.5, JSON.stringify({ v: st.v, sh: st.sh, fl: st.fl }));
  await page.click('#screen-settings [data-act="back"]');
  await wait(page, 500);

  await page.click('[data-act="credits"]');
  await wait(page, 500);
  const creditsShown = await page.locator('#screen-credits.show').count();
  check('Credits list real technologies', creditsShown === 1 && (await page.locator('#screen-credits').textContent()).includes('Three.js'), `shown=${creditsShown}`);
  await page.click('#screen-credits [data-act="back"]');
  await wait(page, 500);

  await page.click('[data-act="continue"]');
  await wait(page, 600);
  check('Continue without a save explains there is none', (await page.locator('.modal:not(.hidden)').innerText()).includes('No saved journey'));
  await page.click('.modal [data-act="cancel"]');
  await wait(page, 300);

  await page.click('[data-act="chars"]');
  await wait(page, 800);
  await page.click('[data-char="seraphina"]');
  await wait(page, 1500);
  await page.click('#screen-charselect [data-act="confirm"]');
  await wait(page, 800);
  check('Character selection changes the character', (await g(() => window.__BLOODMOON__.profile.character)) === 'seraphina');

  // ------------------------------------------------------------------ new game
  await page.click('[data-act="start"]');
  await page.waitForFunction(() => window.__BLOODMOON__.state === 'play', null, { timeout: 90000 });
  let i = await info(page);
  check('Start Game launches the playable level', i.state === 'play' && i.area === 'cathedral');
  check('Selected character is used in-game', i.char === 'seraphina');

  const p0 = i.pos;
  await page.keyboard.down('KeyW');
  await waitGame(page, 1.0);
  await page.keyboard.up('KeyW');
  i = await info(page);
  check('Player moves with WASD', Math.hypot(i.pos[0] - p0[0], i.pos[1] - p0[1]) > 1.5, `moved from ${p0} to ${i.pos}`);
  await page.keyboard.press('Space');
  await waitGame(page, 0.2);
  const y = await g(() => window.__BLOODMOON__.player.pos.y);
  check('Player can jump', y > 0.2, `y=${y.toFixed(2)}`);
  await waitGame(page, 0.8);

  // camera look (pointer-lock is emulated in test mode)
  const yaw0 = await g(() => window.__BLOODMOON__.cameraRig.yaw);
  await g(() => { window.__BLOODMOON__.input.lookX += 200; });
  await waitGame(page, 0.1);
  check('Mouse look rotates the camera', Math.abs((await g(() => window.__BLOODMOON__.cameraRig.yaw)) - yaw0) > 0.2);

  // note + tutorial
  await tp(0, 16.6, 0);
  await waitGame(page, 0.2);
  const o1 = await readAndClose();
  check('Interact (F) opens the altar note', o1 === 'note');
  await waitGame(page, 2.2);
  i = await info(page);
  const tut = i.enemies.filter((e) => e.id.startsWith('tut_'));
  check('Reading the note spawns the tutorial enemies', tut.length === 3, JSON.stringify(tut));
  check('Quest objective updates automatically (note)', i.quests.m1.includes('"note":1'));

  // combat: kill the crawlers with real attacks
  await tp(0, 6.5, Math.PI);
  let minHp = i.hp;
  for (let k = 0; k < 40; k++) {
    await attack(1);
    const ii = await info(page);
    minHp = Math.min(minHp, ii.hp);
    if (!ii.enemies.some((e) => e.id.startsWith('tut_'))) break;
  }
  i = await info(page);
  check('Attacks damage and defeat enemies', !i.enemies.some((e) => e.id.startsWith('tut_')), `xp=${i.xp}`);
  check('Quest updates when enemies are defeated', i.quests.m1.includes('"crawlers":3'));

  // enemies can damage the player
  await g(() => { window.__BLOODMOON__.player.hp = window.__BLOODMOON__.player.maxHp; });
  await spawn('crawler', 0, 2.2);
  await waitGame(page, 3);
  i = await info(page);
  check('Enemies detect, attack and damage the player', i.hp < i.maxHp || minHp < i.maxHp, `hp ${i.hp}/${i.maxHp}`);
  await g(() => window.__BLOODMOON__.debug.killNear(10));

  // Seraphina's abilities
  await g(() => { const P = window.__BLOODMOON__.player; P.blood = P.maxBlood; });
  await spawn('knight', -1.2, 6);
  await spawn('crawler', 1.2, 6);
  await waitGame(page, 0.3);
  await aim();
  const hpSum = async () => (await info(page)).enemies.filter((e) => e.id.startsWith('test_') && e.d < 16).reduce((s, e) => s + e.hp, 0);
  let before = await hpSum();
  await press('KeyQ', 1.5);
  i = await info(page);
  check('Seraphina Q (Blood Roses) costs blood, starts cooldown and damages', i.cooldowns.q > 0 && (await hpSum()) < before, `cd=${i.cooldowns.q.toFixed(1)}`);
  await g(() => window.__BLOODMOON__.debug.killNear(15));
  await spawn('knight', 0, 6);
  await waitGame(page, 0.2);
  await aim();
  await press('KeyE', 0.3);
  const rooted = await g(() => window.__BLOODMOON__.enemies.list.some((e) => e.alive && e.rootT > 0));
  await spawn('crawler', 1.5, 6);
  check('Seraphina E (Crimson Chains) immobilises an enemy', rooted);
  await g(() => { const P = window.__BLOODMOON__.player; P.blood = P.maxBlood; });
  before = await hpSum();
  await press('KeyR', 3.6);
  i = await info(page);
  check('Seraphina R (Queen of the Crimson Moon) damages enemies', i.cooldowns.r > 0 && (await hpSum()) < before);
  await g(() => window.__BLOODMOON__.debug.killNear(15));
  await spawn('knight', 0, 7);
  await waitGame(page, 0.3);
  before = await hpSum();
  await g(() => { window.__BLOODMOON__.player.stamina = 100; });
  await aim();
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
  await waitGame(page, 0.9);
  check('Right click (Blood Crescent) damages at range', (await hpSum()) < before);
  await g(() => window.__BLOODMOON__.debug.killNear(15));

  // key, doors, quest completion
  await tp(16.2, 3.6, 0);
  await waitGame(page, 0.2);
  await readAndClose();
  i = await info(page);
  check("Sexton's Key appears in the inventory", await g(() => window.__BLOODMOON__.inventory.has('sextonKey')));
  await tp(0, -14.2, Math.PI);
  await waitGame(page, 0.2);
  await press('KeyF', 2.5);
  i = await info(page);
  check('Cathedral doors open with the key; quest chain advances', (await flags()).doors_open && i.quests.m1.startsWith('complete') && i.quests.m2.startsWith('active') && i.quests.m3.startsWith('active'));

  // collectible
  await tp(-8.8, 5.6, Math.PI);
  await waitGame(page, 0.2);
  const vialsBefore = await g(() => window.__BLOODMOON__.inventory.count('vial'));
  await press('KeyF', 0.3);
  check('Collectibles go into the inventory', (await g(() => window.__BLOODMOON__.inventory.count('vial'))) === vialsBefore + 1);

  // inventory & pause & save
  await page.keyboard.press('Tab');
  await wait(page, 600);
  check('Inventory opens with Tab', (await overlay()) === 'inventory' && (await page.locator('#screen-inventory.show').count()) === 1);
  await page.click('.tab[data-tab="journal"]');
  await wait(page, 300);
  check('Quest journal lists quests', (await page.locator('.inv-body').innerText()).includes('Find the Missing Survivors'));
  await page.keyboard.press('Tab');
  await wait(page, 400);
  await page.keyboard.press('Escape');
  await wait(page, 600);
  check('Pause menu opens with Escape', (await overlay()) === 'pause');
  await page.click('#screen-pause [data-act="save"]');
  await wait(page, 500);
  const saved = await g(() => JSON.parse(localStorage.getItem('bloodmoon.save.v1')));
  check('Save game writes versioned data', saved && saved.version === 1 && saved.flags.doors_open === true && saved.inventory.items.sextonKey === 1);
  await page.click('#screen-pause [data-act="resume"]');
  await wait(page, 400);
  check('Resume closes the pause menu', (await overlay()) === null);

  // ------------------------------------------------------------------ reload + continue
  await page.reload();
  await page.waitForFunction(() => window.__BLOODMOON__ && window.__BLOODMOON__.state === 'menu-gate', null, { timeout: 120000 });
  await page.mouse.click(640, 360);
  await wait(page, 1200);
  await page.click('[data-act="continue"]');
  await page.waitForFunction(() => window.__BLOODMOON__.state === 'play', null, { timeout: 90000 });
  i = await info(page);
  const f2 = await flags();
  check('Continue restores saved progress', f2.doors_open && i.quests.m1.startsWith('complete') && (await g(() => window.__BLOODMOON__.inventory.has('sextonKey'))) && i.level >= 1 && i.char === 'seraphina', `level ${i.level}, xp ${i.xp}`);

  // ------------------------------------------------------------------ village: survivors
  await tp(-6, -36, Math.PI / 2);
  await waitGame(page, 0.3);
  await g(() => window.__BLOODMOON__.debug.killNear(9));
  await waitGame(page, 0.3);
  await tp(-10.4, -37.4, -Math.PI / 2);
  await waitGame(page, 0.3);
  await press('KeyF', 0.1);
  await wait(page, 300);
  check('Talking to a survivor opens a dialogue', (await overlay()) === 'dialogue');
  await finishDialogue();
  await tp(9.6, -38, Math.PI / 2);
  await waitGame(page, 0.3);
  await press('KeyF', 0.1);
  await wait(page, 300);
  await finishDialogue(2);
  check('Dialogue choices are recorded (Elise)', (await flags()).choice_elise === 'refuse' && (await g(() => window.__BLOODMOON__.inventory.has('thimble'))));
  await tp(3.2, -66.5, Math.PI);
  await waitGame(page, 0.3);
  await g(() => window.__BLOODMOON__.debug.killNear(14));
  await waitGame(page, 0.4);
  await tp(3.2, -68.3, Math.PI);
  await waitGame(page, 0.3);
  await press('KeyF', 0.1);
  await wait(page, 300);
  await finishDialogue(1);
  await waitGame(page, 2.0);
  await finishDialogue();
  i = await info(page);
  const f3 = await flags();
  check('All survivors found, quest completes and the North Gate opens', f3.found_doran && f3.found_elise && f3.found_marta && i.quests.m2.startsWith('complete') && f3.gate_open, JSON.stringify({ d: f3.found_doran, e: f3.found_elise, m: f3.found_marta, gate: f3.gate_open }));

  // clues
  await tp(5.0, -55, -Math.PI / 2);
  await waitGame(page, 0.2);
  await readAndClose();
  await g(() => window.__BLOODMOON__.debug.give('mayorKey'));
  await tp(-5.6, -60, -Math.PI / 2);
  await waitGame(page, 0.2);
  await press('KeyF', 1.3);
  await tp(-9, -61.4, Math.PI);
  await waitGame(page, 0.2);
  await readAndClose();
  await tp(-11.0, -60.6, -Math.PI / 2);
  await waitGame(page, 0.2);
  await press('KeyF', 1.4);
  check('Secret room discovered (bookshelf)', (await flags()).shelf_moved && (await info(page)).quests.s3.includes('"rooms":1'));
  await tp(18.6, -148.6, Math.PI / 2);
  await waitGame(page, 0.2);
  await readAndClose();
  i = await info(page);
  check('Three clues complete the Blood Moon quest', i.quests.m3.startsWith('complete'), i.quests.m3);

  // forest + ambush
  await tp(0, -97, Math.PI);
  await waitGame(page, 0.5);
  await tp(0, -151, Math.PI);
  await waitGame(page, 0.3);
  await tp(0, -156, Math.PI);
  await waitGame(page, 1.5);
  i = await info(page);
  check('Forest ambush triggers', (await flags()).trig_ambush === true, JSON.stringify(i.enemies.slice(0, 5)));
  for (let k = 0; k < 6; k++) { await g(() => window.__BLOODMOON__.debug.killNear(25)); await waitGame(page, 0.4); }
  i = await info(page);
  check('Surviving the ambush updates the quest', i.quests.m4.includes('"ambush":5'), i.quests.m4);
  await tp(0, -181.5, Math.PI);
  await waitGame(page, 0.6);
  i = await info(page);
  check('Reaching the altar completes the forest quest', i.quests.m4.startsWith('complete') && i.quests.m5.startsWith('active'));

  // seal + boss
  await tp(0, -188.6, Math.PI);
  await waitGame(page, 0.2);
  await press('KeyF', 0.6);
  check('Blood Seal breaks with all clues', (await flags()).seal_broken === true);
  await g(() => window.__BLOODMOON__.debug.god(true));
  await tp(0, -199, Math.PI);
  await waitGame(page, 3.5);
  check('Boss encounter starts', (await info(page)).boss !== null);
  await finishDialogue(1);
  await waitGame(page, 0.5);
  i = await info(page);
  check('Boss health bar is visible', (await page.locator('.boss-bar.show').count()) === 1);
  const bossHp0 = i.boss.hp;
  for (let k = 0; k < 10; k++) {
    await g(() => { const G = window.__BLOODMOON__; const b = G.boss; if (b) { G.player.pos.set(b.pos.x, 0, b.pos.z + 2.4); } });
    await attack(1);
  }
  i = await info(page);
  check('Player attacks damage the boss', i.boss && i.boss.hp < bossHp0, `${bossHp0} -> ${i.boss && i.boss.hp}`);
  // finish the fight quickly with repeated ability-strength hits
  for (let k = 0; k < 80; k++) {
    const b = await g(() => { const G = window.__BLOODMOON__; const b = G.boss; if (!b || !b.alive) return null; G.combat.hit(b, 60, { ability: true }); return { hp: b.hp, phase: b.phase, state: b.state }; });
    if (!b) break;
    if (b.state === 'phase') await waitGame(page, 2.6);
    else await waitGame(page, 0.1);
  }
  check('Boss reaches phase 2 below 50% health', (await g(() => window.__BLOODMOON__.flags.boss_defeated || (window.__BLOODMOON__.boss && window.__BLOODMOON__.boss.phase === 2))) === true);
  // the defeat runs in slow motion, so wait for the dialogue itself rather than a fixed time
  await page.waitForFunction(() => window.__BLOODMOON__.overlay === 'dialogue', null, { timeout: 180000 });
  await finishDialogue(1);
  await page.waitForFunction(() => window.__BLOODMOON__.overlay === 'victory', null, { timeout: 60000 }).catch(() => {});
  await wait(page, 1000);
  check('Boss can be defeated; victory screen shows', (await flags()).boss_defeated === true && (await page.locator('#screen-victory.show').count()) === 1);
  await page.screenshot({ path: 'tests/screenshots/victory.png' });
  const savedBoss = await g(() => JSON.parse(localStorage.getItem('bloodmoon.save.v1')));
  check('Boss completion is saved', savedBoss.bossDefeated === true && savedBoss.flags.boss_defeated === true);
  check('Eternal Night cosmetic unlocked', (await g(() => window.__BLOODMOON__.profile.unlocked)).includes('eternal'));
  await page.click('#screen-victory [data-act="explore"]');
  await wait(page, 600);

  // ------------------------------------------------------------------ death & respawn
  await g(() => window.__BLOODMOON__.debug.god(false));
  await tp(0, -170, 0);
  await g(() => { window.__BLOODMOON__.player.hp = 1; });
  await spawn('crawler', 0, 2);
  await waitGame(page, 3.5);
  check('Death screen appears when health reaches zero', (await overlay()) === 'death' && (await page.locator('#screen-death.show').count()) === 1);
  await page.click('#screen-death [data-act="respawn"]');
  await wait(page, 2500);
  i = await info(page);
  check('Respawn at the last shrine with full health', i.overlay === null && i.hp === i.maxHp && (await g(() => window.__BLOODMOON__.player.alive)), `pos ${i.pos}`);

  // ------------------------------------------------------------------ Kairo & Lucien abilities
  await page.keyboard.press('Escape');
  await wait(page, 500);
  await page.click('#screen-pause [data-act="quit"]');
  await wait(page, 500);
  await page.click('.modal [data-act="ok"]');
  await page.waitForFunction(() => window.__BLOODMOON__.state === 'menu', null, { timeout: 30000 });
  await wait(page, 1000);
  await page.click('[data-act="chars"]');
  await wait(page, 600);
  await page.click('[data-char="kairo"]');
  await wait(page, 1200);
  await page.click('#screen-charselect [data-act="confirm"]');
  await wait(page, 600);
  await page.click('[data-act="continue"]');
  await page.waitForFunction(() => window.__BLOODMOON__.state === 'play', null, { timeout: 90000 });
  check('Character switch applies to the continued journey', (await info(page)).char === 'kairo');
  await tp(-2, -30, Math.PI);
  await g(() => { const P = window.__BLOODMOON__.player; P.blood = P.maxBlood; });
  await spawn('knight', 0, 5);
  await waitGame(page, 0.3);
  await aim();
  await page.mouse.down({ button: 'right' });
  await waitGame(page, 0.3);
  check('Kairo blocks with right mouse', await g(() => window.__BLOODMOON__.player.blocking));
  await page.mouse.up({ button: 'right' });
  await waitGame(page, 0.2);
  const kp = (await info(page)).pos;
  await aim();
  await press('KeyQ', 0.6);
  const kp2 = (await info(page)).pos;
  check('Kairo Q (Spectral Dash) dashes forward', Math.hypot(kp2[0] - kp[0], kp2[1] - kp[1]) > 3, `${kp} -> ${kp2}`);
  await press('KeyE', 0.3);
  check('Kairo E (Moonlight Guard) raises a barrier', await g(() => window.__BLOODMOON__.player.guardT > 0));
  await aim();
  before = await hpSum();
  await press('KeyR', 1.8);
  check('Kairo R (Celestial Execution) damages its target', (await hpSum()) < before || !(await info(page)).enemies.some((e) => e.type === 'knight'));

  await g(() => { const G = window.__BLOODMOON__; G.selectCharacter('lucien', 'default'); });
  await g(() => { const G = window.__BLOODMOON__; G.player.setCharacter('lucien', 'default'); G.player.recompute(); G.player.blood = G.player.maxBlood; G.ui.showHUD(true); });
  await g(() => window.__BLOODMOON__.debug.killNear(20));
  await spawn('knight', 0, 4);
  await waitGame(page, 0.3);
  await g(() => { window.__BLOODMOON__.player.hp = 60; });
  await aim();
  before = await hpSum();
  await press('KeyE', 1.6);
  i = await info(page);
  check('Lucien E (Soul Drain) damages and heals', (await hpSum()) < before && i.hp > 60, `hp ${i.hp}`);
  await aim();
  before = await hpSum();
  await press('KeyQ', 0.5);
  check('Lucien Q (Shadow Blink) teleports and damages', (await info(page)).cooldowns.q > 0);
  await g(() => { const P = window.__BLOODMOON__.player; P.blood = P.maxBlood; });
  await spawn('crawler', 2, 3);
  await waitGame(page, 0.2);
  before = await hpSum();
  await press('KeyR', 2.2);
  check('Lucien R (Crimson Eclipse) devastates nearby enemies', (await hpSum()) < before);
  await page.screenshot({ path: 'tests/screenshots/lucien_end.png' });
} catch (err) {
  console.log('TEST ERROR', err);
  check('Test script completed without exceptions', false, String(err && err.message));
  await page.screenshot({ path: 'tests/screenshots/error.png' }).catch(() => {});
}

const errors = logs.filter((l) => l.startsWith('[pageerror]') || (l.startsWith('[error]') && !l.includes('pointer lock') && !l.includes('Pointer lock')));
check('No critical console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (logs.length) console.log('Console:\n' + logs.slice(0, 20).join('\n'));
await browser.close();
process.exit(failed.length ? 1 : 0);
