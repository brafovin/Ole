/**
 * AREA 2 — THE ASHEN VILLAGE
 * Main street runs north (x ∈ [-4.5, 4.5]) from the cathedral (z = -17) to the North Gate (z = -92).
 * West houses face east (ry = π/2), east houses face west (ry = -π/2). Backyards behind them.
 */
import * as THREE from '../../three.js';
import * as P from '../props.js';
import { boxGeo, cylGeo } from '../builders.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const W_RY = Math.PI / 2, E_RY = -Math.PI / 2;

function singleDoor(ctx, pos, ry, w = 1.6, h = 2.5) {
  const root = new THREE.Group();
  root.position.copy(pos);
  root.rotation.y = ry;
  const hinge = new THREE.Group();
  hinge.position.set(-w / 2, 0, 0);
  hinge.add(ctx.M(boxGeo(w, h, 0.12, 1), ctx.mats.darkwood, w / 2, h / 2, 0));
  hinge.add(ctx.M(boxGeo(w - 0.1, 0.1, 0.16, 1), ctx.mats.iron, w / 2, h * 0.3, 0));
  hinge.add(ctx.M(boxGeo(w - 0.1, 0.1, 0.16, 1), ctx.mats.iron, w / 2, h * 0.75, 0));
  root.add(hinge);
  ctx.add(root);
  const col = ctx.colliderLocal(root, 0, 0, w / 2, 0.12, 0, { height: h });
  const s = {
    opened: false, anim: null,
    open(instant) { s.opened = true; col.enabled = false; if (instant) hinge.rotation.y = -1.7; else s.anim = 0; },
    close() { s.opened = false; col.enabled = true; hinge.rotation.y = 0; s.anim = null; },
    update(dt) {
      if (s.anim === null) return;
      s.anim = Math.min(1, s.anim + dt / 1.2);
      hinge.rotation.y = -1.7 * (1 - Math.pow(1 - s.anim, 3));
      if (s.anim >= 1) s.anim = null;
    },
  };
  return s;
}

