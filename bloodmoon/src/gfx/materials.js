/**
 * Shared materials.
 *  - toon(): cel-shaded MeshToonMaterial with a stepped anime rim light (global colour per area)
 *  - outline(): inverted-hull outline material (pushes vertices along normals, back faces only)
 *  - env materials: PBR stone/wood/etc. built from the procedural texture library
 */
import * as THREE from '../three.js';

export const rimUniforms = {
  uRimColor: { value: new THREE.Color(0x7d93ff) },
  uRimStrength: { value: 0.5 },
};

let gradient = null;
export function toonGradient() {
  if (!gradient) {
    const v = [70, 150, 215, 255];
    const data = new Uint8Array(v.length * 4);
    v.forEach((x, i) => data.set([x, x, x, 255], i * 4));
    gradient = new THREE.DataTexture(data, v.length, 1, THREE.RGBAFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

const RIM_PARS = `#include <common>
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform float uRimK;`;
const RIM_FRAG = `#include <emissivemap_fragment>
{
  vec3 rimView = normalize(vViewPosition);
  float rimNdv = clamp(dot(normal, rimView), 0.0, 1.0);
  float rim = smoothstep(0.6, 0.76, 1.0 - rimNdv);
  totalEmissiveRadiance += uRimColor * rim * uRimStrength * uRimK;
}`;

/** Cel-shaded material with anime rim light. opts.rim scales the rim (0 disables). */
export function toon(color, opts = {}) {
  const { rim = 1, ...rest } = opts;
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...rest });
  m.userData.rimK = { value: rim };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = rimUniforms.uRimColor;
    shader.uniforms.uRimStrength = rimUniforms.uRimStrength;
    shader.uniforms.uRimK = m.userData.rimK;
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', RIM_PARS).replace('#include <emissivemap_fragment>', RIM_FRAG);
  };
  m.customProgramCacheKey = () => 'toonRim';
  return m;
}

const outlineCache = new Map();
/** Inverted-hull outline. `thickness` is in the mesh's local units. */
export function outline(thickness = 0.012, color = 0x07040a) {
  const key = thickness.toFixed(4) + '_' + color;
  let m = outlineCache.get(key);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.userData.thickness = thickness;
  m.userData.outlineColor = color;
  const u = { value: thickness };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uOutline = u;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOutline;')
      .replace('#include <begin_vertex>', 'vec3 transformed = position + normalize(normal) * uOutline;');
  };
  m.customProgramCacheKey = () => 'outline';
  outlineCache.set(key, m);
  return m;
}

/** Add an outline shell as a child of `mesh`. Returns the shell. */
export function addOutline(mesh, thickness = 0.012, color) {
  const shell = new THREE.Mesh(mesh.geometry, outline(thickness, color));
  shell.name = 'outline';
  shell.castShadow = false;
  shell.receiveShadow = false;
  shell.userData.isOutline = true;
  mesh.add(shell);
  return shell;
}

/** Glowing (unlit) material for emissive bits that should bloom. */
export function glowMat(color, opacity = 1, additive = true) {
  return new THREE.MeshBasicMaterial({
    color, transparent: opacity < 1 || additive, opacity,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: !additive, toneMapped: false, fog: true,
  });
}

/** Environment (PBR) materials built from the procedural texture library. */
export function buildEnvMaterials(tex) {
  const std = (t, params = {}, rep = 1) => {
    const p = { roughness: 0.9, metalness: 0, ...params };
    if (t) {
      const map = t.map.clone();
      const nor = t.normalMap.clone();
      map.repeat.set(rep, rep);
      nor.repeat.set(rep, rep);
      map.needsUpdate = nor.needsUpdate = true;
      p.map = map;
      p.normalMap = nor;
    }
    return new THREE.MeshStandardMaterial(p);
  };
  const m = {
    floor: std(tex.floor, { color: 0xb8aaa8 }),
    wall: std(tex.wall, { color: 0xaaa0a8 }),
    wallDark: std(tex.wall, { color: 0x6a6070 }),
    cobble: std(tex.cobble, { color: 0xb0a8a8, roughness: 0.75 }),
    wood: std(tex.wood, { color: 0xc0a090 }),
    darkwood: std(tex.darkwood, { color: 0xa08878 }),
    plaster: std(tex.plaster, { color: 0xb8aca0 }),
    roof: std(tex.roof, { color: 0x9098b0, roughness: 0.7 }),
    dirt: std(tex.dirt, { color: 0xb0a090 }),
    forest: std(tex.forest, { color: 0xa09890 }),
    bark: std(tex.bark, { color: 0x9a8a88 }),
    marble: std(tex.marble, { color: 0xffffff, roughness: 0.35 }),
    stone: std(tex.wall, { color: 0x8a8490 }),
    statue: std(tex.marble, { color: 0x9a96a0, roughness: 0.6 }),
    iron: std(tex.metal, { color: 0x3a3a42, metalness: 0.85, roughness: 0.45 }),
    silver: std(tex.metal, { color: 0xc8ccd8, metalness: 1, roughness: 0.28 }),
    gold: std(tex.metal, { color: 0xb08a40, metalness: 1, roughness: 0.35 }),
    cloth: std(tex.fabric, { color: 0x4a0a14, side: THREE.DoubleSide }),
    clothDark: std(tex.fabric, { color: 0x1a1218, side: THREE.DoubleSide }),
    wax: new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.6, emissive: 0x2a1408 }),
    bone: new THREE.MeshStandardMaterial({ color: 0xc8bca0, roughness: 0.8 }),
    blood: new THREE.MeshStandardMaterial({ color: 0x3a0208, roughness: 0.15, metalness: 0.2, emissive: 0x120004 }),
    black: new THREE.MeshStandardMaterial({ color: 0x050407, roughness: 1 }),
    windowDark: new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.2, metalness: 0.4 }),
    windowLit: new THREE.MeshBasicMaterial({ color: 0xd88a3a, toneMapped: false }),
    flame: glowMat(0xffa040),
    flameRed: glowMat(0xff2a3a),
    crystal: new THREE.MeshStandardMaterial({ color: 0x8a0a1a, emissive: 0xff2040, emissiveIntensity: 1.6, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.92 }),
    glass: tex.glass.map((t) => new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: 0xbbbbbb })),
    rose: new THREE.MeshBasicMaterial({ map: tex.rose, transparent: true, toneMapped: false, color: 0xdddddd }),
    banner: new THREE.MeshStandardMaterial({ map: tex.banner, side: THREE.DoubleSide, transparent: true, alphaTest: 0.5, roughness: 0.9 }),
    paper: new THREE.MeshStandardMaterial({ map: tex.paper, roughness: 0.9, emissive: 0x201810 }),
    leaves: new THREE.MeshStandardMaterial({ color: 0x1a120e, roughness: 1, side: THREE.DoubleSide }),
  };
  return m;
}
