/**
 * Over-the-shoulder third-person camera: mouse look (yaw/pitch), zoom with the wheel,
 * collision against walls so the camera never clips through geometry, and trauma-based shake.
 */
import { clamp, damp } from './utils.js';

export class CameraRig {
  constructor(game) {
    this.game = game;
    this.yaw = Math.PI;
    this.pitch = -0.18;
    this.dist = 4.2;
    this.curDist = 4.2;
    this.shoulder = 0.55;
    this.height = 1.55;
    this.trauma = 0;
    this.t = 0;
    this.pivot = { x: 0, y: 0, z: 0 };
  }

  /** Point the camera so it looks along the given model facing. */
  faceDirection(facing) {
    this.yaw = facing + Math.PI;
    this.pitch = -0.15;
  }

  addTrauma(a) { this.trauma = Math.min(1, this.trauma + a); }

  update(dt, target, look, wheel) {
    const g = this.game;
    const cam = g.camera;
    const S = g.settings;
    this.t += dt;
    if (look) {
      const sens = 0.0022 * S.get('mouseSensitivity');
      this.yaw -= look.x * sens;
      this.pitch -= look.y * sens * (S.get('invertY') ? -1 : 1);
      this.pitch = clamp(this.pitch, -1.15, 0.65);
    }
    if (wheel) this.dist = clamp(this.dist + wheel * 0.45, 2.4, 7.5);

    // pivot slightly above the shoulders; lags vertically for smooth jumps
    const ty = target.y + this.height;
    this.pivot.x = target.x;
    this.pivot.z = target.z;
    this.pivot.y = damp(this.pivot.y || ty, ty, 12, dt);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const fx = -Math.sin(this.yaw) * cp, fy = sp, fz = -Math.cos(this.yaw) * cp;
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    // ideal offset: behind + right shoulder
    let ox = -fx * this.dist + rx * this.shoulder;
    let oy = -fy * this.dist + 0.25;
    let oz = -fz * this.dist + rz * this.shoulder;
    // collision: shorten the boom when walls are in the way
    const hd = Math.hypot(ox, oz);
    let allowed = this.dist;
    if (hd > 0.01) {
      const camY = this.pivot.y + oy;
      const hit = g.collision.raycast(this.pivot.x, this.pivot.z, ox / hd, oz / hd, hd + 0.4, 'camera', Math.max(0.5, Math.min(this.pivot.y, camY)));
      if (hit < hd + 0.4) allowed = Math.max(0.6, ((hit - 0.4) / hd) * this.dist);
    }
    if (allowed < this.curDist) this.curDist = allowed;
    else this.curDist = damp(this.curDist, allowed, 4, dt);
    const k = this.curDist / this.dist;
    ox *= k;
    oz *= k;
    oy = -fy * this.curDist + 0.25;
    let px = this.pivot.x + ox, py = Math.max(0.35, this.pivot.y + oy), pz = this.pivot.z + oz;

    // shake
    const shake = S.get('screenShake');
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma * shake;
    let yawOff = 0, pitchOff = 0;
    if (s > 0.0001) {
      const t = this.t * 38;
      px += Math.sin(t * 1.1) * 0.18 * s;
      py += Math.sin(t * 1.7 + 1.3) * 0.14 * s;
      pz += Math.cos(t * 0.9 + 2.1) * 0.18 * s;
      yawOff = Math.sin(t * 1.3 + 0.7) * 0.025 * s;
      pitchOff = Math.cos(t * 1.5) * 0.02 * s;
    }
    cam.position.set(px, py, pz);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch + pitchOff, this.yaw + yawOff, 0);
  }
}
