/**
 * Procedural texture generation (no image files needed).
 * Noise-based materials produce a colour map + normal map; decorative textures (stained glass,
 * moon, glows) are painted with the Canvas 2D API.
 */
import * as THREE from '../three.js';
import { mulberry32, clamp, lerp, smoothstep } from '../core/utils.js';

// ------------------------------------------------------------------ tileable value noise
function makeNoise(seed) {
  const rng = mulberry32(seed);
  const vals = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) vals[i] = rng();
  const hash = (x, y) => vals[((x * 374761393 + y * 668265263) >>> 0) % 1021];
  return function noise(x, y, period) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const p = period | 0;
    const x0 = ((ix % p) + p) % p, y0 = ((iy % p) + p) % p;
    const x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(x0, y0), b = hash(x1, y0), c = hash(x0, y1), d = hash(x1, y1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

function makeFbm(seed) {
  const n = makeNoise(seed);
  // u, v in [0,1); base = lattice cells across the tile
  return (u, v, base = 4, oct = 4, gain = 0.5) => {
    let sum = 0, amp = 0.5, f = base, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += amp * n(u * f, v * f, f);
      norm += amp;
      amp *= gain;
      f *= 2;
    }
    return sum / norm;
  };
}

class TexGen {
  constructor(size) {
    this.n = size;
    this.col = new Float32Array(size * size * 3);
    this.h = new Float32Array(size * size);
    this.rough = null;
  }
  set(x, y, r, g, b, h) {
    const i = y * this.n + x;
    this.col[i * 3] = r;
    this.col[i * 3 + 1] = g;
    this.col[i * 3 + 2] = b;
    this.h[i] = h;
  }
  toTextures(normalStrength = 2, repeat = 1) {
    const n = this.n;
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = c.height = n;
      return c;
    };
    const cMap = mk(), cNor = mk();
    const ctxM = cMap.getContext('2d'), ctxN = cNor.getContext('2d');
    const imM = ctxM.createImageData(n, n), imN = ctxN.createImageData(n, n);
    const dm = imM.data, dn = imN.data;
    const H = this.h, C = this.col;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        dm[i * 4] = clamp(C[i * 3] * 255, 0, 255);
        dm[i * 4 + 1] = clamp(C[i * 3 + 1] * 255, 0, 255);
        dm[i * 4 + 2] = clamp(C[i * 3 + 2] * 255, 0, 255);
        dm[i * 4 + 3] = 255;
        const hl = H[y * n + ((x - 1 + n) % n)], hr = H[y * n + ((x + 1) % n)];
        const hu = H[((y - 1 + n) % n) * n + x], hd = H[((y + 1) % n) * n + x];
        let nx = -(hr - hl) * normalStrength, ny = (hd - hu) * normalStrength, nz = 1;
        const l = Math.hypot(nx, ny, nz);
        dn[i * 4] = (nx / l * 0.5 + 0.5) * 255;
        dn[i * 4 + 1] = (ny / l * 0.5 + 0.5) * 255;
        dn[i * 4 + 2] = (nz / l * 0.5 + 0.5) * 255;
        dn[i * 4 + 3] = 255;
      }
    }
    ctxM.putImageData(imM, 0, 0);
    ctxN.putImageData(imN, 0, 0);
    const map = new THREE.CanvasTexture(cMap);
    map.colorSpace = THREE.SRGBColorSpace;
    const normalMap = new THREE.CanvasTexture(cNor);
    for (const t of [map, normalMap]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.anisotropy = 4;
    }
    return { map, normalMap };
  }
}

