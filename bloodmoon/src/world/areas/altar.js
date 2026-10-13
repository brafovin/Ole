/**
 * AREA 4 — THE BLOOD ALTAR
 * Causeway (z -177 → -190) with braziers and the last shrine, then the circular arena
 * (centre (0, -208), radius 17) beneath the crimson moon. The Blood Seal blocks the entrance.
 */
import * as THREE from '../../three.js';
import * as P from '../props.js';
import { boxGeo, cylGeo } from '../builders.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const ARENA = { x: 0, z: -208, r: 17 };

export function buildAltar(ctx) {
  const { mats, world } = ctx;
  const A = ARENA;

  // ---------------------------------------------------------------- ground
  ctx.floor(0, -205, 70, 60, mats.dirt, -0.002, 6);
  ctx.floor(0, -184, 6, 16, mats.floor, 0.01, 3);
  const disc = ctx.M(new THREE.CircleGeometry(A.r + 1, 48).rotateX(-Math.PI / 2), mats.floor, A.x, 0.012, A.z);
  disc.castShadow = false;
  // world-scale uvs for the disc
  const uv = disc.geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 9, uv.getY(i) * 9);
  ctx.bake(disc);
  // concentric rune ring inlay
  const ring = ctx.M(new THREE.RingGeometry(7.8, 8.2, 48).rotateX(-Math.PI / 2), mats.flameRed, A.x, 0.02, A.z);
  ring.castShadow = false;
  ctx.bake(ring);
  const ring2 = ctx.M(new THREE.RingGeometry(12.6, 12.9, 64).rotateX(-Math.PI / 2), mats.blood, A.x, 0.02, A.z);
  ring2.castShadow = false;
  ctx.bake(ring2);

  // causeway walls/rocks
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) P.rock(ctx, s * ctx.r(4.5, 7), -178 - i * 2.4, ctx.r(1.0, 1.8));
    ctx.col.addBox(s * 6, -184, 1.5, 8);
  }
  for (const z of [-180, -184.5, -189]) for (const s of [-1, 1]) P.brazier(ctx, s * 3.2, z, 0xff3a2a, 'causeway');

  // ---------------------------------------------------------------- arena ring
  const N = 30;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    if (a < 0.2 || a > Math.PI * 2 - 0.2) continue; // entrance gap (towards +z)
    const x = A.x + Math.sin(a) * A.r, z = A.z + Math.cos(a) * A.r;
    const h = 1.4 + ((i * 7) % 5) * 0.45;
    const segLen = (Math.PI * 2 * A.r) / N + 0.2;
    ctx.box(x, 0, z, segLen, h, 1.1, mats.wall, a, { tile: 2 });
    if (i % 5 === 2) P.column(ctx, A.x + Math.sin(a) * (A.r + 1.2), A.z + Math.cos(a) * (A.r + 1.2), 0.8, 9);
  }
  // outer boundary so the player can never leave the arena area
  ctx.col.addCircle(A.x, A.z, 0.01); // (spatial hash anchor; real walls are the ring)
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x = A.x + Math.sin(a) * (A.r + 9), z = A.z + Math.cos(a) * (A.r + 9);
    if (Math.abs(a) < 0.5 || a > Math.PI * 2 - 0.5) continue;
    P.rock(ctx, x, z, ctx.r(2.5, 4));
  }
  // entrance arch
  P.arch(ctx, 0, A.z + A.r + 0.2, 0, 5.6, 6.5);

  // inner broken pillars (cover)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    P.brokenPillar(ctx, A.x + Math.sin(a) * 11, A.z + Math.cos(a) * 11, 3 + (i % 3) * 1.6, 0.75);
    P.candles(ctx, A.x + Math.sin(a) * 9.6, 0, A.z + Math.cos(a) * 9.6, 5, 0.35);
  }

  // central altar dais with a pool of blood
  const dais = ctx.M(cylGeo(4.2, 4.6, 0.18, 32, 2), mats.marble, A.x, 0.09, A.z);
  ctx.bake(dais);
  const pool = ctx.M(new THREE.CircleGeometry(2.6, 32).rotateX(-Math.PI / 2), mats.blood, A.x, 0.2, A.z);
  pool.castShadow = false;
  ctx.bake(pool);
  const stone = new THREE.Group();
  stone.position.set(A.x, 0, A.z - 1.6);
  stone.add(ctx.M(boxGeo(2.2, 1.1, 1.2, 1), mats.marble, 0, 0.55, 0));
  stone.add(ctx.M(boxGeo(0.9, 2.6, 0.5, 1), mats.marble, 0, 2.2, -0.2, 0, 0, 0.12));
  ctx.bake(stone);
  ctx.col.addBox(A.x, A.z - 1.6, 1.1, 0.6, 0, { height: 1.1 });
  ctx.light(V(A.x, 1.5, A.z), 0xff1a2a, 4, 14, 0.25);
  // kneeling statues around the dais
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    P.statue(ctx, A.x + Math.sin(a) * 6.2, A.z + Math.cos(a) * 6.2, a + Math.PI, { headless: i % 2 === 0 });
  }
  // chains hanging from the sky towards the altar
  const chainMat = mats.iron;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const g = new THREE.Group();
    for (let k = 0; k < 30; k++) {
      const link = ctx.M(new THREE.TorusGeometry(0.075, 0.02, 4, 8), chainMat, 0, k * 0.17, 0, 0, k % 2 ? Math.PI / 2 : 0, 0);
      link.scale.set(1, 1.4, 1);
      link.castShadow = false;
      g.add(link);
    }
    g.position.set(A.x + Math.sin(a) * 3.2, 4, A.z + Math.cos(a) * 3.2);
    g.rotation.z = Math.sin(a) * 0.35;
    g.rotation.x = -Math.cos(a) * 0.35;
    ctx.bake(g);
  }
  // braziers on the ring
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 5;
    P.brazier(ctx, A.x + Math.sin(a) * 14.6, A.z + Math.cos(a) * 14.6, 0xff2a1a, 'arena');
  }

  // ---------------------------------------------------------------- shrine, record, seal
  world.addShrine('altar', ctx, 4, -181, { name: 'Causeway of Ash', spawn: V(1.5, 0, -182), facing: Math.PI });
  world.pickup({ id: 'a_record5', kind: 'record', item: 'record5', pos: V(-3.6, 0.6, -182.6) });
  world.pickup({ id: 'a_vial', kind: 'vial', item: 'vial', pos: V(-3.6, 0.5, -179.6) });

  const sealZ = A.z + A.r + 0.3;
  const sealMat = new THREE.MeshBasicMaterial({ map: ctx.tex.runes, color: 0xff2a3a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const seal = new THREE.Group();
  const sealPlane = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 5.4), sealMat);
  sealPlane.position.y = 2.8;
  seal.add(sealPlane);
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 6.4), new THREE.MeshBasicMaterial({ color: 0x8a0010, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  veil.position.y = 3.2;
  seal.add(veil);
  seal.position.set(0, 0, sealZ);
  ctx.add(seal);
  const sealCol = ctx.col.addBox(0, sealZ, 2.8, 0.3, 0, { height: 6 });
  const sealAnchor = ctx.light(V(0, 2.5, sealZ + 0.6), 0xff1a2a, 3, 8, 0.3);
  world.seal = {
    group: seal, plane: sealPlane, collider: sealCol, anchor: sealAnchor,
    set(on) {
      seal.visible = on;
      sealCol.enabled = on;
      sealAnchor.enabled = on;
    },
  };
  world.stateful.push({ sync: (f) => world.seal.set(!f.seal_broken || (f.boss_started && !f.boss_defeated)) });
  world.points.altarSeal = V(0, 1.5, sealZ + 1.2);
  world.points.boss = V(A.x, 2, A.z);
  world.interact({
    id: 'blood_seal', pos: V(0, 1.2, sealZ + 1.2), radius: 3,
    prompt: (g) => (g.quests.isComplete('m3') ? 'Break the Blood Seal' : 'Touch the Blood Seal'),
    visible: (g) => !g.flags.seal_broken,
    use: (g) => {
      if (!g.quests.isComplete('m3')) {
        g.audio.play('denied');
        g.ui.toast(`The seal burns your hand. A voice: "Only one who knows the truth may pass." (${g.quests.count('m3', 'clues')}/3 clues)`, 'warn');
        return;
      }
      g.events.breakSeal();
    },
  });

  // ---------------------------------------------------------------- triggers
  world.trigger({ id: 'altar_reach', x: 0, z: -182, r: 6, enter: (g) => g.quests.progress('m4', 'exit') });
  world.trigger({
    id: 'boss_start', x: A.x, z: A.z, r: 13,
    once: false,
    when: (g) => g.flags.seal_broken && !g.flags.boss_defeated && !g.boss,
    enter: (g) => g.events.startBoss(),
  });
}
