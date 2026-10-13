/**
 * AREA 3 — THE WHISPERING FOREST
 * A winding path from the North Gate (z = -94) to the Blood Altar approach (z = -177).
 * Dead trees are placed procedurally everywhere except the path, clearings and hidden trails.
 */
import * as THREE from '../../three.js';
import * as P from '../props.js';
import { planeGeo, boxGeo } from '../builders.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const FOREST_PATH = [[0, -93], [-5, -104], [-11, -115], [-6, -127], [5, -137], [9, -147], [2, -157], [-3, -166], [0, -178]];
const CLEARINGS = [
  { x: -22, z: -117, r: 5.5 }, // cursed altar 2
  { x: 23, z: -127, r: 4.5 }, // hidden glade
  { x: 17, z: -150, r: 5.5 }, // hunter's camp
  { x: 0, z: -160, r: 7 }, // ambush clearing
  { x: -23, z: -158, r: 5 }, // cursed altar 3
];
const TRAILS = [
  { pts: [[-11, -115], [-22, -117]], w: 1.8 },
  { pts: [[3, -135.5], [11, -134], [17, -130], [23, -127]], w: 1.15 },
  { pts: [[9, -147], [17, -150]], w: 2.2 },
  { pts: [[-3, -161], [-14, -160], [-23, -158]], w: 1.5 },
];

