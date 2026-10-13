/**
 * Focused end-game test: boss fight (incl. boss damaging the player), defeat, ending choice,
 * victory screen, save, death & respawn, and every character's abilities.
 */
import { launch, G, info, wait, waitGame } from './harness.mjs';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const { browser, page, logs } = await launch({ width: 1280, height: 720 });
const g = (fn, arg) => G(page, fn, arg);
const overlay = async () => (await info(page)).overlay;
const tp = (x, z, f) => g(([x, z, f]) => window.__BLOODMOON__.debug.teleport(x, z, f), [x, z, f]);
async function finishDialogue(choice = 1) {
  for (let i = 0; i < 40; i++) {
    if ((await overlay()) !== 'dialogue') return true;
    if (await page.locator('.dialogue .dc .btn').count()) await page.keyboard.press('Digit' + choice);
    else await page.keyboard.press('Space');
    await wait(page, 350);
  }
  return false;
}
async function aim() {
  await g(() => { const G = window.__BLOODMOON__; const e = G.enemies.nearest(G.player.pos, 30); if (e) G.cameraRig.yaw = Math.atan2(e.pos.x - G.player.pos.x, e.pos.z - G.player.pos.z) + Math.PI; });
}
async function press(key, s = 0.3) { await page.keyboard.press(key); await waitGame(page, s); }
const spawn = (type, dx, dz) => g(([type, dx, dz]) => { const G = window.__BLOODMOON__; const f = G.player.aimDir(); G.enemies.spawn({ id: 'test_' + Math.random().toString(36).slice(2), type, x: G.player.pos.x + f.x * dz + dx, z: G.player.pos.z + f.z * dz, noSave: true }); }, [type, dx, dz]);
const hpSum = async () => (await info(page)).enemies.filter((e) => e.id.startsWith('test_') && e.d < 16).reduce((s, e) => s + e.hp, 0);