// ------------------------------------------------------------------ generators
function bricks(size, { cols, rows, seed, base, varAmt = 0.06, mortar = 0.06, bevel = 0.08, grime = 0.4, crack = 0.3, tint = [1, 1, 1], streaks = 0 }) {
  const g = new TexGen(size);
  const fbm = makeFbm(seed), fbm2 = makeFbm(seed + 7), rng = mulberry32(seed + 3);
  const tileVar = [];
  for (let i = 0; i < cols * rows * 2; i++) tileVar.push([rng() * 2 - 1, rng() * 2 - 1, rng()]);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const rv = v * rows;
    const row = Math.floor(rv);
    const fv = rv - row;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      let cu = u * cols + (row % 2) * 0.5;
      const col = Math.floor(cu) % cols;
      const fu = cu - Math.floor(cu);
      const tv = tileVar[(row * cols + col) % tileVar.length];
      const ex = Math.min(fu, 1 - fu) / cols * size, ey = Math.min(fv, 1 - fv) / rows * size;
      const edge = Math.min(ex, ey) / size; // distance to edge in uv units
      const m = smoothstep(mortar * 0.25, mortar * 0.25 + bevel * 0.25, edge);
      const detail = fbm(u, v, 8, 5);
      const large = fbm2(u, v, 2, 3);
      let h = m * (0.6 + 0.4 * detail) + (1 - m) * 0.1 * detail;
      let shade = base * (1 + tv[0] * varAmt * 3) * (0.75 + 0.5 * detail) * (1 - grime * smoothstep(0.45, 0.8, large));
      if (streaks) shade *= 1 - streaks * smoothstep(0.5, 0.9, fbm2(u * 1, v * 0.15, 12, 2)) * (0.4 + 0.6 * v);
      // cracks: thin dark lines from warped noise iso-lines
      const cn = Math.abs(fbm(u * 1.3 + 0.3, v * 1.3, 6, 3) - 0.5);
      if (crack > 0 && cn < 0.012 && tv[2] < crack) {
        h -= 0.3;
        shade *= 0.45;
      }
      const mortarShade = base * 0.35 * (0.7 + 0.6 * detail);
      const s = lerp(mortarShade, shade, m);
      g.set(x, y, s * tint[0] * (1 + tv[1] * 0.04), s * tint[1], s * tint[2] * (1 - tv[1] * 0.04), h);
    }
  }
  return g;
}

function cobble(size, seed) {
  const g = new TexGen(size);
  const rng = mulberry32(seed);
  const cells = 7;
  const pts = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + 0.15 + rng() * 0.7) / cells, (j + 0.15 + rng() * 0.7) / cells, rng()]);
  const fbm = makeFbm(seed + 1), fbm2 = makeFbm(seed + 9);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      let f1 = 9, f2 = 9, id = 0;
      const ci = Math.floor(u * cells), cj = Math.floor(v * cells);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ii = (ci + di + cells) % cells, jj = (cj + dj + cells) % cells;
          const p = pts[jj * cells + ii];
          let dx = p[0] + (ci + di - ii) / cells - u;
          let dy = p[1] + (cj + dj - jj) / cells - v;
          // wrap offsets
          const d = Math.hypot(dx, dy);
          if (d < f1) { f2 = f1; f1 = d; id = jj * cells + ii; }
          else if (d < f2) f2 = d;
        }
      }
      const edge = (f2 - f1) * cells;
      const stone = smoothstep(0.04, 0.22, edge);
      const det = fbm(u, v, 16, 4);
      const pv = pts[id][2];
      const dome = stone * (0.55 + 0.45 * Math.sqrt(clamp(edge * 1.5, 0, 1)));
      const h = dome + det * 0.15;
      const wet = fbm2(u, v, 3, 3);
      let s = (0.16 + pv * 0.1) * (0.75 + 0.45 * det) * stone + (1 - stone) * 0.05 * (0.6 + det);
      s *= 1 - 0.35 * smoothstep(0.5, 0.75, wet);
      g.set(x, y, s * 1.02, s * 0.98, s * 0.97, h);
    }
  }
  return g;
}

function planks(size, seed, { count = 5, base = [0.2, 0.13, 0.08], gap = 0.012 } = {}) {
  const g = new TexGen(size);
  const fbm = makeFbm(seed), rng = mulberry32(seed);
  const pv = Array.from({ length: count }, () => [0.8 + rng() * 0.4, rng()]);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const pu = u * count;
      const p = Math.floor(pu);
      const fu = pu - p;
      const edge = Math.min(fu, 1 - fu) / count;
      const m = smoothstep(gap * 0.5, gap * 1.5, edge);
      const warp = fbm(u * 0.5 + pv[p][1], v, 4, 3);
      const grain = 0.5 + 0.5 * Math.sin((u * count * 14 + warp * 9 + pv[p][1] * 10) * Math.PI);
      const det = fbm(u, v, 32, 3);
      const k = pv[p][0] * (0.7 + 0.25 * grain + 0.2 * det) * m + (1 - m) * 0.25;
      const h = m * (0.5 + 0.2 * grain + 0.3 * det);
      g.set(x, y, base[0] * k, base[1] * k, base[2] * k, h);
    }
  }
  return g;
}

