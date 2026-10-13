/**
 * Rigid skinning optimisation.
 *
 * Characters are built from many small meshes parented to rig pivots. This pass merges every
 * opaque part that shares a material into ONE SkinnedMesh whose vertices are weighted 100% to the
 * pivot they were attached to (the pivots act as bones). Outline shells are merged the same way.
 * Result: ~5x fewer draw calls with identical animation.
 *
 * Meshes flagged userData.keep, transparent meshes and meshes with renderOrder are left untouched.
 */
import * as THREE from '../three.js';
import { mergeGeometries } from '../core/utils.js';
import { outline } from '../gfx/materials.js';

function prep(geo, mat, matrix, boneIndex) {
  let g = geo.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  const keep = ['position', 'normal'];
  if (mat && mat.map) {
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    keep.push('uv');
  }
  if (mat && mat.vertexColors) {
    if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    keep.push('color');
  }
  for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
  g.morphAttributes = {};
  g.clearGroups();
  g.applyMatrix4(matrix);
  const n = g.attributes.position.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { si[i * 4] = boneIndex; sw[i * 4] = 1; }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return g;
}

function eligible(m) {
  return m.isMesh && !m.isSkinnedMesh && !m.userData.isOutline && !m.userData.keep && m.renderOrder === 0 &&
    !Array.isArray(m.material) && !m.material.transparent;
}

/** Convert `root` in place. `refs` (e.g. the rig object) has its mesh references remapped. */
export function convertToSkinned(root, refs = null) {
  root.updateMatrixWorld(true);
  const all = [];
  root.traverse((o) => all.push(o));
  const parts = all.filter(eligible);
  if (parts.length < 2) return;
  // 1) meshes that are also parents become plain groups (their children move over)
  const remap = new Map();
  for (const m of parts) {
    const kids = m.children.filter((c) => !c.userData.isOutline);
    if (!kids.length) continue;
    const g = new THREE.Group();
    g.name = m.name || 'node';
    g.position.copy(m.position);
    g.quaternion.copy(m.quaternion);
    g.scale.copy(m.scale);
    m.parent.add(g);
    for (const k of kids) g.add(k);
    // the mesh itself now sits at identity inside the new group
    g.add(m);
    m.position.set(0, 0, 0);
    m.quaternion.identity();
    m.scale.set(1, 1, 1);
    remap.set(m, g);
  }
  root.updateMatrixWorld(true);
  // 2) bones = parents of the parts
  const bones = [];
  const boneIndex = new Map();
  for (const m of parts) {
    const b = m.parent;
    if (!boneIndex.has(b)) { boneIndex.set(b, bones.length); bones.push(b); }
  }
  // 3) gather geometry per material / per outline thickness
  const byMat = new Map(), byOutline = new Map();
  for (const m of parts) {
    m.updateMatrix();
    const bi = boneIndex.get(m.parent);
    const k = m.material.uuid;
    if (!byMat.has(k)) byMat.set(k, { mat: m.material, geos: [], cast: false });
    const e = byMat.get(k);
    e.geos.push(prep(m.geometry, m.material, m.matrix, bi));
    e.cast = e.cast || m.castShadow;
    for (const sh of m.children) {
      if (!sh.userData.isOutline) continue;
      const t0 = sh.material.userData.thickness;
      if (t0 === undefined) continue;
      const s = (Math.abs(m.scale.x) + Math.abs(m.scale.y) + Math.abs(m.scale.z)) / 3;
      const t = Math.max(0.002, Math.round(t0 * s * 1000) / 1000);
      const key = t + '_' + sh.material.userData.outlineColor;
      if (!byOutline.has(key)) byOutline.set(key, { t, color: sh.material.userData.outlineColor, geos: [] });
      byOutline.get(key).geos.push(prep(m.geometry, null, m.matrix, bi));
    }
  }
  for (const m of parts) m.removeFromParent();
  // 4) build skinned meshes sharing one skeleton (identity inverses: vertices are bone-local)
  const skeleton = new THREE.Skeleton(bones, bones.map(() => new THREE.Matrix4()));
  const ident = new THREE.Matrix4();
  const make = (geos, mat, cast, isOutline) => {
    const sm = new THREE.SkinnedMesh(mergeGeometries(geos), mat);
    sm.bind(skeleton, ident);
    sm.frustumCulled = false;
    sm.castShadow = cast;
    sm.receiveShadow = false;
    if (isOutline) sm.userData.isOutline = true;
    root.add(sm);
    for (const g of geos) g.dispose();
    return sm;
  };
  for (const e of byMat.values()) make(e.geos, e.mat, e.cast, false);
  for (const o of byOutline.values()) make(o.geos, outline(o.t, o.color), false, true);
  if (refs) for (const k of Object.keys(refs)) if (remap.has(refs[k])) refs[k] = remap.get(refs[k]);
  return skeleton;
}

/** Deep-clone an object whose SkinnedMeshes reference bones inside it (frozen in the current pose). */
export function cloneSkinned(source) {
  const srcList = [], dstList = [];
  const clone = source.clone(true);
  source.traverse((o) => srcList.push(o));
  clone.traverse((o) => dstList.push(o));
  const map = new Map(srcList.map((o, i) => [o, dstList[i]]));
  clone.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const sk = o.skeleton;
    const bones = sk.bones.map((b) => map.get(b) || b);
    o.bind(new THREE.Skeleton(bones, sk.boneInverses.map((m) => m.clone())), o.bindMatrix);
  });
  return clone;
}