try {
  await page.mouse.click(640, 360);
  await wait(page, 1500);
  await page.click('[data-act="start"]');
  await page.waitForFunction(() => window.__BLOODMOON__.state === 'play', null, { timeout: 90000 });
  // jump the story forward to the altar
  await g(() => {
    const G = window.__BLOODMOON__;
    for (const q of ['m1', 'm2', 'm3', 'm4']) G.quests.state[q].status = 'complete';
    G.quests.state.m5.status = 'active';
    G.quests.state.m5.progress.seal = 1;
    Object.assign(G.flags, { note_read: true, doors_open: true, gate_open: true, seal_broken: true, found_doran: true, found_elise: true, found_marta: true });
    G.world.applyFlags(G.flags);
    G.player.level = 6; G.player.recompute(); G.player.hp = G.player.maxHp;
  });
  await tp(0, -186, Math.PI);
  await waitGame(page, 0.5);
  await tp(0, -199, Math.PI);
  await page.waitForFunction(() => window.__BLOODMOON__.overlay === 'dialogue', null, { timeout: 120000 });
  check('Boss intro dialogue plays', true);
  await finishDialogue(2);
  await waitGame(page, 0.3);
  let i = await info(page);
  check('Fight begins after the dialogue', i.boss && i.boss.state === 'idle', JSON.stringify(i.boss));
  const hp0 = i.hp;
  await waitGame(page, 9);
  i = await info(page);
  check('The Countess attacks and damages the player', i.hp < hp0 || i.overlay === 'death', `hp ${hp0} -> ${i.hp}`);
  await page.screenshot({ path: 'tests/screenshots/boss_fight.png' });
  await g(() => { const G = window.__BLOODMOON__; G.debug.god(true); G.player.hp = G.player.maxHp; if (G.overlay === 'death') G.respawn(); });
  await waitGame(page, 0.5);
  if ((await info(page)).boss) {
    for (let k = 0; k < 120; k++) {
      const b = await g(() => { const G = window.__BLOODMOON__; const b = G.boss; if (!b || !b.alive) return null; G.combat.hit(b, 60, { ability: true }); return { phase: b.phase, state: b.state }; });
      if (!b) break;
      if (b.phase === 2 && !globalThis.__shot) { globalThis.__shot = 1; await waitGame(page, 2.0); await page.screenshot({ path: 'tests/screenshots/boss_phase2.png' }); }
      await waitGame(page, b.state === 'phase' ? 1.5 : 0.1);
    }
  }
  check('Boss defeated through combat damage', (await g(() => window.__BLOODMOON__.flags.boss_defeated)) === true);
  await page.waitForFunction(() => window.__BLOODMOON__.overlay === 'dialogue', null, { timeout: 180000 });
  await page.screenshot({ path: 'tests/screenshots/boss_defeat_dialogue.png' });
  await finishDialogue(1);
  await page.waitForFunction(() => window.__BLOODMOON__.overlay === 'victory', null, { timeout: 60000 }).catch(() => {});
  await wait(page, 1200);
  check('Victory screen shows', (await page.locator('#screen-victory.show').count()) === 1);
  await page.screenshot({ path: 'tests/screenshots/victory.png' });
  const sv = await g(() => JSON.parse(localStorage.getItem('bloodmoon.save.v1')));
  check('Boss completion and ending choice are saved', sv.bossDefeated === true && sv.flags.ending === 'crimson');
  await page.click('#screen-victory [data-act="explore"]');
  await wait(page, 800);
  check('Keep Exploring returns to play', (await overlay()) === null);

  // death & respawn
  await g(() => window.__BLOODMOON__.debug.god(false));
  await tp(0, -170, 0);
  await g(() => { window.__BLOODMOON__.player.hp = 1; });
  await spawn('crawler', 0, 2);
  await page.waitForFunction(() => window.__BLOODMOON__.overlay === 'death', null, { timeout: 120000 }).catch(() => {});
  await wait(page, 1000);
  check('Death screen appears when health reaches zero', (await page.locator('#screen-death.show').count()) === 1);
  await page.screenshot({ path: 'tests/screenshots/death.png' });
  await page.click('#screen-death [data-act="respawn"]');
  await wait(page, 2500);
  i = await info(page);
  check('Respawn at the last shrine with full health', i.overlay === null && i.hp === i.maxHp, `pos ${i.pos}`);

  // Lucien abilities (current character)
  await tp(-2, -30, Math.PI);
  // clear the nave's own enemies so the abilities are measured against the test targets only
  await g(() => window.__BLOODMOON__.debug.killNear(25));
  await g(() => { const G = window.__BLOODMOON__; G.debug.god(true); G.player.blood = G.player.maxBlood; G.player.hp = 60; });
  await spawn('knight', 0, 4);
  await waitGame(page, 0.3);
  await aim();
  let before = await hpSum();
  await press('KeyE', 1.6);
  i = await info(page);
  check('Lucien E (Soul Drain) damages and heals', (await hpSum()) < before && i.hp > 60, `hp ${i.hp}`);
  await aim();
  before = await hpSum();
  const p1 = (await info(page)).pos;
  await press('KeyQ', 0.5);
  const p2 = (await info(page)).pos;
  check('Lucien Q (Shadow Blink) teleports and damages', Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) > 1.5 && (await hpSum()) < before);
  await g(() => { const P = window.__BLOODMOON__.player; P.blood = P.maxBlood; P.stamina = P.maxStamina; });
  await spawn('crawler', 2, 3);
  await waitGame(page, 0.2);
  before = await hpSum();
  await press('KeyR', 2.2);
  check('Lucien R (Crimson Eclipse) devastates nearby enemies', (await hpSum()) < before);
  await spawn('knight', 0, 3);
  await waitGame(page, 0.2);
  await aim();
  before = await hpSum();
  await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
  await waitGame(page, 1.1);
  check('Lucien right click (heavy slash) damages', (await hpSum()) < before);

  // switch to Kairo via the menus
  await g(() => window.__BLOODMOON__.debug.killNear(20));
  await page.keyboard.press('Escape');
  await wait(page, 600);
  await page.click('#screen-pause [data-act="quit"]');
  await wait(page, 500);
  await page.click('.modal [data-act="ok"]');
  await page.waitForFunction(() => window.__BLOODMOON__.state === 'menu', null, { timeout: 30000 });
  await wait(page, 1000);
  await page.click('[data-act="chars"]');
  await wait(page, 600);
  await page.click('[data-char="kairo"]');
  await wait(page, 1200);
  await page.click('.cosmetic[data-cos="eternal"]');
  await wait(page, 1200);
  await page.screenshot({ path: 'tests/screenshots/charselect_kairo_eternal.png' });
  await page.click('#screen-charselect [data-act="confirm"]');
  await wait(page, 600);
  await page.click('[data-act="continue"]');
  await page.waitForFunction(() => window.__BLOODMOON__.state === 'play', null, { timeout: 90000 });
  i = await info(page);
  check('Character + unlocked attire apply to the continued journey', i.char === 'kairo' && (await g(() => window.__BLOODMOON__.player.cosmetic)) === 'eternal');
  await tp(-2, -30, Math.PI);
  await g(() => { const G = window.__BLOODMOON__; G.debug.god(true); G.player.blood = G.player.maxBlood; });
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
  await spawn('knight', 0, 4);
  await waitGame(page, 0.2);
  await aim();
  before = await hpSum();
  await press('KeyR', 1.8);
  check('Kairo R (Celestial Execution) damages its target', (await hpSum()) < before);
  await page.screenshot({ path: 'tests/screenshots/kairo.png' });
} catch (err) {
  console.log('TEST ERROR', err);
  check('Test completed without exceptions', false, String(err.message));
}
const errors = logs.filter((l) => l.startsWith('[pageerror]') || l.startsWith('[error]'));
check('No critical console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