function plaster(size, seed) {
  const g = new TexGen(size);
  const fbm = makeFbm(seed), fbm2 = makeFbm(seed + 5);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const d = fbm(u, v, 8, 5);
      const st = fbm2(u, v, 3, 3);
      const drip = smoothstep(0.55, 0.85, fbm2(u, v * 0.2, 14, 2)) * v;
      let s = 0.33 * (0.8 + 0.35 * d) * (1 - 0.5 * smoothstep(0.45, 0.75, st)) * (1 - 0.4 * drip);
      const chip = smoothstep(0.66, 0.7, fbm(u + 0.5, v, 6, 3));
      const h = 0.5 + 0.3 * d - chip * 0.4;
      if (chip > 0.5) s *= 0.55;
      g.set(x, y, s * 1.05, s * 0.98, s * 0.9, h);
    }
  }
  return g;
}

function shingles(size, seed) {
  const g = new TexGen(size);
  const fbm = makeFbm(seed), rng = mulberry32(seed);
  const rows = 10, cols = 8;
  const vv = Array.from({ length: rows * cols }, () => rng());
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const rv = v * rows;
    const r = Math.floor(rv);
    const fv = rv - r;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const cu = u * cols + (r % 2) * 0.5;
      const c = Math.floor(cu) % cols;
      const fu = cu - Math.floor(cu);
      const sv = vv[r * cols + c];
      const edgeX = smoothstep(0.0, 0.06, Math.min(fu, 1 - fu));
      const d = fbm(u, v, 16, 3);
      const h = fv * 0.8 * edgeX + d * 0.2;
      const s = (0.09 + sv * 0.05) * (0.6 + 0.6 * fv) * (0.4 + 0.6 * edgeX) * (0.8 + 0.4 * d);
      g.set(x, y, s * 0.9, s * 0.92, s * 1.08, h);
    }
  }
  return g;
}

function ground(size, seed, { base = [0.1, 0.085, 0.07], leaves = 0.5, moss = 0.2 } = {}) {
  const g = new TexGen(size);
  const fbm = makeFbm(seed), fbm2 = makeFbm(seed + 11), fbm3 = makeFbm(seed + 21);
  const rng = mulberry32(seed);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const d = fbm(u, v, 6, 6);
      const l = fbm2(u, v, 24, 2);
      const m = fbm3(u, v, 3, 3);
      let r = base[0], gg = base[1], b = base[2];
      const k = 0.65 + 0.7 * d;
      r *= k; gg *= k; b *= k;
      const mossK = smoothstep(0.55, 0.7, m) * moss;
      r = lerp(r, 0.05, mossK); gg = lerp(gg, 0.08, mossK); b = lerp(b, 0.05, mossK);
      let h = d;
      if (leaves > 0 && l > 1 - leaves * 0.35) {
        const lk = rng();
        r = 0.16 + lk * 0.12; gg = 0.05 + lk * 0.04; b = 0.03;
        h += 0.2;
      }
      g.set(x, y, r, gg, b, h);
    }
  }
  return g;
}

function bark(size, seed) {
  const g = new TexGen(size);
  const fbm = makeFbm(seed);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const w = fbm(u, v, 4, 3);
      const ridge = 1 - Math.abs(Math.sin((u * 10 + w * 3) * Math.PI));
      const d = fbm(u * 1, v * 1, 16, 3);
      const h = ridge * 0.7 + d * 0.3;
      const s = 0.07 * (0.5 + 0.8 * h);
      g.set(x, y, s * 1.05, s * 0.95, s * 0.95, h);
    }
  }
  return g;
}

