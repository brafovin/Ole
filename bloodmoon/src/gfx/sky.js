/**
 * Night sky: gradient dome with procedural stars and drifting clouds, plus the giant crimson moon.
 * Both follow the camera so they read as infinitely far away.
 */
import * as THREE from '../three.js';

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w * 0.99999; // push to far plane
}`;
const SKY_FRAG = `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uMoonGlow;
uniform vec3 uMoonDir;
uniform float uTime;
uniform float uStars;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(clamp(h + 0.05, 0.0, 1.0), 0.55));
  float m = max(dot(d, uMoonDir), 0.0);
  col += uMoonGlow * (pow(m, 16.0) * 0.45 + pow(m, 90.0) * 0.6 + pow(m, 3.0) * 0.06);
  col += vec3(0.012, 0.02, 0.055) * (1.0 - pow(m, 2.0)) * smoothstep(0.05, 0.6, h);
  // stars
  vec3 sp = d * 220.0;
  float s = hash(floor(sp));
  float star = step(0.9965, s) * smoothstep(0.0, 0.25, h) * uStars;
  float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 100.0);
  col += vec3(0.85, 0.85, 1.0) * star * tw * (1.0 - pow(m, 6.0));
  // slow clouds
  float c = noise(d * 3.0 + vec3(uTime * 0.01, 0.0, uTime * 0.006)) * 0.6 + noise(d * 7.0 - vec3(uTime * 0.02, 0.0, 0.0)) * 0.4;
  float cloud = smoothstep(0.45, 0.8, c) * smoothstep(-0.05, 0.35, h) * 0.75;
  vec3 cloudCol = mix(vec3(0.015, 0.012, 0.02), uMoonGlow * 0.5, pow(m, 4.0));
  col = mix(col, cloudCol, cloud);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor(scene, tex) {
    this.moonDir = new THREE.Vector3(0.05, 0.36, -1).normalize();
    this.uniforms = {
      uTop: { value: new THREE.Color(0x060a1c) },
      uHorizon: { value: new THREE.Color(0x1a0710) },
      uMoonGlow: { value: new THREE.Color(0xd02028) },
      uMoonDir: { value: this.moonDir },
      uTime: { value: 0 },
      uStars: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // Moon disc + halo
    this.moon = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: tex.moon, transparent: true, depthWrite: false, fog: false, toneMapped: false, color: 0xffffff }),
    );
    disc.scale.setScalar(70);
    disc.material.color.setScalar(1.6);
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: tex.glow, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, color: 0xff2020, opacity: 0.5, toneMapped: false }),
    );
    halo.scale.setScalar(190);
    halo.position.z = -1;
    this.disc = disc;
    this.halo = halo;
    this.moon.add(halo, disc);
    this.moon.renderOrder = -9;
    disc.renderOrder = halo.renderOrder = -9;
    disc.frustumCulled = halo.frustumCulled = false;
    scene.add(this.moon);
    this.crack = 0;
  }

  setMoonScale(s) { this.moon.scale.setScalar(s); }

  update(dt, camera) {
    this.uniforms.uTime.value += dt;
    this.dome.position.copy(camera.position);
    this.moon.position.copy(camera.position).addScaledVector(this.moonDir, 330);
    this.moon.lookAt(camera.position);
    this.halo.material.opacity = 0.2 + Math.sin(this.uniforms.uTime.value * 0.4) * 0.03;
  }
}
