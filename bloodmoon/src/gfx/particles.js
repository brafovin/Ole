/**
 * Pooled CPU-simulated point particles rendered as one THREE.Points draw call.
 * Two instances are used: additive (magic, sparks, embers) and normal-blended (smoke, blood, ash).
 */
import * as THREE from '../three.js';
import { rand } from '../core/utils.js';

const VERT = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale;
varying float vAlpha;
varying vec3 vColor;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  vAlpha = aAlpha;
  vColor = aColor;
  #include <fog_vertex>
}`;
const FRAG = `
uniform sampler2D uTex;
varying float vAlpha;
varying vec3 vColor;
#include <fog_pars_fragment>
void main() {
  vec4 t = texture2D(uTex, gl_PointCoord);
  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
  if (gl_FragColor.a < 0.004) discard;
  #include <fog_fragment>
}`;

export class ParticleSystem {
  constructor(scene, texture, { max = 2500, additive = true } = {}) {
    this.max = max;
    this.count = 0;
    this.budget = 1;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col0 = new Float32Array(max * 3);
    this.col1 = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);

    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aColor', this.aCol);
    g.setAttribute('aSize', this.aSize);
    g.setAttribute('aAlpha', this.aAlpha);
    g.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTex: { value: texture }, uScale: { value: 500 } }]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
    });
    this.material.uniforms.uTex.value = texture;
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
    this._c0 = new THREE.Color();
    this._c1 = new THREE.Color();
  }

  /** Projection scale so `size` is in world units. */
  setViewport(heightPx, fovDeg) {
    this.material.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  /**
   * Emit one particle.
   * o: { pos, vel, life, size, size1, color, color1, alpha, gravity, drag }
   */
  emit(o) {
    if (this.count >= this.max) return;
    const i = this.count++;
    const p = o.pos, v = o.vel;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v ? v.x : 0; this.vel[i * 3 + 1] = v ? v.y : 0; this.vel[i * 3 + 2] = v ? v.z : 0;
    const c0 = this._c0.set(o.color ?? 0xffffff), c1 = this._c1.set(o.color1 ?? o.color ?? 0xffffff);
    this.col0[i * 3] = c0.r; this.col0[i * 3 + 1] = c0.g; this.col0[i * 3 + 2] = c0.b;
    this.col1[i * 3] = c1.r; this.col1[i * 3 + 1] = c1.g; this.col1[i * 3 + 2] = c1.b;
    this.maxLife[i] = this.life[i] = o.life ?? 1;
    this.size0[i] = o.size ?? 0.3;
    this.size1[i] = o.size1 ?? (o.size ?? 0.3) * 0.2;
    this.alpha0[i] = o.alpha ?? 1;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
  }

  /** Emit `n` particles around `pos` with random spherical velocity. */
  burst(pos, n, o = {}) {
    n = Math.ceil(n * this.budget);
    const spd = o.speed ?? 3, spread = o.spread ?? 0.2;
    const tmpP = { x: 0, y: 0, z: 0 }, tmpV = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < n; i++) {
      const th = rand(0, Math.PI * 2), ph = Math.acos(rand(-1, 1));
      const s = spd * rand(0.35, 1);
      tmpV.x = Math.sin(ph) * Math.cos(th) * s + (o.dir ? o.dir.x : 0);
      tmpV.y = Math.abs(Math.cos(ph)) * s * (o.upBias ?? 0.6) + (o.dir ? o.dir.y : 0) + (o.up ?? 0);
      tmpV.z = Math.sin(ph) * Math.sin(th) * s + (o.dir ? o.dir.z : 0);
      tmpP.x = pos.x + rand(-spread, spread);
      tmpP.y = pos.y + rand(-spread, spread);
      tmpP.z = pos.z + rand(-spread, spread);
      this.emit({
        pos: tmpP, vel: tmpV, life: rand(o.life ?? 0.6, (o.life ?? 0.6) * 1.6),
        size: (o.size ?? 0.25) * rand(0.7, 1.3), size1: o.size1, color: o.color, color1: o.color1,
        alpha: o.alpha, gravity: o.gravity ?? -4, drag: o.drag ?? 1.5,
      });
    }
  }

  update(dt) {
    const P = this.pos, V = this.vel;
    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove
        const last = --this.count;
        if (i !== last) {
          for (let k = 0; k < 3; k++) {
            P[i * 3 + k] = P[last * 3 + k]; V[i * 3 + k] = V[last * 3 + k];
            this.col0[i * 3 + k] = this.col0[last * 3 + k]; this.col1[i * 3 + k] = this.col1[last * 3 + k];
          }
          this.life[i] = this.life[last]; this.maxLife[i] = this.maxLife[last];
          this.size0[i] = this.size0[last]; this.size1[i] = this.size1[last];
          this.alpha0[i] = this.alpha0[last]; this.grav[i] = this.grav[last]; this.drag[i] = this.drag[last];
        }
        i--;
        continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      V[i * 3] *= d; V[i * 3 + 1] = V[i * 3 + 1] * d + this.grav[i] * dt; V[i * 3 + 2] *= d;
      P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
    }
    const ap = this.aPos.array, ac = this.aCol.array, as = this.aSize.array, aa = this.aAlpha.array;
    for (let i = 0; i < this.count; i++) {
      const t = 1 - this.life[i] / this.maxLife[i];
      ap[i * 3] = P[i * 3]; ap[i * 3 + 1] = P[i * 3 + 1]; ap[i * 3 + 2] = P[i * 3 + 2];
      for (let k = 0; k < 3; k++) ac[i * 3 + k] = this.col0[i * 3 + k] + (this.col1[i * 3 + k] - this.col0[i * 3 + k]) * t;
      as[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      // fade in quickly, fade out over the last 40%
      aa[i] = this.alpha0[i] * Math.min(1, t * 12) * Math.min(1, (1 - t) / 0.4);
    }
    this.points.geometry.setDrawRange(0, this.count);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = true;
  }

  clear() { this.count = 0; }
}