function marble(size, seed) {
  const g = new TexGen(size);
  const fbm = makeFbm(seed), fbm2 = makeFbm(seed + 4);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const w = fbm(u, v, 3, 5);
      const vein = Math.abs(Math.sin((u * 2 + v * 3 + w * 5) * Math.PI));
      const v2 = Math.abs(Math.sin((u * 5 - v * 2 + fbm2(u, v, 4, 4) * 6) * Math.PI));
      const d = fbm2(u, v, 12, 3);
      let r = 0.06 + 0.04 * d, gg = 0.045 + 0.03 * d, b = 0.05 + 0.03 * d;
      const vk = 1 - smoothstep(0.0, 0.05, vein);
      const vk2 = (1 - smoothstep(0.0, 0.025, v2)) * 0.6;
      r += vk * 0.45 + vk2 * 0.2; gg += vk * 0.03; b += vk * 0.05 + vk2 * 0.04;
      g.set(x, y, r, gg, b, 0.5 + d * 0.3 - vk * 0.1);
    }
  }
  return g;
}

function metal(size, seed) {
  const g = new TexGen(size);
  const fbm = makeFbm(seed), rng = mulberry32(seed);
  const scratches = Array.from({ length: 60 }, () => [rng(), rng(), rng() * 0.2 + 0.05, rng() * Math.PI]);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const brushed = fbm(u * 0.1, v, 64, 2);
      const d = fbm(u, v, 6, 4);
      let s = 0.55 + 0.25 * brushed + 0.2 * d;
      let h = 0.5 + 0.1 * brushed;
      for (const sc of scratches) {
        const dx = u - sc[0], dy = v - sc[1];
        const along = dx * Math.cos(sc[3]) + dy * Math.sin(sc[3]);
        const perp = -dx * Math.sin(sc[3]) + dy * Math.cos(sc[3]);
        if (Math.abs(along) < sc[2] && Math.abs(perp) < 0.0016) { s *= 0.7; h -= 0.2; }
      }
      g.set(x, y, s, s, s * 1.04, h);
    }
  }
  return g;
}

function fabric(size, seed) {
  const g = new TexGen(size);
  const fbm = makeFbm(seed);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const weave = (Math.sin(u * size * 0.8) * Math.sin(v * size * 0.8)) * 0.5 + 0.5;
      const d = fbm(u, v, 8, 3);
      const s = 0.82 + 0.1 * weave + 0.12 * d;
      g.set(x, y, s, s, s, weave * 0.3 + d * 0.3);
    }
  }
  return g;
}

