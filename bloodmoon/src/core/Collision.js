/**
 * Lightweight 2D (XZ-plane) collision world. The ground is flat, so walls and props are modelled
 * as oriented boxes and circles with a height. Characters are circles. A uniform spatial hash
 * keeps queries cheap.
 *
 * Rotation convention matches Object3D.rotation.y.
 */
export class CollisionWorld {
  constructor(cellSize = 8) {
    this.cell = cellSize;
    this.grid = new Map();
    this.colliders = [];
    this.stamp = 0;
    this.nextId = 1;
  }

  _key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }

  _insert(c) {
    const r = c.br;
    const x0 = Math.floor((c.x - r) / this.cell), x1 = Math.floor((c.x + r) / this.cell);
    const z0 = Math.floor((c.z - r) / this.cell), z1 = Math.floor((c.z + r) / this.cell);
    c.cells = [];
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = this._key(ix, iz);
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(c);
        c.cells.push(k);
      }
    }
  }

  /**
   * Oriented box centred at (x, z) with half extents hx/hz.
   * opts.height  — top of the obstacle (characters whose feet are higher pass over it)
   * opts.camera  — whether the third-person camera is blocked by it (default true for tall ones)
   * opts.projectiles — whether projectiles are stopped (default true)
   */
  addBox(x, z, hx, hz, rot = 0, opts = {}) {
    const c = {
      id: this.nextId++, kind: 'box', x, z, hx, hz, rot,
      cos: Math.cos(rot), sin: Math.sin(rot),
      height: opts.height ?? 50,
      camera: opts.camera ?? (opts.height === undefined || opts.height > 2.2),
      projectiles: opts.projectiles ?? true,
      enabled: true, tag: opts.tag || null,
      br: Math.hypot(hx, hz),
    };
    this.colliders.push(c);
    this._insert(c);
    return c;
  }

  addCircle(x, z, r, opts = {}) {
    const c = {
      id: this.nextId++, kind: 'circle', x, z, r,
      height: opts.height ?? 50,
      camera: opts.camera ?? (opts.height === undefined || opts.height > 2.2),
      projectiles: opts.projectiles ?? true,
      enabled: true, tag: opts.tag || null,
      br: r,
    };
    this.colliders.push(c);
    this._insert(c);
    return c;
  }

  setEnabled(c, on) { if (c) c.enabled = on; }

  /** Colliders whose cells overlap the axis-aligned square around (x, z). */
  query(x, z, r, out = []) {
    out.length = 0;
    const s = ++this.stamp;
    const x0 = Math.floor((x - r) / this.cell), x1 = Math.floor((x + r) / this.cell);
    const z0 = Math.floor((z - r) / this.cell), z1 = Math.floor((z + r) / this.cell);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const list = this.grid.get(this._key(ix, iz));
        if (!list) continue;
        for (const c of list) {
          if (c._s === s || !c.enabled) continue;
          c._s = s;
          out.push(c);
        }
      }
    }
    return out;
  }

  /**
   * Push a circle (pos.x, pos.z, radius) out of all overlapping colliders.
   * Returns true when any collision occurred.
   */
  resolveCircle(pos, radius, feetY = 0) {
    let hit = false;
    const near = this.query(pos.x, pos.z, radius + 1, this._tmp || (this._tmp = []));
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const c of near) {
        if (feetY > c.height) continue;
        if (c.kind === 'circle') {
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const rr = radius + c.r;
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr) {
            const d = Math.sqrt(d2) || 1e-4;
            const push = rr - d;
            pos.x += (dx / d) * push;
            pos.z += (dz / d) * push;
            moved = hit = true;
          }
        } else {
          const dx = pos.x - c.x, dz = pos.z - c.z;
          // world -> local
          const lx = dx * c.cos - dz * c.sin;
          const lz = dx * c.sin + dz * c.cos;
          const qx = Math.max(-c.hx, Math.min(c.hx, lx));
          const qz = Math.max(-c.hz, Math.min(c.hz, lz));
          let ex = lx - qx, ez = lz - qz;
          const d2 = ex * ex + ez * ez;
          if (d2 >= radius * radius) continue;
          let px, pz;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            px = (ex / d) * (radius - d);
            pz = (ez / d) * (radius - d);
          } else {
            // centre is inside the box: leave through the nearest face
            const penX = c.hx - Math.abs(lx), penZ = c.hz - Math.abs(lz);
            if (penX < penZ) { px = Math.sign(lx || 1) * (penX + radius); pz = 0; }
            else { px = 0; pz = Math.sign(lz || 1) * (penZ + radius); }
          }
          // local -> world
          pos.x += px * c.cos + pz * c.sin;
          pos.z += -px * c.sin + pz * c.cos;
          moved = hit = true;
        }
      }
      if (!moved) break;
    }
    return hit;
  }

  /** True when a circle at (x,z) overlaps any collider. */
  overlaps(x, z, radius, feetY = 0) {
    const near = this.query(x, z, radius + 1, this._tmp2 || (this._tmp2 = []));
    for (const c of near) {
      if (feetY > c.height) continue;
      if (c.kind === 'circle') {
        if (Math.hypot(x - c.x, z - c.z) < radius + c.r) return true;
      } else {
        const dx = x - c.x, dz = z - c.z;
        const lx = dx * c.cos - dz * c.sin;
        const lz = dx * c.sin + dz * c.cos;
        const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qz = Math.max(-c.hz, Math.min(c.hz, lz));
        if ((lx - qx) ** 2 + (lz - qz) ** 2 < radius * radius) return true;
      }
    }
    return false;
  }

  /**
   * Cast a 2D ray. Returns distance to the first hit (or maxDist).
   * filter: 'camera' | 'projectiles' | 'all'
   */
  raycast(ox, oz, dx, dz, maxDist, filter = 'all', minHeight = 0) {
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const ex = ox + dx * maxDist, ez = oz + dz * maxDist;
    const cx = (ox + ex) / 2, cz = (oz + ez) / 2;
    const near = this.query(cx, cz, maxDist / 2 + 1, this._tmp3 || (this._tmp3 = []));
    let best = maxDist;
    for (const c of near) {
      if (filter === 'camera' && !c.camera) continue;
      if (filter === 'projectiles' && !c.projectiles) continue;
      if (c.height < minHeight) continue;
      let t;
      if (c.kind === 'circle') {
        const fx = ox - c.x, fz = oz - c.z;
        const b = fx * dx + fz * dz;
        const cc = fx * fx + fz * fz - c.r * c.r;
        const disc = b * b - cc;
        if (disc < 0) continue;
        t = -b - Math.sqrt(disc);
        if (t < 0) t = cc < 0 ? 0 : -1;
      } else {
        const rx = ox - c.x, rz = oz - c.z;
        const lox = rx * c.cos - rz * c.sin, loz = rx * c.sin + rz * c.cos;
        const ldx = dx * c.cos - dz * c.sin, ldz = dx * c.sin + dz * c.cos;
        let tmin = -Infinity, tmax = Infinity;
        if (Math.abs(ldx) < 1e-9) { if (lox < -c.hx || lox > c.hx) continue; }
        else {
          let t1 = (-c.hx - lox) / ldx, t2 = (c.hx - lox) / ldx;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        }
        if (Math.abs(ldz) < 1e-9) { if (loz < -c.hz || loz > c.hz) continue; }
        else {
          let t1 = (-c.hz - loz) / ldz, t2 = (c.hz - loz) / ldz;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        }
        if (tmax < tmin || tmax < 0) continue;
        t = tmin < 0 ? 0 : tmin;
      }
      if (t >= 0 && t < best) best = t;
    }
    return best;
  }

  /** Line of sight between two points for tall obstacles (walls, trees). */
  lineOfSight(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return true;
    return this.raycast(a.x, a.z, dx, dz, d, 'camera', 2.2) >= d - 0.05;
  }
}