export function buildVillage(ctx) {
  const { mats, world } = ctx;

  // ---------------------------------------------------------------- ground
  ctx.floor(0, -56, 64, 80, mats.dirt, 0, 5);
  ctx.floor(0, -55, 9.5, 76, mats.cobble, 0.012, 3.5);
  ctx.floor(0, -60, 20, 16, mats.cobble, 0.01, 3.5);
  ctx.floor(0, -21.5, 22, 9, mats.cobble, 0.011, 3.5);

  // ---------------------------------------------------------------- boundaries
  const wall = (x, z, w, d, h = 3.2) => ctx.box(x, 0, z, w, h, d, mats.wall, 0, { tile: 2.5 });
  wall(-30.5, -55, 1, 78);
  wall(30.5, -55, 1, 78);
  wall(-24, -16.5, 13, 1);
  wall(24, -16.5, 13, 1);
  // town wall + gate towers
  wall(-17, -92.5, 27, 1.4, 5);
  wall(17, -92.5, 27, 1.4, 5);
  for (const s of [-1, 1]) {
    ctx.box(s * 4.6, 0, -92.5, 2.6, 8, 2.6, mats.wall);
    const cap = ctx.M(new THREE.ConeGeometry(2.2, 3, 4), mats.roof, s * 4.6, 9.5, -92.5, 0, Math.PI / 4, 0);
    ctx.bake(cap);
    P.brazier(ctx, s * 4.6, -90.2, 0xff5a20);
  }
  ctx.box(0, 6, -92.5, 6.6, 2, 2.2, mats.wall, 0, { collide: false });
  const gate = P.portcullis(ctx, 0, -92.5, 6.6, 6, 0);
  world.doors.northGate = gate;
  world.stateful.push({ sync: (f) => (f.gate_open ? gate.open(true) : gate.close()) });
  world.points.gate = V(0, 1.5, -91);

  // churchyard
  ctx.rng = ctx.rng; // keep deterministic sequence
  for (let i = 0; i < 14; i++) {
    const s = i % 2 ? 1 : -1;
    P.gravestone(ctx, s * ctx.r(8, 20), ctx.r(-27, -22.5), ctx.r(-0.3, 0.3), Math.floor(ctx.r(0, 2.99)));
  }
  P.fence(ctx, -6.5, -27.5, -21, -27.5);
  P.fence(ctx, 6.5, -27.5, 21, -27.5);
  P.fence(ctx, -6.5, -27.5, -6.5, -21);
  P.fence(ctx, 6.5, -27.5, 6.5, -21);
  P.statue(ctx, -13, -24.5, 0, { wings: true, headless: true });
  P.statue(ctx, 13, -24.5, 0, { wings: true });

  // ---------------------------------------------------------------- houses
  // West
  const smithyG = P.smithy(ctx, -10.5, -36, W_RY);
  void smithyG;
  P.house(ctx, { x: -10.5, z: -47, w: 8, d: 7, h: 4.8, ry: W_RY });
  const mayor = P.house(ctx, { x: -11, z: -60, w: 9, d: 8, h: 4.8, ry: W_RY, enterable: true });
  P.house(ctx, { x: -10.5, z: -74, w: 7, d: 7, h: 4.4, ry: W_RY });
  P.house(ctx, { x: -10, z: -85, w: 6, d: 6, h: 4.2, ry: W_RY, lit: true });
  // East
  const chapel = P.house(ctx, { x: 10.5, z: -38, w: 8, d: 7, h: 4.8, ry: E_RY, enterable: true, lit: true });
  P.house(ctx, { x: 10.5, z: -49, w: 7, d: 7, h: 4.6, ry: E_RY });
  P.house(ctx, { x: 11, z: -62, w: 8, d: 8, h: 4.8, ry: E_RY, ruined: true });
  P.house(ctx, { x: 10.5, z: -75, w: 8, d: 7, h: 4.8, ry: E_RY });
  P.house(ctx, { x: 10, z: -86, w: 6, d: 6, h: 4.2, ry: E_RY });

  // locked doors with environmental storytelling
  const lockedLines = {
    w2: 'Barred from inside. A voice whispers: "Go away… it knows your scent."',
    w4: 'Locked. Scratches cover the door — from the inside.',
    w5: 'Locked. Candlelight flickers behind the shutters, but no one answers.',
    e2: 'Locked. Someone has painted a red crescent on the door.',
    e4: 'The door will not budge. Something heavy has been pushed against it.',
    e5: 'Locked. You hear slow breathing on the other side… then silence.',
  };
  const lockedDoors = [['w2', V(-6.1, 1.2, -47)], ['w4', V(-6.1, 1.2, -74)], ['w5', V(-6.1, 1.2, -85)], ['e2', V(6.1, 1.2, -49)], ['e4', V(6.1, 1.2, -75)], ['e5', V(6.1, 1.2, -86)]];
  for (const [id, pos] of lockedDoors) {
    world.interact({
      id: 'locked_' + id, pos, radius: 2, prompt: 'Try the door',
      use: (g) => {
        g.audio.play('locked');
        g.ui.toast(lockedLines[id], 'info');
        if (id === 'e5' && !g.flags.e5_scare) {
          g.flags.e5_scare = true;
          g.audio.play('creak', { pos });
          g.horror.whisper(pos, '…don\'t let it in… don\'t let it in…');
        }
      },
    });
  }

  // ---------------------------------------------------------------- street furniture
  [[-5.4, -25, 0], [5.4, -33, 0], [-5.4, -43, 1], [5.4, -54, 0], [-5.4, -66, 2], [5.4, -77, 1], [-5.4, -87, 0]].forEach(([x, z, k]) => {
    const a = P.lamp(ctx, x, z, k === 1, k === 2);
    if (a && a.mesh) world.lampMeshes.push(a);
  });
  P.well(ctx, 0, -60);
  P.noticeBoard(ctx, 6.6, -55, E_RY);
  P.cart(ctx, -3.2, -50.5, 0.3);
  P.cart(ctx, 2.8, -81, -0.5);
  P.barrel(ctx, -6.3, -41);
  P.barrel(ctx, -6.6, -40.2, 0, true);
  P.barrel(ctx, 6.4, -44.2);
  P.crate(ctx, 6.4, -45.4, 0.8, 0.2);
  P.crate(ctx, -6.4, -78.5, 0.9, 0.4);
  P.crate(ctx, -6.4, -79.6, 0.7, -0.3);
  P.crate(ctx, -6.4, -79.1, 0.6, 0.6, 0.7);
  P.barrel(ctx, 6.6, -68.6);
  for (let i = 0; i < 8; i++) P.rock(ctx, ctx.r(-25, 25), ctx.r(-90, -30), ctx.r(0.15, 0.35), false);

  // gallows in the square
  const gal = new THREE.Group();
  gal.position.set(-7.2, 0, -57);
  gal.add(ctx.M(boxGeo(2.6, 0.9, 2.6, 1.5), mats.darkwood, 0, 0.45, 0));
  gal.add(ctx.M(boxGeo(0.2, 4.6, 0.2, 1), mats.darkwood, -1, 2.3, 0));
  gal.add(ctx.M(boxGeo(1.9, 0.18, 0.18, 1), mats.darkwood, -0.15, 4.55, 0));
  gal.add(ctx.M(boxGeo(0.12, 0.9, 0.12, 1), mats.darkwood, -0.6, 3.95, 0, 0, 0, 0.8));
  gal.add(ctx.M(cylGeo(0.02, 0.02, 1.3, 4), mats.cloth, 0.6, 3.85, 0));
  gal.add(ctx.M(new THREE.TorusGeometry(0.13, 0.025, 4, 10), mats.cloth, 0.6, 3.1, 0));
  ctx.bake(gal);
  ctx.col.addBox(-7.2, -57, 1.3, 1.3, 0, { height: 0.9, camera: false });
  ctx.col.addCircle(-8.2, -57, 0.15, { height: 4.6, camera: false });

  // banners on the gate towers
  P.banner(ctx, -4.6, 5, -91.15, 0, 3.4);
  P.banner(ctx, 4.6, 5, -91.15, 0, 3.4);

  // ---------------------------------------------------------------- backyards
  // west: courier corpse with the Mayor's key, guarded by a Hollow Knight
  P.fence(ctx, -14.5, -66, -29.5, -66, { wood: true, broken: true, h: 1.3 });
  P.fence(ctx, -14.5, -52, -29.5, -52, { wood: true, broken: true, h: 1.3 });
  P.cart(ctx, -24, -68.5, 1.2);
  P.bones(ctx, -22.2, -67.2);
  const courier = new THREE.Group();
  courier.position.set(-22.4, 0, -69.4);
  courier.add(ctx.M(boxGeo(0.55, 0.22, 1.5, 1), mats.clothDark, 0, 0.11, 0, 0, 1.1, 0));
  courier.add(ctx.M(new THREE.CircleGeometry(0.8, 14).rotateX(-Math.PI / 2), mats.blood, 0, 0.012, 0));
  ctx.bake(courier);
  for (let i = 0; i < 6; i++) P.crate(ctx, -27 + (i % 3) * 0.95, -48 - Math.floor(i / 3) * 0.95, 0.85, ctx.r(-0.2, 0.2), 0);
  P.crate(ctx, -26.1, -48.4, 0.7, 0.4, 0.85);
  P.barrel(ctx, -24.2, -45);
  P.barrel(ctx, -23.3, -45.6, 0, true);
  P.log(ctx, -20, -83, 0.2, 5);
  P.log(ctx, -20.5, -84.2, 0.15, 4.6);
  // east: cursed altar and a ruined graveyard
  const altar1 = P.cursedAltar(ctx, 22.5, -73);
  world.altars.v1 = altar1;
  for (let i = 0; i < 7; i++) P.gravestone(ctx, ctx.r(17, 28), ctx.r(-88, -78), ctx.r(-0.4, 0.4), Math.floor(ctx.r(0, 2.99)));
  P.fence(ctx, 14.5, -67.5, 29.5, -67.5, { broken: true });
  P.barrel(ctx, 18, -44);
  P.crate(ctx, 19, -43.5, 0.9, 0.5);
  P.well(ctx, 22, -50);

  // dead trees in the yards (instanced later by World)
  for (const [x, z] of [[-25, -30], [-20, -40], [-26, -58], [-18, -88], [24, -32], [26, -56], [20, -90], [27, -84], [-27, -76], [17, -28]]) world.treeAt(x, z, ctx.r(0.8, 1.2));

  // ---------------------------------------------------------------- chapel house (safe haven)
  const chapelDoor = singleDoor(ctx, V(7, 0, -38), E_RY);
  chapelDoor.open(true);
  world.animated.push(chapelDoor);
  // interior: small altar, candles, bed, table
  const cin = new THREE.Group();
  cin.position.set(10.5, 0, -38);
  cin.rotation.y = E_RY;
  cin.add(ctx.M(boxGeo(1.6, 1.0, 0.7, 1), mats.marble, 0, 0.5, -3.0));
  cin.add(ctx.M(boxGeo(1.4, 0.5, 2.2, 1), mats.darkwood, -2.6, 0.25, -1.6));
  cin.add(ctx.M(boxGeo(1.3, 0.12, 2.0, 1), mats.cloth, -2.6, 0.55, -1.6));
  cin.add(ctx.M(boxGeo(1.4, 0.8, 0.9, 1), mats.wood, 2.4, 0.4, -2.6));
  ctx.bake(cin);
  ctx.colliderLocal(cin, 0, -3.0, 0.8, 0.35, 0, { height: 1 });
  ctx.colliderLocal(cin, -2.6, -1.6, 0.7, 1.1, 0, { height: 0.6, camera: false });
  ctx.colliderLocal(cin, 2.4, -2.6, 0.7, 0.45, 0, { height: 0.8, camera: false });
  const cl = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyMatrix4(cin.matrixWorld);
  cin.updateMatrixWorld(true);
  const ca = cl(0, -3.0);
  P.candles(ctx, ca.x, 1.0, ca.z, 6, 0.35);
  const cb = cl(2.4, -2.6);
  P.candles(ctx, cb.x, 0.8, cb.z, 3, 0.2);
  ctx.light(V(ca.x, 2.2, ca.z), 0xffb070, 4, 10, 0.4);
  world.addShrine('village', ctx, cl(2.2, 1.0).x, cl(2.2, 1.0).z, { name: 'Chapel House', spawn: cl(0.5, 2.4), facing: Math.PI / 2, safe: true });
  world.safeZones.push({ x: 10.5, z: -38, r: 4.5 });

  // ---------------------------------------------------------------- mayor's house (locked, secret room)
  const mayorDoor = singleDoor(ctx, V(-7, 0, -60), W_RY);
  world.animated.push(mayorDoor);
  world.stateful.push({ sync: (f) => (f.mayor_open ? mayorDoor.open(true) : mayorDoor.close()) });
  // partition with a gap hidden by a bookshelf
  ctx.box(-12.5, 0, -62.5, 0.3, 4.75, 3.4, mats.plaster);
  ctx.box(-12.5, 0, -57.5, 0.3, 4.75, 3.4, mats.plaster);
  ctx.box(-12.5, 2.4, -60, 0.3, 2.35, 1.6, mats.plaster, 0, { collide: false });
  const shelf = new THREE.Group();
  shelf.position.set(-12.1, 0, -60);
  shelf.add(ctx.M(boxGeo(0.45, 2.3, 1.75, 1), mats.darkwood, 0, 1.15, 0));
  const bookCols = [mats.cloth, mats.clothDark, mats.paper];
  for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) {
    shelf.add(ctx.M(boxGeo(0.25, ctx.r(0.28, 0.4), 0.18, 1), bookCols[(r + i) % 3], 0.12, 0.35 + r * 0.55, -0.7 + i * 0.27, 0, 0, ctx.r(-0.1, 0.1)));
  }
  ctx.add(shelf);
  const shelfCol = ctx.col.addBox(-12.1, -60, 0.25, 0.9, 0, { height: 2.3 });
  world.stateful.push({
    sync(f) {
      shelf.position.z = f.shelf_moved ? -58.2 : -60;
      shelfCol.enabled = !f.shelf_moved;
    },
  });
  // mayor's study
  const desk = new THREE.Group();
  desk.position.set(-9, 0, -62.8);
  desk.add(ctx.M(boxGeo(1.8, 0.1, 0.9, 1), mats.darkwood, 0, 0.85, 0));
  for (const [sx, sz] of [[-0.8, -0.35], [0.8, -0.35], [-0.8, 0.35], [0.8, 0.35]]) desk.add(ctx.M(boxGeo(0.08, 0.85, 0.08, 1), mats.darkwood, sx, 0.42, sz));
  desk.add(ctx.M(boxGeo(0.5, 0.06, 0.38, 1), mats.paper, 0.1, 0.92, 0));
  ctx.bake(desk);
  ctx.col.addBox(-9, -62.8, 0.9, 0.45, 0, { height: 0.9, camera: false });
  P.candles(ctx, -9.6, 0.9, -62.9, 2, 0.1);
  ctx.light(V(-9.5, 2, -62), 0xffa060, 2.6, 8, 0.6);
  P.crate(ctx, -8, -56.6, 0.8, 0.3);
  // secret room contents
  P.candles(ctx, -14, 0, -63.5, 4, 0.3);
  ctx.light(V(-13.8, 1.8, -60), 0xc02040, 2.2, 6, 0.6);
  P.bones(ctx, -13.8, -57.2);
  world.pickup({ id: 'v_relic', kind: 'relic', item: 'coin', pos: V(-14.2, 0.9, -60), hidden: true });
  world.pickup({ id: 'v_vial_secret', kind: 'vial', item: 'vial', pos: V(-13.6, 0.5, -62.6) });

  world.interact({
    id: 'mayor_door', pos: V(-6.3, 1.2, -60), radius: 2.2,
    prompt: (g) => (g.inventory.has('mayorKey') ? "Unlock the Mayor's house" : "The Mayor's house is locked"),
    visible: (g) => !g.flags.mayor_open,
    use: (g) => {
      if (!g.inventory.has('mayorKey')) {
        g.audio.play('locked');
        g.ui.toast('Locked. A brass plaque reads "Mayor Halden". Perhaps someone carried the key…', 'warn');
        return;
      }
      g.flags.mayor_open = true;
      mayorDoor.open();
      g.audio.play('doorOpen');
    },
  });
  world.interact({
    id: 'ledger', pos: V(-9, 1, -62.2), radius: 2,
    prompt: 'Read the blood-stained ledger',
    use: (g) => {
      g.readNote('ledger');
      if (!g.flags.clue_ledger) {
        g.flags.clue_ledger = true;
        g.inventory.add('ledger', 1, true);
        g.quests.progress('m3', 'clues');
        world.points.ledger = null;
      }
    },
  });
  world.points.ledger = V(-9, 1, -62.2);
  world.interact({
    id: 'bookshelf', pos: V(-11.4, 1.2, -60), radius: 2,
    prompt: 'Inspect the bookshelf',
    visible: (g) => !g.flags.shelf_moved,
    use: (g) => {
      g.flags.shelf_moved = true;
      g.tasks.run({ dur: 1.2, update: (k) => (shelf.position.z = -60 + 1.8 * k) });
      shelfCol.enabled = false;
      g.audio.play('creak');
      g.ui.toast('Secret discovered: The Mayor\'s Hidden Room', 'secret');
      g.quests.progress('s3', 'rooms');
    },
  });
  void mayor;
  void chapel;

  // ---------------------------------------------------------------- notice board (clue 1)
  world.points.decree = V(6.2, 1.5, -55);
  world.interact({
    id: 'decree', pos: V(5.8, 1.4, -55), radius: 2.2,
    prompt: 'Read the Royal Decree',
    use: (g) => {
      g.readNote('decree');
      if (!g.flags.clue_decree) {
        g.flags.clue_decree = true;
        g.inventory.add('decree', 1, true);
        g.quests.progress('m3', 'clues');
        world.points.decree = null;
      }
    },
  });

  // ---------------------------------------------------------------- courier (Mayor's key)
  world.interact({
    id: 'courier', pos: V(-22.4, 0.5, -69.4), radius: 2.2,
    prompt: 'Search the dead courier',
    visible: (g) => !g.flags.courier_searched,
    use: (g) => {
      g.flags.courier_searched = true;
      g.inventory.add('mayorKey', 1);
      g.inventory.add('vial', 1);
      g.readNote('courier');
    },
  });

  // ---------------------------------------------------------------- survivors
  const doran = world.npc({ id: 'doran', spec: 'doran', x: -12.2, z: -38.6, facing: Math.PI / 2, anim: 'cower' });
  P.crate(ctx, -10.5, -38.3, 0.9, 0.2);
  P.crate(ctx, -10.5, -39.25, 0.9, -0.1);
  P.crate(ctx, -10.5, -38.8, 0.7, 0.3, 0.9);
  world.points.doran = V(-12.2, 1, -38.6);
  world.interact({
    id: 'doran', pos: V(-11.2, 1, -38.6), radius: 2.8,
    prompt: (g) => (g.flags.found_doran ? 'Talk to Doran' : 'Someone is hiding behind the crates'),
    use: (g) => {
      if (!g.flags.cleared_forge) {
        g.ui.toast('"Not while those things are out there! Kill them first!"', 'warn');
        return;
      }
      if (!g.flags.found_doran) {
        g.dialogue.start('doran', () => {
          g.flags.found_doran = true;
          world.points.doran = null;
          doran.setAnim(null);
          g.quests.progress('m2', 'survivors');
        });
      } else g.dialogue.start('doran_again');
    },
  });
  world.stateful.push({ sync: (f) => doran.setAnim(f.found_doran ? null : 'cower') });

  const elise = world.npc({ id: 'elise', spec: 'elise', x: 11.9, z: -38, facing: Math.PI / 2, anim: 'kneel' });
  world.points.elise = V(11.9, 1, -38);
  world.interact({
    id: 'elise', pos: V(11.0, 1, -38), radius: 2.4,
    prompt: (g) => (g.flags.found_elise ? 'Talk to Sister Elise' : 'Approach the praying nun'),
    use: (g) => {
      if (!g.flags.found_elise) {
        g.dialogue.start('elise', () => {
          g.flags.found_elise = true;
          world.points.elise = null;
          elise.setAnim(null);
          g.quests.progress('m2', 'survivors');
        });
      } else g.dialogue.start('elise_again');
    },
  });
  world.stateful.push({ sync: (f) => elise.setAnim(f.found_elise ? null : 'kneel') });

  const cageObj = P.cage(ctx, 3.2, -70.5);
  const marta = world.npc({ id: 'marta', spec: 'marta', x: 3.2, z: -70.5, facing: Math.PI / 2, anim: 'cower' });
  world.points.marta = V(3.2, 1, -70.5);
  world.interact({
    id: 'marta', pos: V(3.2, 1, -69.0), radius: 2.8,
    prompt: (g) => (g.flags.found_marta ? 'Talk to Old Marta' : 'Free the prisoner'),
    use: (g) => {
      if (!g.flags.cleared_cage) {
        g.ui.toast('The cage is guarded. Defeat the guards first.', 'warn');
        return;
      }
      if (!g.flags.found_marta) {
        cageObj.open();
        g.audio.play('gate');
        g.dialogue.start('marta', () => {
          g.flags.found_marta = true;
          world.points.marta = null;
          marta.setAnim(null);
          g.quests.progress('m2', 'survivors');
        });
      } else g.dialogue.start('marta_again');
    },
  });
  world.stateful.push({
    sync: (f) => {
      if (f.found_marta) { cageObj.open(); marta.setAnim(null); } else { cageObj.close(); marta.setAnim('cower'); }
    },
  });

  // gate
  world.interact({
    id: 'north_gate', pos: V(0, 1.2, -90.6), radius: 2.6,
    prompt: 'Examine the North Gate',
    visible: (g) => !g.flags.gate_open,
    use: (g) => {
      g.audio.play('locked');
      g.ui.toast('The portcullis is lowered. The survivors may know how to raise it.', 'warn');
    },
  });

  // ---------------------------------------------------------------- cursed altar 1
  world.interact({
    id: 'altar_v1', pos: V(22.5, 1, -71.4), radius: 2.6,
    prompt: 'Destroy the cursed altar',
    visible: (g) => !g.flags.altar_v1,
    use: (g) => g.events.destroyAltar('v1', altar1, V(22.5, 0, -73)),
  });
  world.stateful.push({ sync: (f) => (f.altar_v1 ? altar1.destroy() : altar1.restore()) });

  // ---------------------------------------------------------------- pickups
  world.pickup({ id: 'v_record2', kind: 'record', item: 'record2', pos: V(-25.5, 0.6, -44.5) });
  world.pickup({ id: 'v_record3', kind: 'record', item: 'record3', pos: V(12.5, 0.6, -63.5) });
  world.pickup({ id: 'v_vial1', kind: 'vial', item: 'vial', pos: V(-27.5, 0.5, -50.5) });
  world.pickup({ id: 'v_vial2', kind: 'vial', item: 'vial', pos: V(26.5, 0.5, -60.5) });
  world.pickup({ id: 'v_vial3', kind: 'vial', item: 'vial', pos: V(-2.5, 0.5, -88.5) });

  // ---------------------------------------------------------------- enemies
  const S = (id, type, x, z, group, extra = {}) => world.spawn({ id, type, x, z, group, ...extra });
  S('v_street1', 'crawler', 1.5, -45, 'street');
  S('v_street2', 'crawler', -1.8, -47.5, 'street');
  S('v_forge1', 'crawler', -6.8, -35, 'forge');
  S('v_forge2', 'crawler', -7.5, -38, 'forge');
  S('v_forge3', 'crawler', -6, -32.4, 'forge');
  S('v_knightW', 'knight', -21, -63, 'yardW', { facing: Math.PI });
  S('v_cageK', 'knight', -1.5, -68, 'cage');
  S('v_cageM', 'mage', 5.5, -75, 'cage');
  S('v_cageC1', 'crawler', 1.5, -65.5, 'cage');
  S('v_cageC2', 'crawler', 6.2, -66.5, 'cage');
  S('v_burned1', 'crawler', 11.5, -61, 'burned');
  S('v_burned2', 'crawler', 12.5, -64, 'burned');
  S('v_stalker', 'stalker', 15.5, -55.2, 'alleyE');
  S('v_altarC1', 'crawler', 20.5, -70, 'altarV');
  S('v_altarC2', 'crawler', 24.5, -71, 'altarV');
  S('v_gateM', 'mage', 2, -86.5, 'gate');
  S('v_yardStalker', 'stalker', -25, -80, 'yardNW');
  for (let i = 0; i < 2; i++) world.spawn({ id: 'altarV1_wave' + i, type: 'crawler', x: 21 + i * 2, z: -75, trigger: 'altar_v1', emerge: true });

  // ---------------------------------------------------------------- triggers
  world.trigger({ id: 'village_bell', x: 0, z: -58, r: 6, enter: (g) => { g.audio.play('bell', { pos: V(0, 20, -20), maxDist: 200 }); g.ui.subtitle('The cathedral bell tolls… though no one is in the tower.'); } });
  world.trigger({ id: 'gate_hint', x: 0, z: -88, r: 4, when: (g) => !g.flags.gate_open, enter: (g) => g.ui.toast('The North Gate is sealed. Find the survivors — they may know how to open it.', 'info') });
  world.trigger({ id: 'courier_hint', x: -17, z: -67, r: 4, enter: (g) => g.horror.whisper(V(-22, 1, -69), '…he ran with the key… he did not run fast enough…') });
}