// ------------------------------------------------------------------ canvas textures
function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function canvasTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function glowTexture(size = 128, inner = 'rgba(255,255,255,1)', stops = null) {
  const c = canvas(size);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const s = stops || [[0, inner], [0.25, 'rgba(255,255,255,0.55)'], [0.6, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']];
  for (const [o, col] of s) g.addColorStop(o, col);
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return canvasTex(c);
}

function stainedGlass(seed, palette) {
  const W = 256, H = 512;
  const c = canvas(W, H);
  const x = c.getContext('2d');
  const rng = mulberry32(seed);
  x.fillStyle = '#000';
  x.fillRect(0, 0, W, H);
  // pointed arch clip
  x.save();
  x.beginPath();
  x.moveTo(8, H);
  x.lineTo(8, 170);
  x.quadraticCurveTo(10, 30, W / 2, 6);
  x.quadraticCurveTo(W - 10, 30, W - 8, 170);
  x.lineTo(W - 8, H);
  x.closePath();
  x.clip();
  // panes in a diamond lattice
  const cell = 36;
  for (let yy = -cell; yy < H + cell; yy += cell / 2) {
    for (let xx = -cell; xx < W + cell; xx += cell) {
      const ox = ((yy / (cell / 2)) % 2) * (cell / 2);
      const col = palette[Math.floor(rng() * palette.length)];
      x.fillStyle = col;
      x.globalAlpha = 0.65 + rng() * 0.35;
      x.beginPath();
      x.moveTo(xx + ox, yy - cell / 2);
      x.lineTo(xx + ox + cell / 2, yy);
      x.lineTo(xx + ox, yy + cell / 2);
      x.lineTo(xx + ox - cell / 2, yy);
      x.closePath();
      x.fill();
    }
  }
  x.globalAlpha = 1;
  // central figure: a haloed silhouette with a red moon
  const grd = x.createRadialGradient(W / 2, 150, 5, W / 2, 150, 70);
  grd.addColorStop(0, '#ffe2b0');
  grd.addColorStop(0.4, '#c8323e');
  grd.addColorStop(1, 'rgba(80,0,20,0)');
  x.fillStyle = grd;
  x.beginPath();
  x.arc(W / 2, 150, 70, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#120408';
  x.beginPath();
  x.ellipse(W / 2, 175, 18, 22, 0, 0, Math.PI * 2);
  x.fill();
  x.beginPath();
  x.moveTo(W / 2 - 40, 400);
  x.quadraticCurveTo(W / 2 - 30, 220, W / 2, 200);
  x.quadraticCurveTo(W / 2 + 30, 220, W / 2 + 40, 400);
  x.fill();
  // lead lines
  x.strokeStyle = '#050304';
  x.lineWidth = 3;
  for (let yy = 0; yy < H; yy += cell / 2) {
    x.beginPath();
    for (let xx = -cell; xx < W + cell; xx += cell) {
      const ox = ((yy / (cell / 2)) % 2) * (cell / 2);
      x.moveTo(xx + ox - cell / 2, yy);
      x.lineTo(xx + ox, yy - cell / 2);
      x.lineTo(xx + ox + cell / 2, yy);
    }
    x.stroke();
  }
  x.restore();
  x.strokeStyle = '#0a0608';
  x.lineWidth = 10;
  x.beginPath();
  x.moveTo(8, H);
  x.lineTo(8, 170);
  x.quadraticCurveTo(10, 30, W / 2, 6);
  x.quadraticCurveTo(W - 10, 30, W - 8, 170);
  x.lineTo(W - 8, H);
  x.stroke();
  return canvasTex(c);
}

function roseWindow(seed) {
  const S = 512;
  const c = canvas(S);
  const x = c.getContext('2d');
  const rng = mulberry32(seed);
  x.fillStyle = 'rgba(0,0,0,0)';
  x.clearRect(0, 0, S, S);
  const cx = S / 2, cy = S / 2;
  x.save();
  x.beginPath();
  x.arc(cx, cy, S / 2 - 6, 0, Math.PI * 2);
  x.clip();
  x.fillStyle = '#100208';
  x.fillRect(0, 0, S, S);
  const cols = ['#9b1028', '#5a1a7a', '#1d2f8a', '#c23040', '#7a0f2a', '#d8a040'];
  const rings = [[0, 50], [50, 120], [120, 190], [190, 250]];
  rings.forEach(([r0, r1], ri) => {
    const n = 8 + ri * 8;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      x.fillStyle = cols[Math.floor(rng() * cols.length)];
      x.globalAlpha = 0.7 + rng() * 0.3;
      x.beginPath();
      x.arc(cx, cy, r1, a0, a1);
      x.arc(cx, cy, r0, a1, a0, true);
      x.closePath();
      x.fill();
    }
  });
  x.globalAlpha = 1;
  // petals tracery
  x.strokeStyle = '#050204';
  x.lineWidth = 6;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    x.beginPath();
    x.ellipse(cx + Math.cos(a) * 140, cy + Math.sin(a) * 140, 95, 38, a, 0, Math.PI * 2);
    x.stroke();
  }
  for (const r of [50, 120, 190, 250]) {
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.stroke();
  }
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, 50);
  g.addColorStop(0, '#ffd0a0');
  g.addColorStop(1, '#c01830');
  x.fillStyle = g;
  x.beginPath();
  x.arc(cx, cy, 44, 0, Math.PI * 2);
  x.fill();
  x.restore();
  return canvasTex(c);
}

