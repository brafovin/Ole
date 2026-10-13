/**
 * AREA 1 — THE FORGOTTEN CATHEDRAL
 * Interior: x ∈ [-11, 11], z ∈ [-16, 22]. Altar at the south (+z), main doors at the north (-z).
 * East archway → side chapel (Sexton's Key). West cracked wall → secret crypt.
 */
import * as THREE from '../../three.js';
import * as P from '../props.js';
import { boxGeo, roofGeo, cylGeo } from '../builders.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildCathedral(ctx) {
  const { mats, world } = ctx;
  const H = 14;

  // ---------------------------------------------------------------- floor & ceiling
  ctx.floor(0, 3, 24, 40, mats.floor, 0, 3);
  const runner = ctx.M(boxGeo(2.4, 0.02, 27, 2), mats.cloth, 0, 0.01, 1);
  runner.castShadow = false;
  ctx.bake(runner);
  ctx.box(0, H, 3, 24, 0.6, 40, mats.wallDark, 0, { collide: false });
  const roof = ctx.M(roofGeo(42, 25, 8, 3), mats.roof, 0, H + 0.6, 3, 0, Math.PI / 2, 0);
  ctx.bake(roof);

  // ---------------------------------------------------------------- walls
  const T = 1;
  // west wall (secret section at z ∈ [-6.5, -3.5])
  ctx.box(-11.5, 0, -11.25, T, H, 9.5, mats.wall);
  ctx.box(-11.5, 0, 9.25, T, H, 25.5, mats.wall);
  ctx.box(-11.5, 4, -5, T, H - 4, 3, mats.wall);
  // east wall with archway to the side chapel at z ∈ [3, 7]
  ctx.box(11.5, 0, -6.5, T, H, 19, mats.wall);
  ctx.box(11.5, 0, 14.5, T, H, 15, mats.wall);
  ctx.box(11.5, 4.6, 5, T, H - 4.6, 4, mats.wall);
  // north facade with door opening x ∈ [-2.5, 2.5]
  ctx.box(-7, 0, -16.5, 9, H, T, mats.wall);
  ctx.box(7, 0, -16.5, 9, H, T, mats.wall);
  ctx.box(0, 5.6, -16.5, 5, H - 5.6, T, mats.wall);
  // south wall
  ctx.box(0, 0, 22.5, 24, H, T, mats.wall);

  // facade gable, towers and spires (seen from the village)
  const gable = ctx.M(roofGeo(1.2, 24, 8, 2), mats.wall, 0, H, -16.5, 0, Math.PI / 2, 0);
  ctx.bake(gable);
  for (const s of [-1, 1]) {
    ctx.box(s * 14.5, 0, -18, 6, 26, 6, mats.wall);
    const spire = ctx.M(new THREE.ConeGeometry(4.2, 12, 4), mats.roof, s * 14.5, 32, -18, 0, Math.PI / 4, 0);
    ctx.bake(spire);
    for (const yy of [8, 15, 21]) {
      const w = ctx.M(new THREE.PlaneGeometry(1.2, 3), mats.glass[yy % 2], s * 14.5, yy, -21.05, 0, Math.PI, 0);
      w.castShadow = false;
      ctx.bake(w);
    }
    ctx.box(s * 14.5, 26, -18, 6.6, 0.6, 6.6, mats.stone, 0, { collide: false });
  }
  // portal frame + steps
  P.arch(ctx, 0, -17.2, 0, 5.4, 5.4);
  ctx.box(0, 0, -19, 8, 0.12, 3, mats.stone, 0, { collide: false });
  // great round window above the portal (exterior)
  const ext = ctx.M(new THREE.CircleGeometry(2.1, 24), mats.rose, 0, 12, -17.05, 0, Math.PI, 0);
  ext.castShadow = false;
  ctx.bake(ext);

  // ---------------------------------------------------------------- columns, ribs, arcade
  const colZ = [-11, -5, 1, 7, 13];
  for (const z of colZ) {
    for (const s of [-1, 1]) P.column(ctx, s * 6, z, 0.55, 8.5);
    const rib = ctx.M(new THREE.TorusGeometry(6, 0.22, 6, 28, Math.PI), mats.stone, 0, 8.5, z);
    rib.castShadow = false;
    ctx.bake(rib);
  }
  for (let i = 0; i < colZ.length - 1; i++) {
    for (const s of [-1, 1]) {
      const arc = ctx.M(new THREE.TorusGeometry(3, 0.2, 6, 18, Math.PI), mats.stone, s * 6, 8.5, (colZ[i] + colZ[i + 1]) / 2, 0, Math.PI / 2, 0);
      arc.castShadow = false;
      ctx.bake(arc);
    }
  }
  // longitudinal stone beams on top of the arcade
  for (const s of [-1, 1]) ctx.box(s * 6, 11.5, 1, 0.9, 0.7, 26, mats.stone, 0, { collide: false });

  // ---------------------------------------------------------------- pews
  for (let i = 0; i < 11; i++) {
    const z = -12 + i * 2.1;
    if (z > 1.5 && z < 4.6) continue; // space around the floor grate
    for (const s of [-1, 1]) {
      const roll = ctx.rng();
      const broken = roll < 0.12 ? 2 : roll < 0.25 ? 1 : 0;
      P.pew(ctx, s * 3.4 + ctx.r(-0.15, 0.15), z, Math.PI + ctx.r(-0.06, 0.06) + (broken === 2 ? ctx.r(-0.4, 0.4) : 0), broken);
    }
  }
  // floor grate where the crawlers emerge
  const grate = new THREE.Group();
  grate.position.set(0, 0.015, 3);
  grate.add(ctx.M(new THREE.PlaneGeometry(2.2, 2.2).rotateX(-Math.PI / 2), mats.black, 0, 0, 0));
  for (let i = 0; i < 7; i++) grate.add(ctx.M(boxGeo(0.08, 0.06, 2.2, 1), mats.iron, -0.96 + i * 0.32, 0.02, 0));
  ctx.bake(grate);

  // ---------------------------------------------------------------- altar
  ctx.box(0, 0, 18, 14, 0.12, 8, mats.marble, 0, { collide: false });
  ctx.box(0, 0, 14.4, 8, 0.06, 0.8, mats.marble, 0, { collide: false });
  P.altarTable(ctx, 0, 18.5);
  P.candles(ctx, -1.1, 1.37, 18.5, 4, 0.25);
  P.candles(ctx, 1.1, 1.37, 18.5, 4, 0.25);
  world.altarCandleL = P.candelabra(ctx, -3.2, 17.2, 2.2, { group: 'altar' });
  world.altarCandleR = P.candelabra(ctx, 3.2, 17.2, 2.2, { group: 'altar' });
  P.statue(ctx, 0, 21, Math.PI, { wings: true, bleeding: true });
  const rose = ctx.M(new THREE.CircleGeometry(3.6, 32), mats.rose, 0, 9.5, 21.95, 0, Math.PI, 0);
  rose.castShadow = false;
  ctx.bake(rose);
  ctx.light(V(0, 6, 19), 0xb0203a, 2.2, 14, 0.05);
  // blood where the player wakes
  for (const [x, z, s] of [[0.4, 12.6, 1.6], [-0.6, 13.4, 0.9], [1.4, 11.4, 0.5], [0.2, 10.2, 0.4], [-1.5, 7.5, 0.4]]) {
    const b = ctx.M(new THREE.CircleGeometry(s, 16).rotateX(-Math.PI / 2), mats.blood, x, 0.02, z);
    b.castShadow = false;
    ctx.bake(b);
  }
  // blood trail towards the cracked west wall (a hint)
  for (let i = 0; i < 9; i++) {
    const b = ctx.M(new THREE.CircleGeometry(ctx.r(0.12, 0.25), 8).rotateX(-Math.PI / 2), mats.blood, -6.5 - i * 0.55, 0.02, -4.2 - Math.sin(i) * 0.4);
    b.castShadow = false;
    ctx.bake(b);
  }

  // ---------------------------------------------------------------- windows, chandeliers, side aisles
  [-8, -1.5, 10, 16].forEach((z, i) => {
    P.stainedWindow(ctx, -10.95, 6.8, z, Math.PI / 2, 2.4, 6.2, i);
    P.stainedWindow(ctx, 10.95, 6.8, z, -Math.PI / 2, 2.4, 6.2, i + 1);
    ctx.light(V(-8.5, 3, z), i % 2 ? 0x6a2a9a : 0xa01a30, 1.0, 7, 0.02);
    ctx.light(V(8.5, 3, z), i % 2 ? 0xa01a30 : 0x4a3a90, 1.0, 7, 0.02);
  });
  world.chandelierA = P.chandelier(ctx, 0, 9.5, -5);
  world.chandelierB = P.chandelier(ctx, 0, 9.5, 8);
  P.confessional(ctx, -10.2, 9, Math.PI / 2);
  P.confessional(ctx, 10.2, -11, -Math.PI / 2);
  P.statue(ctx, -9.6, -13, Math.PI / 2, { headless: true });
  P.statue(ctx, 9.6, 17, -Math.PI / 2, { bleeding: true });
  P.statue(ctx, -9.6, 17, Math.PI / 2, { wings: true });
  P.candles(ctx, -9.2, 0, 14.2, 6, 0.5, true);
  P.candles(ctx, 9.0, 0, -7.5, 5, 0.45, true);
  P.candles(ctx, -8.8, 0, -9.5, 4, 0.4);
  P.candelabra(ctx, -8.5, 3.5, 1.8, { arms: 3, intensity: 3, group: 'nave' });
  P.candelabra(ctx, 8.5, -3.0, 1.8, { arms: 3, intensity: 3, group: 'nave' });
  for (const z of [-11, 1, 13]) {
    P.banner(ctx, -5.3, 6.5, z, Math.PI / 2, 3.2);
    P.banner(ctx, 5.3, 6.5, z, -Math.PI / 2, 3.2);
  }
  // rubble & debris
  for (let i = 0; i < 10; i++) P.rock(ctx, ctx.r(-10, 10), ctx.r(-15, 20), ctx.r(0.15, 0.4), false);
  P.coffin(ctx, -8.5, -1.5, 0.3, false);
  P.bones(ctx, 7.8, 6.2);
  P.bones(ctx, -7.2, -12.4);
  P.crate(ctx, 9.5, -14.5, 0.9, 0.3);
  P.crate(ctx, 9.6, -13.4, 0.7, -0.2);
  P.barrel(ctx, -9.8, -14.6);

  // ---------------------------------------------------------------- side chapel (east)
  ctx.floor(15.5, 5, 7, 9, mats.floor, 0.005, 3);
  ctx.box(19.5, 0, 5, 1, 6.5, 10, mats.wall);
  ctx.box(15.5, 0, 0.5, 9, 6.5, 1, mats.wall);
  ctx.box(15.5, 0, 9.5, 9, 6.5, 1, mats.wall);
  ctx.box(15.5, 6.5, 5, 9, 0.5, 10, mats.wallDark, 0, { collide: false });
  ctx.box(18.4, 0, 5, 1.2, 1.1, 2.4, mats.marble);
  P.statue(ctx, 18.6, 8.2, -Math.PI / 2 - 0.4, { bleeding: true });
  P.candles(ctx, 18.4, 1.1, 4.4, 5, 0.3, true);
  P.candles(ctx, 13, 0, 1.4, 4, 0.3);
  P.stainedWindow(ctx, 18.95, 3.6, 2.4, -Math.PI / 2, 1.4, 3.2, 1);
  P.bones(ctx, 16.6, 6.4);
  // the Sexton's body
  const sexton = new THREE.Group();
  sexton.position.set(16.2, 0, 5.4);
  sexton.add(ctx.M(boxGeo(0.6, 0.25, 1.6, 1), mats.clothDark, 0, 0.12, 0, 0, 0.4, 0));
  sexton.add(ctx.M(new THREE.SphereGeometry(0.14, 8, 6), mats.bone, 0.3, 0.14, 0.7));
  sexton.add(ctx.M(new THREE.CircleGeometry(0.9, 16).rotateX(-Math.PI / 2), mats.blood, 0.1, 0.01, -0.1));
  ctx.bake(sexton);

  // ---------------------------------------------------------------- secret crypt (west)
  ctx.floor(-15.5, -5, 7, 11, mats.floor, 0.005, 3);
  ctx.box(-19.5, 0, -5, 1, 5.5, 12, mats.wall);
  ctx.box(-15.5, 0, -10.5, 9, 5.5, 1, mats.wall);
  ctx.box(-15.5, 0, 0.5, 9, 5.5, 1, mats.wall);
  ctx.box(-15.5, 5.5, -5, 9, 0.5, 12, mats.wallDark, 0, { collide: false });
  P.coffin(ctx, -17.6, -8.3, Math.PI / 2, true);
  P.coffin(ctx, -17.6, -5, Math.PI / 2, true);
  P.coffin(ctx, -17.6, -1.6, Math.PI / 2, false);
  P.candles(ctx, -13, -9.4, 5, 0.4, false);
  P.candles(ctx, -18.6, -3.3, 0, 4, 0.2);
  ctx.light(V(-15, 2.4, -5), 0xc01828, 2.6, 9, 0.6);
  P.bones(ctx, -14, -2);
  P.bones(ctx, -16, -9);
  // the royal sarcophagus
  P.gravestone(ctx, -14.5, -5.5, Math.PI / 2, 2);

  // cracked wall (dynamic; crumbles when examined)
  const cracked = new THREE.Group();
  cracked.position.set(-11.5, 0, -5);
  cracked.add(ctx.M(boxGeo(1, 4, 3, 2), mats.wall, 0, 2, 0));
  const glowCrack = new THREE.MeshBasicMaterial({ color: 0xff1a2a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (let i = 0; i < 5; i++) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(0.05, ctx.r(0.6, 1.4)), glowCrack);
    c.position.set(0.51, ctx.r(0.6, 3.2), ctx.r(-1.2, 1.2));
    c.rotation.set(0, Math.PI / 2, ctx.r(-0.8, 0.8));
    cracked.add(c);
  }
  ctx.add(cracked);
  const crackedCol = ctx.col.addBox(-11.5, -5, 0.5, 1.5, 0, { height: 4 });
  world.stateful.push({
    sync(flags) {
      cracked.visible = !flags.crypt_open;
      crackedCol.enabled = !flags.crypt_open;
    },
  });

  // ---------------------------------------------------------------- doors, shrine
  const doors = P.doubleDoor(ctx, 0, -16.5, 5, 5.6, 0);
  world.doors.cathedral = doors;
  world.stateful.push({ sync: (f) => (f.doors_open ? doors.open(true) : doors.close()) });
  world.addShrine('cathedral', ctx, -5, 16.2, { name: 'Altar of Waking', spawn: V(-3.5, 0, 14.5), facing: Math.PI });

  // ---------------------------------------------------------------- points of interest
  world.points.note = V(0, 1.4, 18.3);
  world.points.key = V(16.2, 0.5, 5.4);
  world.points.doors = V(0, 1.5, -15.5);
  world.startPos = V(0, 0, 12.6);
  world.startFacing = 0;

  // ---------------------------------------------------------------- interactables
  const note = P.pickupMesh(ctx, 0, 1.45, 18.3, 'note');
  world.stateful.push({ sync: (f) => (note.visible = !f.note_read) });
  world.interact({
    id: 'note_altar', pos: V(0, 1, 18.0), radius: 2.6,
    prompt: 'Read the bloodstained note',
    visible: (g) => !g.flags.note_read,
    use: (g) => {
      g.flags.note_read = true;
      note.visible = false;
      g.readNote('altar', () => g.events.startTutorial());
    },
  });
  world.interact({
    id: 'sexton', pos: V(16.2, 0.5, 5.4), radius: 2.4,
    prompt: "Search the Sexton's body",
    visible: (g) => !g.flags.sexton_searched,
    use: (g) => {
      g.flags.sexton_searched = true;
      g.inventory.add('sextonKey', 1);
      g.quests.progress('m1', 'key');
      g.readNote('sexton');
    },
  });
  world.interact({
    id: 'cath_doors', pos: V(0, 1, -15.4), radius: 3,
    prompt: (g) => (g.inventory.has('sextonKey') ? 'Unlock the cathedral doors' : 'The doors are locked'),
    visible: (g) => !g.flags.doors_open,
    use: (g) => {
      if (!g.inventory.has('sextonKey')) {
        g.ui.toast('Locked. The Sexton kept the key… search the side chapel.', 'warn');
        g.audio.play('locked');
        return;
      }
      g.flags.doors_open = true;
      doors.open();
      g.audio.play('doorOpen');
      g.quests.progress('m1', 'doors');
      g.shake(0.2);
    },
  });
  world.interact({
    id: 'cracked_wall', pos: V(-10.6, 1.2, -5), radius: 2.4,
    prompt: 'Examine the cracked wall',
    visible: (g) => !g.flags.crypt_open,
    use: (g) => {
      g.flags.crypt_open = true;
      cracked.visible = false;
      crackedCol.enabled = false;
      g.audio.play('altarBreak');
      g.particles.dark.burst(V(-11.2, 2, -5), 50, { color: 0x3a3438, size: 0.5, speed: 4, life: 1.2, gravity: -6 });
      g.shake(0.35);
      g.quests.progress('s3', 'rooms');
      g.ui.toast('Secret discovered: The Royal Crypt', 'secret');
      g.events.fire('crypt');
    },
  });
  world.interact({
    id: 'crypt_sarcophagus', pos: V(-14.5, 1, -5.5), radius: 2.2,
    prompt: 'Read the sarcophagus inscription',
    visible: (g) => g.flags.crypt_open,
    use: (g) => g.readNote('sarcophagus'),
  });
  world.interact({
    id: 'chapel_lectern', pos: V(13.2, 1, 7.6), radius: 2,
    prompt: 'Read the open prayer book',
    use: (g) => g.readNote('prayerbook'),
  });
  const lectern = new THREE.Group();
  lectern.position.set(13.2, 0, 7.8);
  lectern.add(ctx.M(cylGeo(0.08, 0.12, 1.1, 6), mats.darkwood, 0, 0.55, 0));
  lectern.add(ctx.M(boxGeo(0.6, 0.05, 0.45, 1), mats.darkwood, 0, 1.15, 0, -0.4, 0, 0));
  lectern.add(ctx.M(boxGeo(0.5, 0.02, 0.38, 1), mats.paper, 0, 1.19, 0.01, -0.4, 0, 0));
  ctx.bake(lectern);
  ctx.col.addCircle(13.2, 7.8, 0.3, { height: 1.2, camera: false });

  world.pickup({ id: 'c_vial1', kind: 'vial', item: 'vial', pos: V(-8.8, 0.5, 4.2) });
  world.pickup({ id: 'c_vial2', kind: 'vial', item: 'vial', pos: V(17.2, 0.5, 2.2) });
  world.pickup({ id: 'c_relic', kind: 'relic', item: 'treatyShard', pos: V(-17.8, 1.0, -5), hidden: true });
  world.pickup({ id: 'c_record', kind: 'record', item: 'record1', pos: V(-13.4, 0.6, -1.2) });
  world.pickup({ id: 'c_vial3', kind: 'vial', item: 'vial', pos: V(-18.4, 0.5, -9.4) });

  // ---------------------------------------------------------------- enemies
  for (let i = 0; i < 3; i++) world.spawn({ id: 'tut_crawler' + i, type: 'crawler', x: -0.8 + i * 0.8, z: 3 + (i - 1) * 0.5, trigger: 'tutorial', tag: 'tutorial', emerge: true });
  world.spawn({ id: 'crypt_crawler', type: 'crawler', x: -16, z: -3, trigger: 'crypt', emerge: true });
  world.spawn({ id: 'crypt_crawler2', type: 'crawler', x: -15, z: -8, trigger: 'crypt', emerge: true });

  // ---------------------------------------------------------------- triggers (horror beats)
  world.trigger({
    id: 'cath_candles', x: 0, z: -4, r: 5, when: (g) => g.flags.note_read && g.quests.isDone('m1', 'crawlers'),
    enter: (g) => g.horror.candlesOut(),
  });
  world.trigger({
    id: 'cath_whisper', x: -9, z: -5, r: 3.5,
    enter: (g) => g.horror.whisper(V(-12, 2, -5), '…beneath the stone… they buried her heart…'),
  });
}