function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
function distPolyline(px, pz, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distSeg(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return d;
}

export function buildForest(ctx) {
  const { mats, world } = ctx;

  // ---------------------------------------------------------------- ground + path
  ctx.floor(0, -136, 90, 90, mats.forest, 0, 5);
  const pathStrip = (pts, w, y) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const m = ctx.M(planeGeo(w, len + w * 0.6, 3), mats.dirt, (ax + bx) / 2, y + i * 0.0004, (az + bz) / 2, 0, Math.atan2(bx - ax, bz - az), 0);
      m.castShadow = false;
      ctx.bake(m);
    }
  };
  pathStrip(FOREST_PATH, 5.5, 0.008);
  for (const t of TRAILS) pathStrip(t.pts, t.w * 1.6, 0.007);

  // ---------------------------------------------------------------- trees
  let count = 0;
  for (let gx = -40; gx <= 40; gx += 3.1) {
    for (let gz = -95; gz >= -181; gz -= 3.1) {
      const x = gx + ctx.r(-1.2, 1.2), z = gz + ctx.r(-1.2, 1.2);
      if (z > -96.5 || z < -180) continue;
      if (distPolyline(x, z, FOREST_PATH) < 4.4) continue;
      let blocked = false;
      for (const c of CLEARINGS) if (Math.hypot(x - c.x, z - c.z) < c.r + 1.3) blocked = true;
      for (const t of TRAILS) if (distPolyline(x, z, t.pts) < t.w + 1.1) blocked = true;
      if (blocked) continue;
      world.treeAt(x, z, ctx.r(0.75, 1.35));
      count++;
    }
  }
  // undergrowth: dead bushes and rocks
  const bushGeo = new THREE.ConeGeometry(0.6, 1.0, 5, 1);
  for (let i = 0; i < 140; i++) {
    const x = ctx.r(-38, 38), z = ctx.r(-178, -97);
    if (distPolyline(x, z, FOREST_PATH) < 3.2) continue;
    const m = ctx.M(bushGeo, mats.leaves, x, 0.35, z, ctx.r(-0.3, 0.3), ctx.r(0, 6), ctx.r(-0.3, 0.3), ctx.r(0.6, 1.4), ctx.r(0.5, 1.1), ctx.r(0.6, 1.4));
    m.castShadow = false;
    ctx.bake(m);
  }
  for (let i = 0; i < 26; i++) {
    const x = ctx.r(-36, 36), z = ctx.r(-176, -98);
    if (distPolyline(x, z, FOREST_PATH) < 4.5) continue;
    P.rock(ctx, x, z, ctx.r(0.4, 1.3));
  }
  P.log(ctx, -9.5, -110, 0.6, 5);
  P.log(ctx, 12, -141, -0.3, 4.5);
  P.log(ctx, -7.5, -150, 1.2, 4);
  // forgotten graves beside the path
  for (const [x, z] of [[-1.5, -120], [-12.5, -124], [9, -132], [-8, -170], [5, -170]]) P.gravestone(ctx, x, z, ctx.r(-0.5, 0.5), 1);

  // boundary walls (hidden by the dense trees)
  ctx.col.addBox(-42, -137, 1, 46);
  ctx.col.addBox(42, -137, 1, 46);

  // ---------------------------------------------------------------- will-o-wisps guiding the path
  for (const [x, z] of [[-3, -101], [-9, -111], [-9, -122], [-1, -132], [7, -142], [6, -152], [-1, -163], [-1, -172]]) {
    const y = 1.8 + ctx.r(0, 0.6);
    ctx.flame(V(x, y, z), 0.45, 0x6a8aff, 'wisps');
    ctx.light(V(x, y, z), 0x5a7aff, 1.6, 7, 0.2);
  }

  // ---------------------------------------------------------------- clearing 1: cursed altar 2
  const altar2 = P.cursedAltar(ctx, -22, -117.5);
  world.altars.f1 = altar2;
  P.bones(ctx, -20, -115);
  P.bones(ctx, -24.5, -119);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    P.gravestone(ctx, -22 + Math.cos(a) * 4, -117.5 + Math.sin(a) * 4, -a + Math.PI / 2, 1);
  }
  world.interact({
    id: 'altar_f1', pos: V(-22, 1, -115.9), radius: 2.6, prompt: 'Destroy the cursed altar',
    visible: (g) => !g.flags.altar_f1,
    use: (g) => g.events.destroyAltar('f1', altar2, V(-22, 0, -117.5)),
  });
  world.stateful.push({ sync: (f) => (f.altar_f1 ? altar2.destroy() : altar2.restore()) });

  // ---------------------------------------------------------------- clearing 2: hidden glade
  P.statue(ctx, 25, -128.5, -0.8, { wings: true });
  ctx.light(V(23, 3, -127), 0x8aa8ff, 2.5, 9, 0.1);
  const chest = new THREE.Group();
  chest.position.set(21.5, 0, -125.5);
  chest.rotation.y = 0.6;
  chest.add(ctx.M(boxGeo(1.0, 0.6, 0.65, 1), mats.darkwood, 0, 0.3, 0));
  chest.add(ctx.M(new THREE.CylinderGeometry(0.33, 0.33, 1.0, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), mats.darkwood, 0, 0.6, 0));
  chest.add(ctx.M(boxGeo(1.04, 0.08, 0.7, 1), mats.gold, 0, 0.45, 0));
  ctx.bake(chest);
  ctx.col.addBox(21.5, -125.5, 0.5, 0.33, 0.6, { height: 0.9, camera: false });
  world.interact({
    id: 'glade_chest', pos: V(21.5, 0.8, -125.5), radius: 2.2, prompt: 'Open the old chest',
    visible: (g) => !g.flags.glade_chest,
    use: (g) => {
      g.flags.glade_chest = true;
      g.inventory.add('vial', 2);
      g.audio.play('pickup');
    },
  });
  world.pickup({ id: 'f_relic', kind: 'relic', item: 'saintEye', pos: V(24.6, 1.0, -126.6), hidden: true });

  // ---------------------------------------------------------------- clearing 3: hunter's camp (safe)
  P.campfire(ctx, 16.5, -150.5);
  P.tent(ctx, 20, -153, 0.4);
  P.crate(ctx, 13.5, -153.5, 0.8, 0.3);
  P.barrel(ctx, 14.2, -154.6);
  P.log(ctx, 18.5, -147.2, 1.4, 2.6);
  const hunter = new THREE.Group();
  hunter.position.set(19.6, 0, -148.6);
  hunter.add(ctx.M(boxGeo(0.6, 0.25, 1.6, 1), mats.clothDark, 0, 0.12, 0, 0, -0.5, 0));
  hunter.add(ctx.M(boxGeo(0.06, 0.06, 1.4, 1), mats.iron, 0.6, 0.05, 0.2, 0, 0.4, 0));
  ctx.bake(hunter);
  world.addShrine('forest', ctx, 13.4, -148.2, { name: "Hunter's Camp", spawn: V(14.5, 0, -150.5), facing: Math.PI, safe: true });
  world.safeZones.push({ x: 16.5, z: -150.5, r: 6 });
  world.points.journal = V(19.6, 0.6, -148.6);
  world.interact({
    id: 'journal', pos: V(19.4, 0.8, -148.6), radius: 2.2, prompt: "Read the hunter's journal",
    use: (g) => {
      g.readNote('journal');
      if (!g.flags.clue_journal) {
        g.flags.clue_journal = true;
        g.inventory.add('journal', 1, true);
        g.quests.progress('m3', 'clues');
        world.points.journal = null;
      }
    },
  });
  world.pickup({ id: 'f_quill', kind: 'relic', item: 'quill', pos: V(13.8, 1.1, -153.6) });

  // ---------------------------------------------------------------- clearing 5: cursed altar 3
  const altar3 = P.cursedAltar(ctx, -23, -158.5);
  world.altars.f2 = altar3;
  P.bones(ctx, -21.5, -156.5);
  world.interact({
    id: 'altar_f2', pos: V(-23, 1, -156.9), radius: 2.6, prompt: 'Destroy the cursed altar',
    visible: (g) => !g.flags.altar_f2,
    use: (g) => g.events.destroyAltar('f2', altar3, V(-23, 0, -158.5)),
  });
  world.stateful.push({ sync: (f) => (f.altar_f2 ? altar3.destroy() : altar3.restore()) });

  // ---------------------------------------------------------------- pickups
  world.pickup({ id: 'f_record4', kind: 'record', item: 'record4', pos: V(-9.5, 0.6, -128) });
  world.pickup({ id: 'f_vial1', kind: 'vial', item: 'vial', pos: V(-19.5, 0.5, -120) });
  world.pickup({ id: 'f_vial2', kind: 'vial', item: 'vial', pos: V(5.5, 0.5, -162.5) });

  // ---------------------------------------------------------------- enemies
  const S = (id, type, x, z, group, extra = {}) => world.spawn({ id, type, x, z, group, ...extra });
  S('f_c1', 'crawler', -4, -107, 'f_entry');
  S('f_c2', 'crawler', -6.5, -105.5, 'f_entry');
  S('f_mage1', 'mage', -10, -124, 'f_mid');
  S('f_knight1', 'knight', 5, -139.5, 'f_mid2');
  S('f_stalker1', 'stalker', 13, -144, 'f_prowl');
  S('f_alt1a', 'crawler', -20, -114.5, 'altarF1');
  S('f_alt1b', 'crawler', -24, -120, 'altarF1');
  S('f_alt2s', 'stalker', -20, -160, 'altarF2');
  S('f_alt2c', 'crawler', -25, -156, 'altarF2');
  for (let i = 0; i < 2; i++) world.spawn({ id: 'altarF1_wave' + i, type: 'crawler', x: -21 + i * 2, z: -120, trigger: 'altar_f1', emerge: true });
  for (let i = 0; i < 2; i++) world.spawn({ id: 'altarF2_wave' + i, type: i ? 'stalker' : 'crawler', x: -22 + i * 2, z: -161, trigger: 'altar_f2', emerge: true });
  // ambush (forest heart)
  world.spawn({ id: 'amb_s1', type: 'stalker', x: 0, z: -163.5, trigger: 'ambush', tag: 'ambush', drop: true });
  world.spawn({ id: 'amb_s2', type: 'stalker', x: -5, z: -158, trigger: 'ambush', tag: 'ambush' });
  world.spawn({ id: 'amb_s3', type: 'stalker', x: 5, z: -157, trigger: 'ambush', tag: 'ambush' });
  world.spawn({ id: 'amb_c1', type: 'crawler', x: -3, z: -165, trigger: 'ambush', tag: 'ambush', emerge: true });
  world.spawn({ id: 'amb_c2', type: 'crawler', x: 3, z: -165, trigger: 'ambush', tag: 'ambush', emerge: true });

  // ---------------------------------------------------------------- triggers
  world.points.forestHeart = V(0, 1, -158);
  world.trigger({ id: 'forest_enter', x: 0, z: -97, r: 5, enter: (g) => g.quests.progress('m4', 'enter') });
  world.trigger({
    id: 'forest_heart', x: 0, z: -157, r: 6,
    when: (g) => g.quests.isActive('m4'),
    enter: (g) => {
      g.quests.progress('m4', 'heart');
      g.events.ambush();
    },
  });
  world.trigger({ id: 'forest_whisper1', x: -9, z: -118, r: 4, enter: (g) => g.horror.whisper(V(-14, 2, -112), '…do you remember the seventh night?…') });
  world.trigger({ id: 'forest_whisper2', x: 7, z: -143, r: 4, enter: (g) => g.horror.whisper(V(14, 2, -140), '…the hunter saw you… the hunter knew…') });
  world.trigger({ id: 'glade_find', x: 12, z: -134, r: 2.5, enter: (g) => g.ui.toast('A narrow trail winds between the trees…', 'info') });
  void count;
}