function moonTexture() {
  const S = 512;
  const c = canvas(S);
  const x = c.getContext('2d');
  const fbm = makeFbm(77);
  const img = x.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let xx = 0; xx < S; xx++) {
      const u = xx / S - 0.5, v = y / S - 0.5;
      const r = Math.hypot(u, v) * 2;
      const i = (y * S + xx) * 4;
      if (r > 1) { d[i + 3] = 0; continue; }
      const n = fbm(xx / S, y / S, 4, 6);
      const n2 = fbm(xx / S + 0.3, y / S, 12, 3);
      const limb = Math.pow(1 - r * r, 0.35);
      const mare = smoothstep(0.45, 0.62, n) * 0.45;
      const k = limb * (1 - mare) * (0.82 + 0.3 * n2);
      d[i] = clamp(255 * k * 1.0, 0, 255);
      d[i + 1] = clamp(255 * k * 0.36, 0, 255);
      d[i + 2] = clamp(255 * k * 0.3, 0, 255);
      d[i + 3] = 255 * smoothstep(1, 0.985, r);
    }
  }
  x.putImageData(img, 0, 0);
  return canvasTex(c);
}

/** Arc gradient for anime sword slashes: u = along the arc (head at u=1), v = radial. */
function slashTexture() {
  const W = 256, H = 64;
  const c = canvas(W, H);
  const x = c.getContext('2d');
  const img = x.createImageData(W, H);
  for (let yy = 0; yy < H; yy++) {
    for (let xx = 0; xx < W; xx++) {
      const u = xx / (W - 1), v = yy / (H - 1);
      const along = Math.pow(u, 1.6);
      const edge = Math.pow(1 - Math.abs(v - 0.78) / 0.78, 3) * smoothstep(1, 0.9, v);
      const core = Math.pow(Math.max(0, 1 - Math.abs(v - 0.85) / 0.12), 2);
      const a = clamp(along * (edge * 0.75 + core), 0, 1);
      const i = (yy * W + xx) * 4;
      const white = core * along;
      img.data[i] = 255;
      img.data[i + 1] = 255 * (0.35 + 0.65 * white);
      img.data[i + 2] = 255 * (0.35 + 0.65 * white);
      img.data[i + 3] = 255 * a;
    }
  }
  x.putImageData(img, 0, 0);
  return canvasTex(c);
}

function ringTexture() {
  const S = 256;
  const c = canvas(S);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.18)');
  g.addColorStop(0.82, 'rgba(255,255,255,0.28)');
  g.addColorStop(0.92, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  return canvasTex(c);
}

function runeCircleTexture() {
  const S = 512;
  const c = canvas(S);
  const x = c.getContext('2d');
  x.translate(S / 2, S / 2);
  x.strokeStyle = 'rgba(255,255,255,0.95)';
  x.shadowColor = 'white';
  x.shadowBlur = 8;
  x.lineWidth = 5;
  for (const r of [240, 205, 120]) {
    x.beginPath();
    x.arc(0, 0, r, 0, Math.PI * 2);
    x.stroke();
  }
  x.lineWidth = 3;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const b = ((i + 3) / 7) * Math.PI * 2;
    x.beginPath();
    x.moveTo(Math.cos(a) * 205, Math.sin(a) * 205);
    x.lineTo(Math.cos(b) * 205, Math.sin(b) * 205);
    x.stroke();
  }
  x.font = 'bold 26px serif';
  x.fillStyle = 'white';
  const glyphs = 'ᚱᛟᛞᚾᛖᛗᛁᚦᚹᛉᛊᛏᛒᛚᛜᛞᚨᚠᚢᚲᚷ';
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    x.save();
    x.rotate(a);
    x.fillText(glyphs[i % glyphs.length], -8, -214);
    x.restore();
  }
  return canvasTex(c);
}

function bannerTexture() {
  const W = 128, H = 384;
  const c = canvas(W, H);
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#4a0812');
  g.addColorStop(1, '#22030a');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.strokeStyle = '#a89a80';
  x.lineWidth = 4;
  x.strokeRect(8, 8, W - 16, H - 40);
  x.fillStyle = '#b8a888';
  // crescent + fang emblem
  x.beginPath();
  x.arc(W / 2, 120, 34, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#3a060f';
  x.beginPath();
  x.arc(W / 2 + 12, 112, 30, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#b8a888';
  x.beginPath();
  x.moveTo(W / 2 - 18, 190);
  x.lineTo(W / 2 - 10, 230);
  x.lineTo(W / 2 - 2, 190);
  x.moveTo(W / 2 + 2, 190);
  x.lineTo(W / 2 + 10, 230);
  x.lineTo(W / 2 + 18, 190);
  x.fill();
  // tattered bottom
  x.clearRect(0, H - 32, W, 32);
  x.fillStyle = '#22030a';
  x.beginPath();
  x.moveTo(0, H - 32);
  for (let i = 0; i <= 8; i++) x.lineTo((i / 8) * W, H - 32 + (i % 2 ? 30 : 4));
  x.lineTo(W, H - 32);
  x.fill();
  return canvasTex(c);
}

function paperTexture() {
  const S = 128;
  const c = canvas(S);
  const x = c.getContext('2d');
  x.fillStyle = '#b9a78a';
  x.fillRect(0, 0, S, S);
  x.fillStyle = 'rgba(60,30,20,0.6)';
  for (let i = 0; i < 9; i++) x.fillRect(16, 20 + i * 10, 70 + Math.random() * 30, 2);
  x.fillStyle = 'rgba(120,10,20,0.6)';
  x.beginPath();
  x.arc(90, 100, 14, 0, Math.PI * 2);
  x.fill();
  return canvasTex(c);
}

// ------------------------------------------------------------------ library
/**
 * Build all textures. `size` is 256 (low quality) or 512. `progress(fraction)` lets the loading
 * screen update; generation yields between textures to keep the page responsive.
 */
export async function buildTextureLibrary(size, progress = () => {}) {
  const steps = [
    ['floor', () => bricks(size, { cols: 4, rows: 4, seed: 11, base: 0.26, mortar: 0.08, bevel: 0.15, grime: 0.45, crack: 0.5 }).toTextures(3)],
    ['wall', () => bricks(size, { cols: 3, rows: 7, seed: 21, base: 0.24, mortar: 0.06, bevel: 0.1, grime: 0.35, crack: 0.25, streaks: 0.5, tint: [1, 0.97, 0.95] }).toTextures(3.5)],
    ['cobble', () => cobble(size, 31).toTextures(4)],
    ['wood', () => planks(size, 41).toTextures(2.5)],
    ['darkwood', () => planks(size, 43, { count: 4, base: [0.11, 0.07, 0.05] }).toTextures(2.5)],
    ['plaster', () => plaster(size, 51).toTextures(1.5)],
    ['roof', () => shingles(size, 61).toTextures(3)],
    ['dirt', () => ground(size, 71, { base: [0.12, 0.09, 0.075], leaves: 0.25, moss: 0.15 }).toTextures(1.5)],
    ['forest', () => ground(size, 72, { base: [0.085, 0.075, 0.065], leaves: 0.7, moss: 0.4 }).toTextures(2)],
    ['bark', () => bark(size, 81).toTextures(3)],
    ['marble', () => marble(size, 91).toTextures(1)],
    ['metal', () => metal(Math.min(size, 256), 95).toTextures(1.2)],
    ['fabric', () => fabric(128, 99).toTextures(1)],
  ];
  const lib = {};
  for (let i = 0; i < steps.length; i++) {
    const [name, fn] = steps[i];
    lib[name] = fn();
    progress((i + 1) / (steps.length + 1));
    await new Promise((r) => setTimeout(r, 0));
  }
  const glassPalettes = [
    ['#7a0f22', '#a3152c', '#3b1660', '#1b2a72', '#c0283a', '#4a0a18'],
    ['#2a1a6a', '#4a2090', '#7a0f22', '#1b3a82', '#a3152c', '#d09040'],
  ];
  lib.glass = [stainedGlass(5, glassPalettes[0]), stainedGlass(9, glassPalettes[1])];
  lib.rose = roseWindow(3);
  lib.moon = moonTexture();
  lib.glow = glowTexture(128);
  lib.slash = slashTexture();
  lib.ring = ringTexture();
  lib.runes = runeCircleTexture();
  lib.banner = bannerTexture();
  lib.paper = paperTexture();
  progress(1);
  return lib;
}
